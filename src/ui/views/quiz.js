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

  // A recovery-oriented message for a getUserMedia failure, keyed on the DOM
  // exception name so the user is told what to actually do.
  function micErrorMessage(err) {
    const name = err && err.name;
    if (name === "NotAllowedError" || name === "SecurityError") {
      return "Microphone blocked — allow mic access for this site in your browser settings, then try again. You can also self-report below.";
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return "No microphone found — connect one, or use self-report below.";
    }
    return "Could not access the microphone — use self-report below.";
  }

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
        statusEl.textContent = micErrorMessage(err);
      }
    });

    panel.appendChild(meter);
    panel.appendChild(startBtn);
    panel.appendChild(statusEl);
    view.appendChild(panel);
    return stop;
  }

  // Sequence variant: play phrase → listen → score.
  //
  // If task.autoPlayAndRespondMs is set (echo tasks): one "Hear & respond" button
  // plays q.audio() then opens the mic automatically after playback ends. The mic
  // is requested on the button click (user-gesture context) and gated by a
  // `listening` flag; readings collected during playback are discarded so speaker
  // bleed from the piano doesn't pollute the buffer.
  //
  // If not set (sight-singing): a plain "Start singing" button opens the mic.
  //
  // Segmentation always returns exactly targets.length notes:
  //   1. Detect natural note boundaries by pitch jumps > 1.5 semitones.
  //   2. Too many groups → merge the adjacent pair with the smallest pitch gap
  //      (most likely the same note with a brief glide).
  //   3. Too few groups → split the longest group at its midpoint.
  // This respects actual note durations rather than assuming equal lengths.
  //
  // task.targets = [{midi, name, staffHtml}, ...]
  function renderMicSequence(view, q, C, ctx, onResult) {
    const task = q.micTask;
    const targets = task.targets;
    const N = targets.length;
    const ai = global.MTT && global.MTT.audioInput;
    const hasAutoPlay = !!(task.autoPlayAndRespondMs && q.audio);

    const SILENCE_READINGS = 15; // ~1.2 s at 80 ms/poll — a breath mid-phrase no longer ends the take
    const MIN_CLARITY = 0.78;
    const MAX_LISTEN_MS = 20000; // hard stop so an open mic can't stay live forever

    let stopDetector = null;
    let maxTimer = null; // auto-stop watchdog
    let listening = false; // gated: ignore readings during playback
    let hasSang = false;
    let finished = false;
    let silenceCount = 0;
    let readings = [];

    const panel = C.el(`<div class="mic-panel mic-sequence-panel"></div>`);
    const meter = C.pitchMeter("–");
    const statusEl = C.el(`<p class="mic-status" aria-live="polite" aria-atomic="true"></p>`);
    const resultEl = C.el(`<div class="mic-seq-result"></div>`);
    resultEl.hidden = true;

    function stopMic() {
      if (maxTimer) { clearTimeout(maxTimer); maxTimer = null; }
      if (stopDetector) { try { stopDetector(); } catch { /* ok */ } stopDetector = null; }
    }

    // End the take and score whatever was captured. Called on trailing silence,
    // or by the watchdog if the singer never stops (or never starts).
    function finishAttempt() {
      if (finished) return;
      finished = true;
      stopMic();
      startBtn.classList.remove("mic-singing");
      startBtn.textContent = "🎤 Done";
      statusEl.textContent = "";
      showResult(forceSegmentNotes(readings, N));
    }

    // Segment a buffer of {midi, clarity} readings into exactly n notes.
    // Phase 1 — natural boundaries: split on pitch jumps > 1.5 semitones.
    // Phase 2 — adjust count:
    //   Too many → merge adjacent pair with smallest pitch gap (same note / glide).
    //   Too few  → split longest group at midpoint.
    function forceSegmentNotes(rds, n) {
      const clear = rds.filter(function (r) { return r.midi != null && r.clarity >= MIN_CLARITY; });
      if (clear.length < n) return null;

      function groupMedian(g) {
        const s = g.map(function (r) { return r.midi; }).sort(function (a, b) { return a - b; });
        return s[Math.floor(s.length / 2)];
      }

      // Phase 1: split on pitch jumps.
      const groups = [];
      let grp = [clear[0]];
      for (let i = 1; i < clear.length; i++) {
        if (Math.abs(clear[i].midi - grp[grp.length - 1].midi) > 1.5) {
          groups.push(grp);
          grp = [];
        }
        grp.push(clear[i]);
      }
      groups.push(grp);

      // Phase 2a: merge down to n.
      while (groups.length > n) {
        let minGap = Infinity, minIdx = 0;
        for (let i = 0; i < groups.length - 1; i++) {
          const gap = Math.abs(groupMedian(groups[i]) - groupMedian(groups[i + 1]));
          if (gap < minGap) { minGap = gap; minIdx = i; }
        }
        groups.splice(minIdx, 2, groups[minIdx].concat(groups[minIdx + 1]));
      }

      // Phase 2b: split up to n.
      while (groups.length < n) {
        let maxLen = 0, maxIdx = 0;
        for (let i = 0; i < groups.length; i++) {
          if (groups[i].length > maxLen) { maxLen = groups[i].length; maxIdx = i; }
        }
        const g = groups[maxIdx];
        const mid = Math.floor(g.length / 2);
        groups.splice(maxIdx, 1, g.slice(0, mid), g.slice(mid));
      }

      return groups.map(groupMedian);
    }

    function noteLabel(midi) {
      const inp = global.MTT.audioInput;
      return inp ? inp.midiToName(midi) : String(midi);
    }

    // Compare two MIDI notes ignoring octave. Uses circular pitch-class distance
    // so B (11) vs C (0) gives 1, not 11. The per-task tolerance is honoured so
    // higher grades (0.5 semitone) are actually graded more strictly than lower
    // ones (1.0) rather than everything grading like Grade 1.
    const tolerance = task.toleranceSemitones != null ? task.toleranceSemitones : 1;
    function pcMatch(detMidi, expMidi) {
      const det = ((detMidi % 12) + 12) % 12;
      const exp = ((expMidi % 12) + 12) % 12;
      const diff = Math.abs(det - exp);
      return Math.min(diff, 12 - diff) <= tolerance;
    }

    function showResult(detected) {
      const expected = targets.map(function (t) { return t.midi; });

      let exact = 0;
      if (detected) {
        for (let i = 0; i < expected.length; i++) {
          if (detected[i] != null && pcMatch(detected[i], expected[i])) exact++;
        }
      }

      let intMatch = 0;
      const intTotal = expected.length - 1;
      if (detected) {
        for (let i = 0; i < Math.min(detected.length, expected.length) - 1; i++) {
          const ds = detected[i + 1] - detected[i];
          const es = expected[i + 1] - expected[i];
          if (Math.sign(ds) === Math.sign(es) && Math.abs(Math.abs(ds) - Math.abs(es)) <= 1) intMatch++;
        }
      }

      let html = `<div class="seq-compare">`;
      html += `<div class="seq-row"><span class="seq-row-label">Expected</span>`;
      targets.forEach(function (t, i) {
        html += `<span class="seq-note exp">${t.name}</span>`;
        if (i < targets.length - 1) html += `<span class="seq-arrow">→</span>`;
      });
      html += `</div><div class="seq-row"><span class="seq-row-label">You sang</span>`;
      if (!detected) {
        html += `<span class="muted" style="font-style:italic">not enough detected — try again</span>`;
      } else {
        detected.forEach(function (midi, i) {
          const match = expected[i] != null && pcMatch(midi, expected[i]);
          html += `<span class="seq-note ${match ? "match" : "miss"}">${noteLabel(midi)}</span>`;
          if (i < detected.length - 1) html += `<span class="seq-arrow">→</span>`;
        });
      }
      html += `</div></div>`;

      // Plain-text score summary, reused both in the panel and (on a wrong
      // result) in the question's reveal feedback - see notesScoreText below.
      let noteScoreText = "";
      let intScoreText = "";
      if (detected) {
        const allGoodScore = exact === expected.length;
        noteScoreText = allGoodScore ? `All ${expected.length} notes correct` : `${exact} of ${expected.length} notes matched`;
        intScoreText = intTotal > 0 ? `${intMatch}/${intTotal} intervals correct` : "";
        const sep = intScoreText ? " · " : "";
        html += `<p class="seq-score ${allGoodScore ? "ok" : exact > 0 ? "part" : "bad"}">${noteScoreText}${sep}${intScoreText}</p>`;
        const tolText = tolerance < 1 ? `within ±${tolerance} of a semitone` : `within ±${tolerance} semitone`;
        html += `<p class="muted" style="font-size:.8em;margin:.3em 0 0">Graded ${tolText}, ignoring octave.</p>`;
      }

      resultEl.innerHTML = html;
      resultEl.hidden = false;

      const allGood = detected && exact === expected.length;
      const actRow = C.el(`<div class="seq-btn-row"></div>`);
      actRow.appendChild(C.button("↺ Try again", function () {
        resultEl.hidden = true;
        actRow.remove();
        readings = [];
        hasSang = false;
        finished = false;
        silenceCount = 0;
        listening = false;
        startBtn.disabled = false;
        startBtn.textContent = hasAutoPlay ? "▶ Hear & respond" : "🎤 Sing again";
        statusEl.textContent = hasAutoPlay ? "" : "Press start, then sing the full phrase.";
      }));
      actRow.appendChild(C.button("Score it", function () {
        stopMic();
        // Report the actual match result, not an automatic "correct" — the reveal
        // step compares this against q.answer to grade the question. On a wrong
        // result also pass the note/interval score so the reveal can explain
        // *why* it was wrong instead of echoing the self-report sentinel answer.
        const scoreDetail = allGood ? null : [noteScoreText, intScoreText].filter(Boolean).join(", ");
        onResult(allGood ? q.answer : q.choices.find(function (c) { return c !== q.answer; }), scoreDetail);
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
    startBtn.textContent = hasAutoPlay ? "▶ Hear & respond" : "🎤 Start singing";
    statusEl.textContent = hasAutoPlay ? "" : "Press start, then sing the full phrase.";

    // Detector callback: the meter always updates; readings are only collected
    // once `listening` is true (i.e. after playback, when the mic is open).
    function onPitch({ midi, cents, clarity }) {
      if (finished) return;
      meter.update({ midi, cents, clarity });
      if (!listening) return;
      readings.push({ midi: midi, clarity: clarity || 0 });
      const clear = midi != null && (clarity || 0) >= MIN_CLARITY;
      if (clear) {
        hasSang = true;
        silenceCount = 0;
        statusEl.textContent = "Singing…";
      } else if (hasSang) {
        silenceCount++;
        statusEl.textContent = "Pause detected — scoring when you stop…";
        if (silenceCount >= SILENCE_READINGS) finishAttempt();
      }
    }

    // Start the watchdog once the mic is actually open, so an unresponsive or
    // silent session can't leave the stream running indefinitely.
    function armWatchdog() {
      if (maxTimer) clearTimeout(maxTimer);
      maxTimer = setTimeout(finishAttempt, MAX_LISTEN_MS);
    }

    // Open the mic (getUserMedia). Returns true on success, false if denied.
    async function beginListening() {
      try {
        stopDetector = await ai.startPitchDetection(onPitch);
        return true;
      } catch (err) {
        startBtn.disabled = false;
        startBtn.textContent = hasAutoPlay ? "▶ Hear & respond" : "🎤 Start singing";
        statusEl.textContent = micErrorMessage(err);
        return false;
      }
    }

    startBtn.addEventListener("click", async function () {
      startBtn.disabled = true;
      readings = [];
      hasSang = false;
      finished = false;
      silenceCount = 0;
      listening = false;

      if (hasAutoPlay) {
        // Phase 1: play the phrase with the mic CLOSED. On Android, getUserMedia
        // switches the OS audio session to communication mode, which ducks/cuts
        // any sound currently playing — even on a separate AudioContext — so the
        // melody must finish sounding before the mic opens.
        startBtn.textContent = "▶ Playing…";
        statusEl.textContent = "Listen carefully…";
        try { q.audio(); } catch { /* ignore */ }

        // Phase 2: after playback completes, open the mic during the silence.
        setTimeout(async function () {
          if (finished) return;
          startBtn.textContent = "🎤 Opening mic…";
          if (!(await beginListening())) return;
          readings = [];
          hasSang = false;
          silenceCount = 0;
          listening = true;
          armWatchdog();
          startBtn.textContent = "🎤 Sing now!";
          startBtn.classList.add("mic-singing");
          statusEl.textContent = "Sing the phrase — stop when done.";
        }, task.autoPlayAndRespondMs);
      } else {
        if (!(await beginListening())) return;
        listening = true;
        armWatchdog();
        statusEl.textContent = "Sing the whole phrase, then pause — it will score automatically.";
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

    const sessionLength = settings.sessionLength || ctx.session.SESSION_LEN;
    const session = single
      ? ctx.session.buildSingle(Object.assign({}, single), rng, sessionLength)
      : ctx.session.build({ content: ctx.content, settings, srsMap: ctx.store.srsMap(), rng, now, length: sessionLength });

    function playQuestionAudio(q) {
      if (ctx.audio && ctx.audio.cancel) {
        // Best-effort only: replay should still continue if a stale audio graph
        // can't be cancelled cleanly during rapid replays or view switches.
        try { ctx.audio.cancel(); } catch { /* ok */ }
      }
      safe(q.audio);
    }

    function findLearnTopic(topicId) {
      for (const grade of ctx.content.grades || []) {
        const lesson = grade.topics && grade.topics.find((t) => t.id === topicId);
        if (lesson) return lesson;
      }
      return null;
    }

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
    let activeStopMic = null; // teardown for the current question's mic, if any
    let activeKeyHandler = null; // document keydown listener for number-key answers
    const tally = {}; // topicId -> { title, grade, correct, total } for the finish summary

    function detachKeyHandler() {
      if (activeKeyHandler) { document.removeEventListener("keydown", activeKeyHandler); activeKeyHandler = null; }
    }

    nextQuestion();

    // Router calls this before navigating away: stop any open mic and remove the
    // document-level key listener so it can't outlive the view.
    return function teardown() {
      if (activeStopMic) { try { activeStopMic(); } catch { /* ok */ } activeStopMic = null; }
      detachKeyHandler();
    };

    function nextQuestion() {
      if (idx >= session.length) return finish();
      detachKeyHandler();
      C.clear(main);
      const { topic, q } = session[idx];
      let answered = false;
      questionStart = ctx.now();
      let stopMic = null; // cleanup function for mic sessions

      const view = C.el(`<div class="view"></div>`);

      const dots = session.map((_, i) =>
        `<span class="${i < idx ? "done" : i === idx ? "now" : ""}"></span>`).join("");
      view.appendChild(C.el(
        `<div class="progress-row">`
        + `<div class="progress-dots" aria-hidden="true">${dots}</div>`
        + `<span class="progress-count" aria-label="Question ${idx + 1} of ${session.length}">${idx + 1} / ${session.length}</span>`
        + `<span class="progress-meta">${session.length}-question session</span></div>`));
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
        const ab = C.playButton("Hear it", () => playQuestionAudio(q));
        ab.setAttribute("aria-label", "Replay the sound for this question");
        view.appendChild(ab);
        if (ctx.audio.isEnabled()) {
          playQuestionAudio(q);
        } else {
          // Sound is off — this is a listening task, so say so and offer one-tap
          // enable rather than leaving a silent, unusable question.
          const notice = C.el(`<div class="sound-off-note" role="status" style="margin-top:10px;font-size:.9em"></div>`);
          notice.appendChild(C.el(`<span class="muted">🔇 Sound is off — this is a listening task. </span>`));
          notice.appendChild(C.button("Turn sound on", () => {
            ctx.audio.setEnabled(true);
            ctx.store.setSetting("sound", true);
            ctx.audio.unlock();
            notice.remove();
            playQuestionAudio(q);
          }, { className: "ghost" }));
          view.appendChild(notice);
        }
      }

      // Mic-task: pitch-detection panel instead of numbered choice buttons.
      // Self-report ghost buttons shown as fallback below the meter.
      const choiceButtons = [];
      let idkBtn = null;

      if (q.micTask) {
        stopMic = renderMicTask(view, q, C, ctx, function (detected, scoreDetail) {
          if (!answered) reveal(detected === q.answer ? "correct" : "wrong", null, scoreDetail);
        });
        activeStopMic = stopMic;
        const selfReport = C.el(`<div class="mic-self-report"></div>`);
        selfReport.appendChild(C.el(`<span class="muted" style="font-size:.88em;display:block;margin-bottom:6px">Self-report (if mic unavailable) - your answer affects which topics the app revisits, so be honest:</span>`));
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

      // Move focus to the question so keyboard/screen-reader users land on the
      // new content each time (the prior focus target was just cleared away).
      prompt.setAttribute("tabindex", "-1");
      C.focus(prompt);

      // Keyboard shortcuts: 1-9 pick a choice while unanswered (only for standard
      // choice questions). The listener lives on `document`, not the view element,
      // because focus is rarely on the view — a listener there would never fire.
      function onKeydown(e) {
        if (answered) return;
        if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= choiceButtons.length) {
          e.preventDefault();
          const btn = choiceButtons[n - 1];
          reveal(btn._choice === q.answer ? "correct" : "wrong", btn);
        }
      }
      if (!q.micTask) {
        activeKeyHandler = onKeydown;
        document.addEventListener("keydown", onKeydown);
      }

      function reveal(kind, pickedBtn, scoreDetail) {
        if (answered) return;
        answered = true;
        detachKeyHandler();
        if (stopMic) { try { stopMic(); } catch { /* ok */ } stopMic = null; activeStopMic = null; }
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

        // Mic tasks grade against a self-report sentinel ("I sang the phrase"),
        // not a real answer choice, so it reads as nonsense to echo it back
        // ("the answer is I sang the phrase"). Show the actual note/interval
        // score instead when we have one (from the sung attempt); the plain
        // self-report buttons carry no such detail, so fall back to a bare
        // "Not quite" there.
        const verdict = correct
          ? `<span class="ok">✓ Correct</span>`
          : kind === "wrong"
            ? q.micTask
              ? `<span class="no">✗ Not quite</span>${scoreDetail ? ` - ${scoreDetail}.` : ""}`
              : `<span class="no">✗ Not quite</span> - the answer is <b>${q.answer}</b>.`
            : `<span class="idk-label">The answer is <b>${q.answer}</b>.</span>`;
        const diag = !correct ? safeDiagnose(q, pickedBtn ? pickedBtn._choice : null) : null;
        const why = q.explanation ? `<div class="why-line">${q.explanation}</div>` : "";
        const diagLine = diag ? `<div class="why-line diag-line">${diag}</div>` : "";
        // Echo/memory tasks hide the notation during the test (it's an ear test);
        // reveal it now so the learner can see what they were meant to sing.
        const micStaff = (q.micTask && q.micTask.revealStaffHtml)
          ? `<div class="why-line">Here's what it was:${q.micTask.revealStaffHtml}</div>` : "";
        const cls = correct ? "good" : kind === "wrong" ? "bad" : "idk";
        const revealEl = C.el(`<div class="reveal ${cls}" role="status">${verdict}${diagLine}${why}${micStaff}</div>`);
        // Dig deeper: prefer the matching "Why" explainer, otherwise fall back to
        // the topic's Learn page when this is a drillable theory topic.
        let dig = null;
        if (topic.explainer) {
          const ex = (ctx.content.explainers || []).find((e) => e.id === topic.explainer);
          if (ex) {
            dig = document.createElement("button");
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
          }
        }
        if (!dig) {
          const lesson = findLearnTopic(topic.id);
          if (lesson) {
            dig = document.createElement("button");
            dig.type = "button";
            dig.className = "dig-deeper";
            dig.innerHTML = `Dig deeper: ${lesson.title} <span aria-hidden="true">→</span>`;
            dig.addEventListener("click", () => ctx.router.navigate("learn", lesson.id));
          }
        }
        if (dig) revealEl.appendChild(dig);
        view.appendChild(revealEl);

        C.announce(
          (correct
            ? "Correct. "
            : q.micTask
              ? "Not quite. " + (scoreDetail ? scoreDetail + ". " : "")
              : "Not quite. The answer is " + q.answer + ". ")
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
      // Any completed session of a few questions counts toward the daily streak,
      // aural and single-topic ones included — recordSessionDay is idempotent per
      // day, so it can't be farmed by replaying.
      const first = session.length >= 5 && ctx.store.recordSessionDay(ctx.now());
      C.clear(main);
      const st = ctx.store.get();
      const streakLine = `🔥 ${st.streak}-day streak` + (first ? " (counted today)" : "");

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
