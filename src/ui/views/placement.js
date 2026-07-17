/* ui/views/placement.js - the optional onboarding placement check (issue #51).
 *
 * A short adaptive diagnostic offered at first run alongside the manual grade
 * picker (the manual choice stays the default/override). It walks one
 * representative question per grade band in ascending difficulty, grading each
 * with the standard choice flow. Every answer is recorded through the store so
 * the SRS map is genuinely seeded - placement answers are not wasted. The walk
 * stops early after two consecutive failed bands so a struggling beginner never
 * has to answer Grade 8 questions, then it SUGGESTS a starting grade the learner
 * can accept or override.
 *
 * This is rendered directly (not via a hash route) as a transient step of
 * onboarding; on finish it sets the grade and hands back to the router.
 *
 * Public surface: global `MTT.ui.views.placement`.
 */
(function (global) {
  "use strict";

  function render(main, ctx) {
    const C = ctx.C;
    const store = ctx.store;
    const session = ctx.session;
    const rng = ctx.rng.create(ctx.seed != null ? ctx.seed : undefined);
    const bands = session.placementBands(ctx.content);

    let bandIdx = 0;
    const results = []; // attempted bands: { grade, correct, total }
    let activeKeyHandler = null;

    startBand();

    // Direct-rendered (no router entry), so return a teardown the caller can run
    // to drop the stray document-level key listener if it navigates away.
    function detachKeys() {
      if (activeKeyHandler) { document.removeEventListener("keydown", activeKeyHandler); activeKeyHandler = null; }
    }

    function generateQuestion(topic) {
      const picks = session.assemble([topic], 1, rng);
      if (!picks.length) return null;
      const q = picks[0].q;
      // Placement is choice-only; a mic/tapping task can't be graded here.
      if (q.micTask) return null;
      return q;
    }

    function startBand() {
      if (bandIdx >= bands.length) return showSuggestion();
      const band = bands[bandIdx];
      const state = { correct: 0, total: 0, qi: 0 };
      askQuestion(band, state);
    }

    function askQuestion(band, state) {
      if (state.qi >= band.topics.length) return endBand(band, state);
      const topic = band.topics[state.qi];
      const q = generateQuestion(topic);
      if (!q) { state.qi++; return askQuestion(band, state); }
      renderQuestion(band, state, topic, q);
    }

    function endBand(band, state) {
      // A band that produced no gradeable question is skipped rather than
      // counted as a failure (which would distort the early-exit streak).
      if (state.total > 0) results.push({ grade: band.grade, correct: state.correct, total: state.total });
      if (results.length && session.shouldStopPlacement(results)) return showSuggestion();
      bandIdx++;
      startBand();
    }

    function renderQuestion(band, state, topic, q) {
      detachKeys();
      C.clear(main);
      const questionStart = ctx.now();
      let answered = false;

      const answeredBands = results.length;
      const view = C.el(`<div class="view placement-view"></div>`);
      view.appendChild(C.el(`
        <div class="hero">
          <h1 tabindex="-1">Placement check</h1>
          <p>A quick sense of where to start - answer as many as you can, and skip anything you haven't met yet.</p>
        </div>`));
      view.appendChild(C.el(
        `<div class="topic-label">Grade ${band.grade} · ${topic.title}`
        + `<span class="muted"> (question ${answeredBands + 1})</span></div>`));

      const prompt = C.el(`<div class="quiz-prompt"></div>`);
      try { prompt.innerHTML = q.prompt; } catch { state.qi++; return askQuestion(band, state); }
      if (q.a11yText) { prompt.setAttribute("aria-label", q.a11yText); prompt.setAttribute("role", "group"); }
      view.appendChild(prompt);

      const choiceButtons = [];
      const wrap = C.el(`<div class="choices" role="group" aria-label="Answer choices" style="margin-top:16px"></div>`);
      q.choices.forEach((choice, i) => {
        const btn = document.createElement("button");
        btn.className = "choice";
        btn.type = "button";
        btn.innerHTML = `<span class="choice-key" aria-hidden="true">${i + 1}</span> ${choice}`;
        btn._choice = choice;
        btn.addEventListener("click", () => answer(choice === q.answer, btn));
        wrap.appendChild(btn);
        choiceButtons.push(btn);
      });
      view.appendChild(wrap);

      // Skipping is a real placement signal (the learner hasn't met this yet):
      // graded as a miss so it counts against the band, honestly seeding SRS.
      const skipBtn = C.button("Skip - haven't learnt this", () => answer(false, null), { className: "ghost" });
      skipBtn.classList.add("placement-skip");
      view.appendChild(skipBtn);

      main.appendChild(view);
      prompt.setAttribute("tabindex", "-1");
      C.focus(view.querySelector("h1"));

      function onKeydown(e) {
        if (answered) return;
        if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= choiceButtons.length) {
          e.preventDefault();
          const b = choiceButtons[n - 1];
          answer(b._choice === q.answer, b);
        }
      }
      activeKeyHandler = onKeydown;
      document.addEventListener("keydown", onKeydown);

      function answer(correct, pickedBtn) {
        if (answered) return;
        answered = true;
        detachKeys();
        const responseMs = ctx.now() - questionStart;
        // Honest recording seeds the SRS map through the normal path, including
        // the guess-guard `choices` plumbing, so placement answers carry into
        // the learner's first real sessions.
        store.recordAnswer(topic.id, { correct, responseMs, now: ctx.now(), choices: q.choices.length });

        state.total++;
        if (correct) state.correct++;

        choiceButtons.forEach((c) => {
          c.disabled = true;
          if (c._choice === q.answer) c.classList.add("correct");
          else if (c === pickedBtn) c.classList.add("wrong");
        });
        skipBtn.disabled = true;

        const verdict = correct
          ? `<span class="ok">✓ Correct</span>`
          : `<span class="no">✗ Not quite</span> - the answer is <b>${q.answer}</b>.`;
        const why = q.explanation ? `<div class="why-line">${q.explanation}</div>` : "";
        view.appendChild(C.el(`<div class="reveal ${correct ? "good" : "bad"}" role="status">${verdict}${why}</div>`));

        const next = C.button("Next", () => { state.qi++; askQuestion(band, state); });
        next.style.marginTop = "16px";
        view.appendChild(next);
        C.focus(next);
      }
    }

    function showSuggestion() {
      detachKeys();
      C.clear(main);
      const suggested = session.placementSuggestion(results);

      const view = C.el(`<div class="view placement-result"></div>`);
      view.appendChild(C.el(`
        <div class="card center onboard-card">
          <h1 tabindex="-1" style="margin-top:0">We suggest Grade ${suggested}</h1>
          <p class="muted">Based on your answers. It sets your daily session - you can change it any time in the header, so pick whatever feels right.</p>
        </div>`));

      // Per-band recap so the suggestion is legible, not a black box.
      if (results.length) {
        const recap = C.el(`<div class="card"><h3 style="margin-top:0">How you did</h3></div>`);
        const list = C.el(`<div class="breakdown"></div>`);
        results.forEach((r) => {
          const passed = (r.total ? r.correct / r.total : 0) >= session.PLACEMENT_PASS;
          const cls = passed ? "ok" : "bad";
          const mark = passed ? "✓" : "✗";
          list.appendChild(C.el(`<div class="breakdown-row ${cls}">`
            + `<span class="breakdown-mark" aria-hidden="true">${mark}</span>`
            + `<span class="breakdown-title">Grade ${r.grade}</span>`
            + `<span class="breakdown-score">${r.correct}/${r.total}</span></div>`));
        });
        recap.appendChild(list);
        view.appendChild(recap);
      }

      const accept = C.el(`<div class="card center start-card"></div>`);
      accept.appendChild(C.button(`Start at Grade ${suggested}`, () => choose(suggested)));
      accept.appendChild(C.el(`<p class="muted" style="margin:14px 0 6px">Or choose a different grade:</p>`));
      const picker = C.el(`<div class="grade-picker" role="group" aria-label="Choose a different grade"></div>`);
      ctx.content.grades.forEach((g) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "grade-pick" + (g.grade === suggested ? " on" : "");
        b.textContent = String(g.grade);
        b.setAttribute("aria-label", "Grade " + g.grade);
        b.addEventListener("click", () => choose(g.grade));
        picker.appendChild(b);
      });
      accept.appendChild(picker);
      view.appendChild(accept);

      main.appendChild(view);
      C.focus(view.querySelector("h1"));
    }

    function choose(grade) {
      store.setSetting("grade", grade);
      store.setSetting("gradeChosen", true);
      ctx.syncHeader();
      ctx.router.navigate("home", undefined, { force: true });
    }
  }

  const api = { render };

  global.MTT = global.MTT || {};
  global.MTT.ui = global.MTT.ui || {};
  global.MTT.ui.views = global.MTT.ui.views || {};
  global.MTT.ui.views.placement = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
