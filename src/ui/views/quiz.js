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

  // Sequence variant: walk through an array of targets one by one, confirming
  // each note before advancing. task.targets = [{midi, name, staffHtml}, ...]
  function renderMicSequence(view, q, C, ctx, onResult) {
    const task = q.micTask;
    const targets = task.targets;
    const ai = global.MTT && global.MTT.audioInput;
    let currentIdx = 0;
    let holdTimer = null;
    let holdStarted = false;
    let lockout = false; // brief cooldown after each confirmed note
    let stopDetector = null;
    let listening = false;

    const panel = C.el(`<div class="mic-panel mic-sequence-panel"></div>`);
    const progressEl = C.el(`<p class="mic-sequence-progress">Note 1 of ${targets.length}</p>`);
    const currentNoteEl = C.el(`<div class="mic-current-note-staff"></div>`);
    const meter = C.pitchMeter(targets[0].name);
    const statusEl = C.el(`<p class="mic-status" aria-live="polite" aria-atomic="true"></p>`);

    function updateDisplay() {
      const t = targets[currentIdx];
      progressEl.textContent = `Note ${currentIdx + 1} of ${targets.length}`;
      progressEl.innerHTML = progressEl.textContent
        + targets.map(function (_, i) {
          return `<span class="seq-dot ${i < currentIdx ? "done" : i === currentIdx ? "now" : ""}">♩</span>`;
        }).join("");
      meter.setTarget(t.name);
      currentNoteEl.innerHTML = t.staffHtml || `<span style="font-size:1.3em">${t.name}</span>`;
    }

    function stop() {
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
      if (stopDetector) { try { stopDetector(); } catch { /* ok */ } stopDetector = null; }
      holdStarted = false;
      lockout = false;
      listening = false;
    }

    if (!ai || !ai.isAvailable()) {
      panel.appendChild(C.el(`<p class="muted" style="font-size:.9em">Microphone not available — listen and self-report below.</p>`));
      view.appendChild(panel);
      return stop;
    }

    const startBtn = document.createElement("button");
    startBtn.className = "btn mic-start-btn";
    startBtn.type = "button";
    startBtn.textContent = "🎤 Start singing";

    const restartBtn = document.createElement("button");
    restartBtn.className = "ghost";
    restartBtn.type = "button";
    restartBtn.textContent = "↺ Restart";
    restartBtn.style.display = "none";
    restartBtn.addEventListener("click", function () {
      currentIdx = 0;
      updateDisplay();
      statusEl.textContent = "Restarted — sing note 1.";
    });

    startBtn.addEventListener("click", async function () {
      if (listening) return;
      startBtn.disabled = true;
      startBtn.textContent = "🎤 Listening…";
      statusEl.textContent = "Requesting microphone access…";

      try {
        stopDetector = await ai.startPitchDetection(function ({ midi, cents, clarity }) {
          meter.update({ midi, cents, clarity });
          if (lockout || currentIdx >= targets.length) return;

          if (midi == null) {
            if (holdStarted) {
              clearTimeout(holdTimer); holdTimer = null;
              holdStarted = false;
              statusEl.textContent = "Keep going — hold the note steady.";
            }
            return;
          }

          const target = targets[currentIdx];
          const diff = Math.abs(midi - target.midi);
          const tol = task.toleranceSemitones != null ? task.toleranceSemitones : 1.0;

          if (diff <= tol) {
            statusEl.textContent = "On pitch!";
            if (!holdStarted) {
              holdStarted = true;
              const minHold = task.minHoldMs != null ? task.minHoldMs : 450;
              holdTimer = setTimeout(function () {
                holdStarted = false;
                holdTimer = null;
                lockout = true;
                currentIdx++;
                if (currentIdx >= targets.length) {
                  stop();
                  progressEl.innerHTML = `All ${targets.length} notes sung ✓`;
                  currentNoteEl.innerHTML = "";
                  startBtn.textContent = "🎤 Done";
                  statusEl.textContent = "Phrase complete — well done!";
                  onResult(q.answer);
                } else {
                  updateDisplay();
                  statusEl.textContent = "Good! Now sing the next note.";
                  setTimeout(function () { lockout = false; }, 350);
                }
              }, minHold);
            }
          } else {
            if (holdStarted) {
              clearTimeout(holdTimer); holdTimer = null;
              holdStarted = false;
            }
            const semis = midi - target.midi;
            statusEl.textContent = semis > 0 ? "Too high — come down." : "Too low — come up.";
          }
        });

        listening = true;
        restartBtn.style.display = "";
        updateDisplay();
        statusEl.textContent = "Sing note 1 — hold it steady.";
      } catch (err) {
        startBtn.disabled = false;
        startBtn.textContent = "🎤 Start singing";
        statusEl.textContent = "Could not access microphone — use self-report below.";
      }
    });

    panel.appendChild(progressEl);
    panel.appendChild(currentNoteEl);
    panel.appendChild(meter);
    const btnRow = C.el(`<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"></div>`);
    btnRow.appendChild(startBtn);
    btnRow.appendChild(restartBtn);
    panel.appendChild(btnRow);
    panel.appendChild(statusEl);
    view.appendChild(panel);
    return stop;
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
