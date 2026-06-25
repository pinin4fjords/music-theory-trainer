/* ui/views/quiz.js - the practice loop.
 *
 * Assembles a session (core/session.js), then walks the learner through it. Each
 * answer:
 *   - is timed (response time feeds the SRS),
 *   - is recorded against the topic's SRS card,
 *   - reveals the correct choice plus an explanation, and - on a wrong answer -
 *     a DIAGNOSTIC hint about the likely confusion (core/diagnose.js),
 *   - is announced via ARIA-live for screen-reader users.
 *
 * Fully keyboard-operable: choices are buttons (Tab + Enter/Space), number keys
 * 1-9 select a choice, and focus moves to the feedback then the Next button.
 * Rendering each question is guarded so one bad item can never kill the session.
 *
 * Public surface: global `MTT.ui.views.quiz`.
 */
(function (global) {
  "use strict";

  function render(main, ctx, arg) {
    const C = ctx.C;
    const single = arg && arg.single;
    const settings = ctx.store.settings();
    const seed = (ctx.seed != null ? ctx.seed : undefined);
    const rng = ctx.rng.create(seed);
    const now = ctx.now();

    const session = single
      ? ctx.session.buildSingle(Object.assign({}, single), rng, ctx.session.SESSION_LEN)
      : ctx.session.build({ content: ctx.content, settings, srsMap: ctx.store.srsMap(), rng, now });

    if (!session.length) {
      main.appendChild(C.el(`
        <div class="view center card">
          <div style="font-size:2rem" aria-hidden="true">🎼</div>
          <h1>No drills for Grade ${settings.grade} yet</h1>
          <p class="muted">Practice questions for this grade are still being authored. Try a lower grade, or explore the lessons.</p>
        </div>`));
      const back = C.button("Browse lessons", () => ctx.router.navigate("learn"), { className: "" });
      main.querySelector(".view").appendChild(back);
      return;
    }

    let idx = 0;
    let score = 0;
    let questionStart = ctx.now();

    nextQuestion();

    function nextQuestion() {
      if (idx >= session.length) return finish();
      C.clear(main);
      const { topic, q } = session[idx];
      let answered = false;
      questionStart = ctx.now();

      const view = C.el(`<div class="view"></div>`);

      const dots = session.map((_, i) =>
        `<span class="${i < idx ? "done" : i === idx ? "now" : ""}"></span>`).join("");
      view.appendChild(C.el(`<div class="progress-dots" role="img" aria-label="Question ${idx + 1} of ${session.length}">${dots}</div>`));
      view.appendChild(C.el(`<div class="muted" style="font-size:.8rem">Grade ${topic.grade} · ${topic.title}</div>`));

      const prompt = C.el(`<div class="quiz-prompt"></div>`);
      try {
        prompt.innerHTML = q.prompt;
      } catch {
        // Bad prompt markup: skip this question rather than break the session.
        idx++;
        return nextQuestion();
      }
      // Screen-reader text alternative for notation-bearing prompts.
      if (q.a11yText) {
        prompt.setAttribute("aria-label", q.a11yText);
        prompt.setAttribute("role", "group");
      }
      view.appendChild(prompt);

      if (q.audio) {
        const ab = C.playButton("Hear it", () => safe(q.audio));
        ab.setAttribute("aria-label", "Replay the sound for this question");
        view.appendChild(ab);
        if (ctx.audio.isEnabled()) safe(q.audio);
      }

      const wrap = C.el(`<div class="choices" role="group" aria-label="Answer choices" style="margin-top:16px"></div>`);
      const choiceButtons = [];

      q.choices.forEach((choice, i) => {
        const btn = document.createElement("button");
        btn.className = "choice";
        btn.type = "button";
        // Number prefix doubles as a keyboard shortcut hint.
        btn.innerHTML = `<span class="choice-key" aria-hidden="true">${i + 1}</span> ${choice}`;
        btn._choice = choice;
        btn.addEventListener("click", () => reveal(choice === q.answer ? "correct" : "wrong", btn));
        wrap.appendChild(btn);
        choiceButtons.push(btn);
      });
      view.appendChild(wrap);

      const idkBtn = document.createElement("button");
      idkBtn.className = "idk-btn";
      idkBtn.type = "button";
      idkBtn.textContent = "I don't know - explain";
      idkBtn.addEventListener("click", () => reveal("idk", null));
      view.appendChild(idkBtn);

      main.appendChild(view);

      // Keyboard shortcuts: 1-9 pick a choice while unanswered.
      view.addEventListener("keydown", onKeydown);
      function onKeydown(e) {
        if (answered) return;
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= choiceButtons.length) {
          e.preventDefault();
          const btn = choiceButtons[n - 1];
          reveal(btn._choice === q.answer ? "correct" : "wrong", btn);
        }
      }

      function reveal(kind, pickedBtn) {
        if (answered) return;
        answered = true;
        const correct = kind === "correct";
        if (correct) score++;
        const responseMs = ctx.now() - questionStart;
        ctx.store.recordAnswer(topic.id, { correct, responseMs, now: ctx.now() });

        choiceButtons.forEach((c) => {
          c.disabled = true;
          if (c._choice === q.answer) c.classList.add("correct");
          else if (c === pickedBtn) c.classList.add("wrong");
        });
        if (idkBtn) idkBtn.disabled = true;

        const verdict = correct
          ? `<span class="ok">✓ Correct</span>`
          : kind === "wrong"
            ? `<span class="no">✗ Not quite</span> - the answer is <b>${q.answer}</b>.`
            : `<span class="idk-label">The answer is <b>${q.answer}</b>.</span>`;
        const diag = !correct ? safeDiagnose(q, pickedBtn ? pickedBtn._choice : null) : null;
        const why = q.explanation ? `<div class="why-line">${q.explanation}</div>` : "";
        const diagLine = diag ? `<div class="why-line diag-line">${diag}</div>` : "";
        const cls = correct ? "good" : kind === "wrong" ? "bad" : "idk";
        const revealEl = C.el(`<div class="reveal ${cls}" role="status">${verdict}${diagLine}${why}</div>`);
        view.appendChild(revealEl);

        C.announce(
          (correct ? "Correct. " : "Not quite. The answer is " + q.answer + ". ")
          + (q.explanation ? stripTags(q.explanation) : ""),
        );

        const last = idx === session.length - 1;
        const next = C.button(last ? "Finish" : "Next", () => { idx++; nextQuestion(); });
        next.style.marginTop = "16px";
        view.appendChild(next);
        C.focus(next);
      }
    }

    function finish() {
      const first = !single && ctx.store.recordSessionDay(ctx.now());
      C.clear(main);
      const st = ctx.store.get();
      const streakLine = single ? "" :
        `Streak: 🔥 ${st.streak} day${st.streak === 1 ? "" : "s"}.` + (first ? " (counted for today)" : "");
      main.appendChild(C.el(`
        <div class="view center card">
          <div style="font-size:2.4rem" aria-hidden="true">🎉</div>
          <h1>Nice work</h1>
          <p class="muted">You scored <b>${score} / ${session.length}</b>. ${streakLine}</p>
        </div>`));
      const row = C.el(`<div class="center" style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap"></div>`);
      row.appendChild(C.button("Practise again", () => render(main, ctx, arg)));
      row.appendChild(C.button("Back home", () => ctx.router.navigate("home"), { className: "ghost" }));
      main.querySelector(".view").appendChild(row);
      C.announce(`Session complete. You scored ${score} out of ${session.length}.`, true);
    }

    function safe(fn) {
      try { fn(); } catch { /* audio/render failures must not break the quiz */ }
    }
    function safeDiagnose(q, picked) {
      try { return ctx.diagnose.feedback(q, picked); } catch { return null; }
    }
    function stripTags(html) {
      return String(html).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
    }
  }

  const api = { render };

  global.MTT = global.MTT || {};
  global.MTT.ui = global.MTT.ui || {};
  global.MTT.ui.views = global.MTT.ui.views || {};
  global.MTT.ui.views.quiz = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
