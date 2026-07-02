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
 * Mic-input questions (q.micTask): the standard choice buttons are replaced by a
 * pitch-detection panel that auto-detects success. Self-report buttons are shown
 * as a fallback (for when microphone access is unavailable or detection fails).
 *
 * Public surface: global `MTT.ui.views.quiz`.
 */
(function (global) {
  "use strict";

  // --- Mic task panel -------------------------------------------------------

  // Single-pitch variant: detect one held note.
  function renderMicPitch(view, q, C, ctx, onResult) {
    const task = q.micTask;
    const ai = global.MTT && global.MTT.audioInput;
    let stopDetector = null;
    let holdTimer = null;
    let holdStarted = false;

    const panel = C.el(`<div class="mic-panel"></div>`);
    const meter = C.pitchMeter(task.targetName || "?");
    const statusEl = C.el(`<p class="mic-status" aria-live="polite" aria-atomic="true"></p>`);

    const startBtn = document.createElement("button");
    startBtn.className = "btn mic-start-btn";
    startBtn.type = "button";
    startBtn.textContent = "🎤 Start singing";

    function stop() {
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
      if (stopDetector) { try { stopDetector(); } catch { /* ok */ } stopDetector = null; }
      holdStarted = false;
    }

    if (!ai || !ai.isAvailable()) {
      panel.appendChild(C.el(`<p class="muted" style="font-size:.9em">Microphone not available — listen and self-report below.</p>`));
      view.appendChild(panel);
      return stop;
    }

    startBtn.addEventListener("click", async function () {
      startBtn.disabled = true;
      startBtn.textContent = "🎤 Listening…";
      statusEl.textContent = "Requesting microphone access…";

      try {
        stopDetector = await ai.startPitchDetection(function ({ midi, cents, clarity }) {
          meter.update({ midi, cents, clarity });

          if (midi == null) {
            if (holdStarted) {
              clearTimeout(holdTimer); holdTimer = null;
              holdStarted = false;
              statusEl.textContent = "Keep singing — hold the note steady.";
            }
            return;
          }

          const diff = Math.abs(midi - task.targetMidi);
          const tol = task.toleranceSemitones != null ? task.toleranceSemitones : 1.0;
          const onPitch = diff <= tol;

          if (onPitch) {
            statusEl.textContent = "On pitch!";
            if (!holdStarted) {
              holdStarted = true;
              const minHold = task.minHoldMs != null ? task.minHoldMs : 600;
              holdTimer = setTimeout(function () {
                stop();
                startBtn.textContent = "🎤 Done";
                statusEl.textContent = "Great — pitch detected correctly.";
                onResult(q.answer);
              }, minHold);
            }
          } else {
            if (holdStarted) {
              clearTimeout(holdTimer); holdTimer = null;
              holdStarted = false;
            }
            const semis = midi - task.targetMidi;
            statusEl.textContent = semis > 0 ? "A little too high — try coming down." : "A little too low — try coming up.";
          }
        });
        statusEl.textContent = "Sing the note — hold it steady.";
      } catch (err) {
        startBtn.disabled = false;
        startBtn.textContent = "🎤 Start singing";
        statusEl.textContent = "Could not access microphone — use self-report below.";
      }
    });

    panel.appendChild(meter);
    panel.appendChild(startBtn);
    panel.appendChild(statusEl);
    view.appendChild(panel);
    return stop;
  }

  // Sequence variant: listen to the whole phrase, then score it.
  //
  // Flow: user sings freely → silence triggers → app segments the pitch buffer
  // into notes → shows expected vs detected with per-note and interval scores →
  // user can try again or accept.
  //
  // task.targets = [{midi, name, staffHtml}, ...]
  function renderMicSequence(view, q, C, ctx, onResult) {
    const task = q.micTask;
    const targets = task.targets;
    const ai = global.MTT && global.MTT.audioInput;

    // ~7 consecutive null readings at 80 ms/poll ≈ 560 ms of silence.
    const SILENCE_READINGS = 7;
    const MIN_CLARITY = 0.78;

    let stopDetector = null;
    let hasSang = false;
    let finished = false;
    let silenceCount = 0;
    let readings = []; // {midi, clarity}

    const panel = C.el(`<div class="mic-panel mic-sequence-panel"></div>`);
    const meter = C.pitchMeter("–");
    const statusEl = C.el(`<p class="mic-status" aria-live="polite" aria-atomic="true">Press start, then sing the full phrase.</p>`);
    const resultEl = C.el(`<div class="mic-seq-result"></div>`);
    resultEl.hidden = true;

    function stopMic() {
      if (stopDetector) { try { stopDetector(); } catch { /* ok */ } stopDetector = null; }
    }

    // Split a flat pitch-reading buffer into note groups by detecting pitch jumps
    // of more than 1.5 semitones. Groups shorter than 2 readings are discarded
    // (transitions / noise). Returns array of MIDI integers.
    function segmentNotes(rds) {
      const clear = rds.filter(function (r) { return r.midi != null && r.clarity >= MIN_CLARITY; });
      if (!clear.length) return [];
      const groups = [];
      let grp = [clear[0]];
      for (let i = 1; i < clear.length; i++) {
        if (Math.abs(clear[i].midi - grp[grp.length - 1].midi) > 1.5) {
          if (grp.length >= 2) groups.push(grp);
          grp = [];
        }
        grp.push(clear[i]);
      }
      if (grp.length >= 2) groups.push(grp);
      return groups.map(function (g) {
        return Math.round(g.reduce(function (s, r) { return s + r.midi; }, 0) / g.length);
      });
    }

    function noteLabel(midi) {
      const inp = global.MTT.audioInput;
      return inp ? inp.midiToName(midi) : String(midi);
    }

    function showResult(detected) {
      const expected = targets.map(function (t) { return t.midi; });

      // Per-note exact match (within 1 semitone).
      const noteMatches = expected.map(function (exp, i) {
        return detected[i] != null && Math.abs(detected[i] - exp) <= 1;
      });
      const exact = noteMatches.filter(Boolean).length;

      // Interval match: same direction and within 1 semitone of step size.
      let intMatch = 0;
      const intTotal = expected.length - 1;
      for (let i = 0; i < Math.min(detected.length, expected.length) - 1; i++) {
        const ds = detected[i + 1] - detected[i];
        const es = expected[i + 1] - expected[i];
        if (Math.sign(ds) === Math.sign(es) && Math.abs(Math.abs(ds) - Math.abs(es)) <= 1) {
          intMatch++;
        }
      }

      let html = `<div class="seq-compare">`;
      html += `<div class="seq-row"><span class="seq-row-label">Expected</span>`;
      targets.forEach(function (t, i) {
        html += `<span class="seq-note exp">${t.name}</span>`;
        if (i < targets.length - 1) html += `<span class="seq-arrow">→</span>`;
      });
      html += `</div>`;
      html += `<div class="seq-row"><span class="seq-row-label">You sang</span>`;
      if (!detected.length) {
        html += `<span class="muted" style="font-style:italic">nothing detected</span>`;
      } else {
        detected.forEach(function (midi, i) {
          const match = expected[i] != null && Math.abs(midi - expected[i]) <= 1;
          html += `<span class="seq-note ${match ? "match" : "miss"}">${noteLabel(midi)}</span>`;
          if (i < detected.length - 1) html += `<span class="seq-arrow">→</span>`;
        });
      }
      html += `</div></div>`;

      if (detected.length) {
        const allGood = exact === expected.length && detected.length === expected.length;
        const noteScore = allGood ? `All ${expected.length} notes correct` : `${exact} of ${expected.length} notes matched`;
        const intScore = intTotal > 0 ? ` · ${intMatch}/${intTotal} intervals correct` : "";
        const cls = allGood ? "ok" : exact > 0 ? "part" : "bad";
        html += `<p class="seq-score ${cls}">${noteScore}${intScore}</p>`;
      }

      resultEl.innerHTML = html;
      resultEl.hidden = false;

      const allGood = exact === expected.length && detected.length === expected.length;
      const actRow = C.el(`<div class="seq-btn-row"></div>`);
      actRow.appendChild(C.button("↺ Try again", function () {
        resultEl.hidden = true;
        actRow.remove();
        readings = [];
        hasSang = false;
        finished = false;
        silenceCount = 0;
        startBtn.disabled = false;
        startBtn.textContent = "🎤 Sing again";
        statusEl.textContent = "Press start, then sing the full phrase.";
      }));
      actRow.appendChild(C.button(allGood ? "Next →" : "Accept & continue", function () {
        stopMic();
        onResult(q.answer);
      }, { className: allGood ? "" : "ghost" }));
      panel.appendChild(actRow);
    }

    if (!ai || !ai.isAvailable()) {
      panel.appendChild(C.el(`<p class="muted" style="font-size:.9em">Microphone not available — use self-report below.</p>`));
      view.appendChild(panel);
      return stopMic;
    }

    const startBtn = document.createElement("button");
    startBtn.className = "btn mic-start-btn";
    startBtn.type = "button";
    startBtn.textContent = "🎤 Start singing";

    startBtn.addEventListener("click", async function () {
      startBtn.disabled = true;
      startBtn.textContent = "🎤 Listening…";
      statusEl.textContent = "Requesting microphone access…";
      readings = [];
      hasSang = false;
      finished = false;
      silenceCount = 0;

      try {
        stopDetector = await ai.startPitchDetection(function ({ midi, cents, clarity }) {
          if (finished) return;
          meter.update({ midi, cents, clarity });
          readings.push({ midi: midi, clarity: clarity || 0 });

          const clear = midi != null && (clarity || 0) >= MIN_CLARITY;
          if (clear) {
            hasSang = true;
            silenceCount = 0;
            statusEl.textContent = "Singing…";
          } else if (hasSang) {
            silenceCount++;
            if (silenceCount >= SILENCE_READINGS) {
              finished = true;
              stopMic();
              startBtn.textContent = "🎤 Done";
              statusEl.textContent = "";
              showResult(segmentNotes(readings));
            }
          }
        });
        statusEl.textContent = "Sing the whole phrase, then pause — it will score automatically.";
      } catch (err) {
        startBtn.disabled = false;
        startBtn.textContent = "🎤 Start singing";
        statusEl.textContent = "Could not access microphone — use self-report below.";
      }
    });

    panel.appendChild(meter);
    panel.appendChild(startBtn);
    panel.appendChild(statusEl);
    panel.appendChild(resultEl);
    view.appendChild(panel);
    return stopMic;
  }

  // Dispatches to the appropriate mic handler based on task type.
  function renderMicTask(view, q, C, ctx, onResult) {
    if (q.micTask.type === "sequence") return renderMicSequence(view, q, C, ctx, onResult);
    return renderMicPitch(view, q, C, ctx, onResult);
  }

  // --- Main render ----------------------------------------------------------

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
    const tally = {}; // topicId -> { title, grade, correct, total } for the finish summary

    nextQuestion();

    function nextQuestion() {
      if (idx >= session.length) return finish();
      C.clear(main);
      const { topic, q } = session[idx];
      let answered = false;
      questionStart = ctx.now();
      let stopMic = null; // cleanup function for mic sessions

      const view = C.el(`<div class="view"></div>`);

      const dots = session.map((_, i) =>
        `<span class="${i < idx ? "done" : i === idx ? "now" : ""}"></span>`).join("");
      view.appendChild(C.el(
        `<div class="progress-row" role="img" aria-label="Question ${idx + 1} of ${session.length}">`
        + `<div class="progress-dots" aria-hidden="true">${dots}</div>`
        + `<span class="progress-count">${idx + 1} / ${session.length}</span></div>`));
      view.appendChild(C.el(`<div class="topic-label">Grade ${topic.grade} · ${topic.title}</div>`));

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

      // Mic-task: pitch-detection panel instead of numbered choice buttons.
      // Self-report ghost buttons shown as fallback below the meter.
      let choiceButtons = [];
      let idkBtn = null;

      if (q.micTask) {
        stopMic = renderMicTask(view, q, C, ctx, function (detected) {
          if (!answered) reveal(detected === q.answer ? "correct" : "wrong", null);
        });
        const selfReport = C.el(`<div class="mic-self-report"></div>`);
        selfReport.appendChild(C.el(`<span class="muted" style="font-size:.88em;display:block;margin-bottom:6px">Self-report (if mic unavailable):</span>`));
        q.choices.forEach((choice) => {
          const sb = C.button(choice, () => {
            if (!answered) reveal(choice === q.answer ? "correct" : "wrong", null);
          }, { className: "ghost" });
          selfReport.appendChild(sb);
        });
        view.appendChild(selfReport);
      } else {
        const wrap = C.el(`<div class="choices" role="group" aria-label="Answer choices" style="margin-top:16px"></div>`);

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

        idkBtn = document.createElement("button");
        idkBtn.className = "idk-btn";
        idkBtn.type = "button";
        idkBtn.textContent = "I don't know - explain";
        idkBtn.addEventListener("click", () => reveal("idk", null));
        view.appendChild(idkBtn);
      }

      main.appendChild(view);

      // Keyboard shortcuts: 1-9 pick a choice while unanswered (only for standard choice questions).
      if (!q.micTask) {
        view.addEventListener("keydown", onKeydown);
      }
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
        if (stopMic) { try { stopMic(); } catch { /* ok */ } stopMic = null; }
        const correct = kind === "correct";
        if (correct) score++;
        const responseMs = ctx.now() - questionStart;
        ctx.store.recordAnswer(topic.id, { correct, responseMs, now: ctx.now() });

        const t = tally[topic.id] || (tally[topic.id] = { title: topic.title, grade: topic.grade, correct: 0, total: 0 });
        t.total++;
        if (correct) t.correct++;

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
        // Dig deeper: thread into the matching "Why" explainer when one exists.
        if (topic.explainer) {
          const ex = (ctx.content.explainers || []).find((e) => e.id === topic.explainer);
          if (ex) {
            const dig = document.createElement("button");
            dig.type = "button";
            dig.className = "dig-deeper";
            dig.innerHTML = `Dig deeper: ${ex.title} <span aria-hidden="true">→</span>`;
            dig.addEventListener("click", () => {
              const m = ctx.C.openExplainerModal(dig);
              const modalCtx = Object.assign({}, ctx, {
                router: Object.assign({}, ctx.router, {
                  navigate: function (view, arg) {
                    m.close();
                    if (view !== "explore" || arg) ctx.router.navigate(view, arg);
                  },
                }),
              });
              global.MTT.ui.views.explainer.render(m.body, modalCtx, topic.explainer);
            });
            revealEl.appendChild(dig);
          }
        }
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
        `🔥 ${st.streak}-day streak` + (first ? " (counted today)" : "");

      const view = C.el(`<div class="view"></div>`);
      view.appendChild(C.el(`
        <div class="card finish-card">
          <div class="finish-score"><b>${score}</b><span>/ ${session.length}</span></div>
          <h1 style="margin:6px 0 2px">Nice work</h1>
          <p class="muted" style="margin:0">${streakLine}</p>
        </div>`));

      // Per-topic breakdown closes the loop: where you were strong / shaky.
      const rows = Object.values(tally).sort((a, b) => a.grade - b.grade || a.title.localeCompare(b.title));
      if (rows.length) {
        const card = C.el(`<div class="card"><h3 style="margin-top:0">By topic</h3></div>`);
        const list = C.el(`<div class="breakdown"></div>`);
        rows.forEach((r) => {
          const all = r.correct === r.total;
          const mark = all ? "✓" : r.correct === 0 ? "✗" : "•";
          const cls = all ? "ok" : r.correct === 0 ? "bad" : "part";
          const item = C.el(`<div class="breakdown-row ${cls}">`
            + `<span class="breakdown-mark" aria-hidden="true">${mark}</span>`
            + `<span class="breakdown-title">${r.title}</span>`
            + `<span class="breakdown-score">${r.correct}/${r.total}</span></div>`);
          list.appendChild(item);
        });
        card.appendChild(list);
        // Point weak topics at their next practice.
        const weak = rows.filter((r) => r.correct < r.total);
        if (weak.length) {
          card.appendChild(C.el(`<p class="muted" style="font-size:.86rem;margin:12px 0 0">Those came back into the rotation - they'll resurface sooner in your next session.</p>`));
        }
        view.appendChild(card);
      }

      const row = C.el(`<div style="display:flex;gap:10px;flex-wrap:wrap"></div>`);
      row.appendChild(C.button("Practise again", () => render(main, ctx, arg)));
      row.appendChild(C.button("Back home", () => ctx.router.navigate("home"), { className: "ghost" }));
      view.appendChild(row);
      main.appendChild(view);
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
