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

  // Fraction of a sung phrase's notes that must match (with the final note
  // landing) for the take to count as correct - graded credit so near-success
  // is rewarded rather than scored identically to singing nothing.
  const PASS_FRACTION = 0.8;

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

  // --- Slower replay ---------------------------------------------------------

  // Factor by which a "Replay slower" press stretches note timing.
  const SLOW_REPLAY_FACTOR = 1.5;

  // Argument indices (per method) that carry a timing value in seconds/beats -
  // step, dur, or beatSec - rather than a note list or gain. aural-content.js
  // resolves the audio engine live at call time (`global.MTT.audio` or
  // `global.MTT.audioPiano`), so wrapping these methods on both engines for the
  // duration of one playback call is enough to stretch a fixed q.audio()
  // closure's timing without either engine or the closure itself knowing about
  // "slow" mode.
  const TIMING_ARG_INDICES = {
    sequence: [1, 2],        // (notes, step, dur, velocities)
    sequenceRhythm: [2],     // (notes, durations, beatSec, velocities)
    sequencePair: [2, 3],    // (notes1, notes2, step, dur)
    sequenceAt: [2, 3],      // (notes, gain, step, dur)
    note: [1],               // (n, dur)
    chord: [1],              // (notes, dur)
  };

  // Run `fn` with every engine's timing methods temporarily scaled by `factor`,
  // then restore the originals - even if fn throws.
  function withStretchedAudio(factor, fn) {
    const engines = [global.MTT && global.MTT.audio, global.MTT && global.MTT.audioPiano].filter(Boolean);
    const restores = [];
    engines.forEach(function (engine) {
      Object.keys(TIMING_ARG_INDICES).forEach(function (name) {
        const orig = engine[name];
        if (typeof orig !== "function") return;
        engine[name] = function (...args) {
          TIMING_ARG_INDICES[name].forEach(function (i) {
            if (typeof args[i] === "number") args[i] = args[i] * factor;
          });
          return orig.apply(engine, args);
        };
        restores.push(function () { engine[name] = orig; });
      });
    });
    try { fn(); } finally { restores.forEach(function (r) { r(); }); }
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

    const SILENCE_READINGS = 15; // ~1.2 s at POLL_MS/poll — a breath mid-phrase no longer ends the take
    const POLL_MS = 80;          // pitch detector polling interval in milliseconds (matches audio-input.js)
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
    const meter = C.pitchMeter("–", { levelOnly: true });
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
      return inp ? inp.midiToName(midi, task.useFlats) : String(midi);
    }

    // Compare two MIDI notes ignoring octave. Uses circular pitch-class distance
    // so B (11) vs C (0) gives 1, not 11. The per-task tolerance is honoured so
    // higher grades (0.5 semitone) are actually graded more strictly than lower
    // ones (1.0) rather than everything grading like Grade 1.
    const tolerance = task.toleranceSemitones != null ? task.toleranceSemitones : 1;
    function pcDistance(detMidi, expMidi) {
      const det = ((detMidi % 12) + 12) % 12;
      const exp = ((expMidi % 12) + 12) % 12;
      const diff = Math.abs(det - exp);
      return Math.min(diff, 12 - diff);
    }
    function pcMatch(detMidi, expMidi) {
      return pcDistance(detMidi, expMidi) <= tolerance;
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
          // Exact = spot on; close = within the grading tolerance but not exact
          // (e.g. a semitone off), so leniency reads as "nearly", not "correct";
          // miss = outside tolerance.
          let cls = "miss";
          if (expected[i] != null) {
            const dist = pcDistance(midi, expected[i]);
            cls = dist === 0 ? "match" : dist <= tolerance ? "close" : "miss";
          }
          html += `<span class="seq-note ${cls}">${noteLabel(midi)}</span>`;
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

      // Graded credit: near-success earns the same "correct" the mastery model
      // records for a perfect take, so a 4-of-5 attempt promotes rather than
      // being punished like singing nothing. The final note must land (it anchors
      // the phrase) and enough of the phrase must match. `quality` (0..1) is the
      // proportion matched, passed on so the scheduler can grade proportionally.
      const frac = expected.length ? exact / expected.length : 0;
      const finalCorrect = !!(detected && detected[expected.length - 1] != null
        && pcMatch(detected[expected.length - 1], expected[expected.length - 1]));
      const pass = !!(detected && frac >= PASS_FRACTION && finalCorrect);
      const quality = detected ? frac : 0;
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
        const scoreDetail = pass ? null : [noteScoreText, intScoreText].filter(Boolean).join(", ");
        onResult(pass ? q.answer : q.choices.find(function (c) { return c !== q.answer; }), scoreDetail, quality);
      }, { className: pass ? "" : "ghost" }));
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
        const secLeft = Math.ceil((SILENCE_READINGS - silenceCount) * POLL_MS / 1000);
        statusEl.textContent = secLeft > 0
          ? `Pause detected — scoring in ${secLeft}s…`
          : "Scoring…";
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

  // Multi-echo variant: presents q.micTask.phrases (an array of phrase
  // descriptors) one at a time, each played then sung back. After all phrases
  // are scored the learner sees an overall result and a single "Score it" button
  // that advances the quiz with the combined outcome.
  //
  // Each phrase descriptor: { targets, audioFn, autoPlayAndRespondMs,
  //   toleranceSemitones, useFlats, revealStaffHtml }
  function renderMultiEcho(view, q, C, ctx, onResult) {
    const phrases = q.micTask.phrases;
    const N = phrases.length;
    const ai = global.MTT && global.MTT.audioInput;

    const panel = C.el(`<div class="mic-panel mic-multi-echo-panel"></div>`);
    view.appendChild(panel);

    if (!ai || !ai.isAvailable()) {
      panel.appendChild(C.el(`<p class="muted" style="font-size:.9em">Microphone not available — use self-report below.</p>`));
      return function () {};
    }

    let activeStop = null;
    const phraseResults = []; // { correct: bool, scoreDetail: string|null, quality: number }

    function stopActive() {
      if (activeStop) { try { activeStop(); } catch { /* ok */ } activeStop = null; }
    }

    function showPhrase(idx) {
      stopActive();
      panel.innerHTML = "";

      const phrase = phrases[idx];
      panel.appendChild(C.el(
        `<p class="mic-echo-counter muted" style="font-size:.85em;margin:0 0 .4em">Phrase ${idx + 1} of ${N}</p>`
      ));

      // Sub-question for this phrase: wire audioFn as the question audio so that
      // renderMicSequence's "Hear & respond" auto-play path works normally.
      const subQ = Object.assign({}, q, {
        audio: phrase.audioFn,
        micTask: {
          type: "sequence",
          targets: phrase.targets,
          autoPlayAndRespondMs: phrase.autoPlayAndRespondMs,
          toleranceSemitones: phrase.toleranceSemitones,
          useFlats: phrase.useFlats,
          revealStaffHtml: phrase.revealStaffHtml,
        },
      });

      activeStop = renderMicSequence(panel, subQ, C, ctx, function (phraseAnswer, scoreDetail, quality) {
        phraseResults.push({
          correct: phraseAnswer === q.answer,
          scoreDetail: scoreDetail || null,
          quality: typeof quality === "number" ? quality : (phraseAnswer === q.answer ? 1 : 0),
        });
        stopActive();

        // Replace the "Score it / Try again" row with a navigation button.
        const actRow = panel.querySelector(".seq-btn-row");
        if (actRow) actRow.innerHTML = "";
        const row = actRow || C.el(`<div class="seq-btn-row"></div>`);

        if (idx < N - 1) {
          row.appendChild(C.button(`Phrase ${idx + 2} of ${N} →`, function () {
            showPhrase(idx + 1);
          }));
        } else {
          // All phrases done — show summary and final "Score it".
          const correct = phraseResults.filter(function (r) { return r.correct; }).length;
          const allGood = correct === N;
          // Graded credit across phrases: enough of them correct (with the last
          // one landing) counts, rather than demanding every phrase be perfect.
          const lastCorrect = phraseResults.length === N && phraseResults[N - 1].correct;
          const pass = N > 0 && (correct / N) >= PASS_FRACTION && lastCorrect;
          const quality = phraseResults.reduce(function (s, r) { return s + r.quality; }, 0) / N;
          panel.appendChild(C.el(
            `<p class="seq-score ${allGood ? "ok" : correct > 0 ? "part" : "bad"}">${correct} of ${N} phrases correct</p>`
          ));
          const details = phraseResults
            .map(function (r, i) { return r.scoreDetail ? ("Phrase " + (i + 1) + ": " + r.scoreDetail) : null; })
            .filter(Boolean).join("; ");
          row.appendChild(C.button("Score it", function () {
            onResult(
              pass ? q.answer : q.choices.find(function (c) { return c !== q.answer; }),
              details || null,
              quality
            );
          }, { className: pass ? "" : "ghost" }));
        }

        if (!actRow) panel.appendChild(row);
      });
    }

    showPhrase(0);
    return stopActive;
  }

  // A monotonic millisecond clock for tap/onset timing, independent of the
  // injected ctx.now (which tests may stub to Date.now).
  function nowMs() {
    return (global.performance && global.performance.now) ? global.performance.now() : Date.now();
  }

  // Tap-the-pulse variant (type "pulse"): a steady pulse plays and the learner
  // taps along on every beat, marking the strong (first) beat of each bar. Grades
  // tempo stability, tempo accuracy against the played pulse, and accent
  // placement via MTT.rhythmGrade.gradeTaps. Needs no microphone; taps come from
  // the keyboard (Space for a beat, A for the strong beat) or the two buttons.
  //
  // task = { type:"pulse", beatMs, totalBeats, beatsPerBar, playFn }
  function renderPulseTap(view, q, C, ctx, onResult) {
    const task = q.micTask;
    const grader = global.MTT && global.MTT.rhythmGrade;
    const beatMs = task.beatMs;
    const playMs = beatMs * task.totalBeats;

    let taps = [];
    let accents = [];
    let t0 = 0;
    let capturing = false;
    let finished = false;
    let endTimer = null;
    let keyHandler = null;

    const panel = C.el(`<div class="mic-panel mic-pulse-panel"></div>`);
    const statusEl = C.el(`<p class="mic-status" aria-live="polite" aria-atomic="true"></p>`);
    const countEl = C.el(`<p class="pulse-count muted" style="font-size:.9em;margin:.3em 0" aria-hidden="true"></p>`);
    const resultEl = C.el(`<div class="mic-seq-result"></div>`);
    resultEl.hidden = true;

    const startBtn = document.createElement("button");
    startBtn.className = "btn mic-start-btn";
    startBtn.type = "button";
    startBtn.textContent = "▶ Play pulse & tap along";

    const tapRow = C.el(`<div class="pulse-tap-row" style="display:flex;gap:10px;flex-wrap:wrap;margin:10px 0"></div>`);
    const beatBtn = C.button("● Tap (Space)", function () { registerTap(false); });
    const accentBtn = C.button("◆ Strong beat (A)", function () { registerTap(true); }, { className: "ghost" });
    beatBtn.disabled = true;
    accentBtn.disabled = true;
    tapRow.appendChild(beatBtn);
    tapRow.appendChild(accentBtn);

    function detachKeys() {
      if (keyHandler) { document.removeEventListener("keydown", keyHandler); keyHandler = null; }
    }

    function stop() {
      if (endTimer) { clearTimeout(endTimer); endTimer = null; }
      detachKeys();
      capturing = false;
    }

    function registerTap(isAccent) {
      if (!capturing || finished) return;
      taps.push(nowMs() - t0);
      accents.push(!!isAccent);
      const strong = accents.filter(Boolean).length;
      countEl.textContent = `Taps: ${taps.length}` + (strong ? ` (${strong} strong)` : "");
      const btn = isAccent ? accentBtn : beatBtn;
      btn.classList.add("tap-flash");
      global.setTimeout(function () { btn.classList.remove("tap-flash"); }, 90);
    }

    function begin() {
      startBtn.disabled = true;
      startBtn.textContent = "🥁 Tapping…";
      taps = []; accents = []; finished = false; capturing = true;
      countEl.textContent = "Taps: 0";
      resultEl.hidden = true;
      beatBtn.disabled = false; accentBtn.disabled = false;
      statusEl.textContent = "Tap every beat, and press ◆ / A on the first beat of each bar.";
      t0 = nowMs();
      try { task.playFn(); } catch { /* ignore */ }
      keyHandler = function (e) {
        if (e.repeat) return;
        if (e.code === "Space" || e.key === " ") { e.preventDefault(); registerTap(false); }
        else if (e.key === "a" || e.key === "A") { e.preventDefault(); registerTap(true); }
      };
      document.addEventListener("keydown", keyHandler);
      endTimer = global.setTimeout(finishAttempt, playMs + 500);
    }

    function finishAttempt() {
      if (finished) return;
      finished = true;
      stop();
      beatBtn.disabled = true; accentBtn.disabled = true;
      startBtn.disabled = false;
      startBtn.textContent = "▶ Play again & tap";
      statusEl.textContent = "";
      showResult(grader ? grader.gradeTaps({ taps: taps, accents: accents, targetBeatMs: beatMs, beatsPerBar: task.beatsPerBar }) : null);
    }

    function pct(x) { return Math.round((x || 0) * 100); }

    function showResult(res) {
      if (!res) { onResult(q.answer); return; }
      const rows = [`<div class="seq-row"><span class="seq-row-label">Steadiness</span><span class="seq-note ${res.tempoStability >= 0.5 ? "match" : "miss"}">${pct(res.tempoStability)}%</span></div>`];
      if (res.tempoAccuracy != null) rows.push(`<div class="seq-row"><span class="seq-row-label">Tempo</span><span class="seq-note ${res.tempoAccuracy >= 0.4 ? "match" : "miss"}">${pct(res.tempoAccuracy)}%</span></div>`);
      if (res.accent != null) rows.push(`<div class="seq-row"><span class="seq-row-label">Strong beat</span><span class="seq-note ${res.accent >= 0.5 ? "match" : "miss"}">${pct(res.accent)}%</span></div>`);
      const bpm = res.bpm ? ` · ~${Math.round(res.bpm)} bpm` : "";
      resultEl.innerHTML = `<div class="seq-compare">${rows.join("")}</div>`
        + `<p class="seq-score ${res.pass ? "ok" : "bad"}">${res.feedback}${bpm}</p>`;
      resultEl.hidden = false;

      const detail = res.pass ? null : res.feedback;
      const actRow = C.el(`<div class="seq-btn-row"></div>`);
      actRow.appendChild(C.button("↺ Try again", function () {
        resultEl.hidden = true; actRow.remove(); countEl.textContent = "";
        startBtn.textContent = "▶ Play pulse & tap along";
      }));
      actRow.appendChild(C.button("Score it", function () {
        stop();
        onResult(res.pass ? q.answer : q.choices.find(function (c) { return c !== q.answer; }), detail);
      }, { className: res.pass ? "" : "ghost" }));
      panel.appendChild(actRow);
    }

    startBtn.addEventListener("click", begin);

    panel.appendChild(statusEl);
    panel.appendChild(startBtn);
    panel.appendChild(tapRow);
    panel.appendChild(countEl);
    panel.appendChild(resultEl);
    view.appendChild(panel);
    return stop;
  }

  // Clap-back variant (type "clap"): play a target rhythm, then open the mic and
  // grade the clapped-back rhythm against the target inter-onset intervals via
  // energy-envelope onset detection (MTT.audioInput.startOnsetDetection feeding
  // MTT.rhythmGrade.detectOnsets/gradeClap). When the mic is unavailable the panel
  // steps aside and the self-report choices act as a match-the-notation fallback.
  //
  // task = { type:"clap", targetIOIs, beatsPerBar, autoPlayAndRespondMs }; the
  // rhythm plays via the question's top-level q.audio.
  function renderClap(view, q, C, ctx, onResult) {
    const task = q.micTask;
    const ai = global.MTT && global.MTT.audioInput;
    const grader = global.MTT && global.MTT.rhythmGrade;

    const SILENCE_MS = 900;       // trailing silence that ends the take
    const MAX_LISTEN_MS = 12000;  // hard cap so an open mic can't stay live forever

    let stopDetector = null;
    let maxTimer = null;
    let finished = false;
    let listening = false;
    let hasClapped = false;
    let lastLoudT = 0;
    let maxEnergy = 0;
    let frames = [];

    const panel = C.el(`<div class="mic-panel mic-clap-panel"></div>`);
    const statusEl = C.el(`<p class="mic-status" aria-live="polite" aria-atomic="true"></p>`);
    const pulseDot = C.el(`<div class="clap-pulse" aria-hidden="true"></div>`);
    const resultEl = C.el(`<div class="mic-seq-result"></div>`);
    resultEl.hidden = true;

    function stopMic() {
      if (maxTimer) { clearTimeout(maxTimer); maxTimer = null; }
      if (stopDetector) { try { stopDetector(); } catch { /* ok */ } stopDetector = null; }
      listening = false;
    }

    if (!ai || !ai.isAvailable()) {
      panel.appendChild(C.el(`<p class="muted" style="font-size:.9em">Microphone not available, so pick the matching rhythm below instead.</p>`));
      view.appendChild(panel);
      return stopMic;
    }

    const startBtn = document.createElement("button");
    startBtn.className = "btn mic-start-btn";
    startBtn.type = "button";
    startBtn.textContent = "▶ Hear & clap back";

    function onFrame(f) {
      if (!listening || finished) return;
      frames.push(f.energy);
      if (f.energy > maxEnergy) maxEnergy = f.energy;
      const loud = f.energy >= Math.max(0.02, maxEnergy * 0.3);
      pulseDot.classList.toggle("clap-pulse-hit", loud);
      if (loud) { hasClapped = true; lastLoudT = f.t; statusEl.textContent = "Clapping…"; }
      else if (hasClapped && f.t - lastLoudT >= SILENCE_MS) { finishAttempt(); }
    }

    function finishAttempt() {
      if (finished) return;
      finished = true;
      stopMic();
      startBtn.disabled = false;
      startBtn.textContent = "▶ Play again & clap";
      pulseDot.classList.remove("clap-pulse-hit");
      statusEl.textContent = "";
      const hopMs = ai.ONSET_HOP_MS || 16;
      const onsets = grader ? grader.detectOnsets(frames, { hopMs: hopMs }) : [];
      showResult(grader ? grader.gradeClap(task.targetIOIs, onsets) : null);
    }

    async function beginListening() {
      try {
        stopDetector = await ai.startOnsetDetection(onFrame);
        return true;
      } catch (err) {
        startBtn.disabled = false;
        startBtn.textContent = "▶ Hear & clap back";
        statusEl.textContent = micErrorMessage(err);
        return false;
      }
    }

    startBtn.addEventListener("click", function () {
      startBtn.disabled = true;
      finished = false; listening = false; hasClapped = false;
      maxEnergy = 0; frames = []; lastLoudT = 0;
      resultEl.hidden = true;
      startBtn.textContent = "▶ Playing…";
      statusEl.textContent = "Listen carefully…";
      if (ctx.audio && ctx.audio.cancel) { try { ctx.audio.cancel(); } catch { /* ok */ } }
      try { q.audio(); } catch { /* ignore */ }

      // Open the mic only after playback ends: on Android getUserMedia ducks any
      // sound currently playing, even on a separate context.
      global.setTimeout(async function () {
        if (finished) return;
        startBtn.textContent = "🎤 Opening mic…";
        if (!(await beginListening())) return;
        frames = []; hasClapped = false; maxEnergy = 0;
        listening = true;
        maxTimer = global.setTimeout(finishAttempt, MAX_LISTEN_MS);
        startBtn.textContent = "👏 Clap now!";
        statusEl.textContent = "Clap the rhythm back, then stop.";
      }, task.autoPlayAndRespondMs || 1500);
    });

    function showResult(res) {
      if (!res) { onResult(q.answer); return; }
      let html = `<p class="seq-score ${res.pass ? "ok" : res.matched > 0 ? "part" : "bad"}">${res.feedback}</p>`;
      if (res.total > 0) {
        html += `<p class="muted" style="font-size:.8em">${res.matched} of ${res.total} inter-clap gaps in time · ${res.detectedOnsets} claps detected.</p>`;
      }
      resultEl.innerHTML = html;
      resultEl.hidden = false;

      const detail = res.pass ? null : res.feedback;
      const actRow = C.el(`<div class="seq-btn-row"></div>`);
      actRow.appendChild(C.button("↺ Try again", function () {
        resultEl.hidden = true; actRow.remove();
        startBtn.textContent = "▶ Hear & clap back";
        statusEl.textContent = "";
      }));
      actRow.appendChild(C.button("Score it", function () {
        stopMic();
        onResult(res.pass ? q.answer : q.choices.find(function (c) { return c !== q.answer; }), detail);
      }, { className: res.pass ? "" : "ghost" }));
      panel.appendChild(actRow);
    }

    panel.appendChild(startBtn);
    panel.appendChild(pulseDot);
    panel.appendChild(statusEl);
    panel.appendChild(resultEl);
    view.appendChild(panel);
    return stopMic;
  }

  // --- Build task panel -----------------------------------------------------

  // Constructed-answer questions (q.buildTask): the learner builds the answer on
  // an interactive staff instead of choosing from a list. `onResult(correct)` is
  // called when they press "Check answer". With task.liveValidate on, each note
  // outside the target set is flagged red as it is placed - the real-time
  // feedback loop from issue #21. Returns a teardown that destroys the editor.
  function renderBuildTask(view, q, C, ctx, onResult) {
    const task = q.buildTask;
    const SE = global.MTT.staffEditor;
    const gradeOpts = { spelling: task.spelling, ignoreOctave: task.ignoreOctave, ordered: task.ordered };

    const panel = C.el(`<div class="build-panel"></div>`);
    const editor = SE.create({
      clef: task.clef,
      keySignature: task.keySignature || null,
      columns: task.columns,
      editableCols: task.editableCols,
      range: task.range,
      allowAccidentals: task.allowAccidentals,
      label: task.label,
      onChange: task.liveValidate
        ? function (notes) { editor.setValidity(SE.slotValidity(notes, task.target, gradeOpts)); }
        : null,
    });
    panel.appendChild(editor.el);

    const actionRow = C.el(`<div class="build-actions"></div>`);
    actionRow.appendChild(C.button("Check answer", function () {
      onResult(SE.grade(editor.getNotes(), task.target, gradeOpts));
    }));
    panel.appendChild(actionRow);
    view.appendChild(panel);
    editor.focusFirst();

    return function () { try { editor.destroy(); } catch { /* ok */ } };
  }

  // Dispatches to the appropriate mic handler based on task type.
  function renderMicTask(view, q, C, ctx, onResult) {
    if (q.micTask.type === "multiEcho") return renderMultiEcho(view, q, C, ctx, onResult);
    if (q.micTask.type === "sequence") return renderMicSequence(view, q, C, ctx, onResult);
    if (q.micTask.type === "pulse") return renderPulseTap(view, q, C, ctx, onResult);
    if (q.micTask.type === "clap") return renderClap(view, q, C, ctx, onResult);
    return renderMicPitch(view, q, C, ctx, onResult);
  }

  // --- Resume support ---------------------------------------------------

  // A resumable snapshot needs at least these to rebuild the session and pick
  // up where the learner left off; anything else missing/malformed just means
  // no lower-grade or single-topic context, which build()/buildSingle() handle.
  function isValidSnapshot(s) {
    return !!(s && typeof s === "object"
      && typeof s.seed === "number"
      && typeof s.idx === "number"
      && typeof s.score === "number"
      && s.settings && typeof s.settings === "object");
  }

  function findTopicById(ctx, id) {
    const all = ctx.session.quizableTopics(ctx.content).concat(ctx.session.auralTopics(ctx.content));
    return all.find((t) => t.id === id) || null;
  }

  // --- Main render ----------------------------------------------------------

  function render(main, ctx, arg) {
    const C = ctx.C;
    const saved = (arg && arg.resume) ? ctx.quizResume.load(ctx.sessionStore) : null;
    const resuming = isValidSnapshot(saved);

    let single = null;
    if (resuming && saved.singleId) {
      single = findTopicById(ctx, saved.singleId);
      if (!single) {
        // The saved topic no longer exists (e.g. content changed) - the
        // snapshot can't be honoured, so drop it and start a fresh session.
        ctx.quizResume.clear(ctx.sessionStore);
        return render(main, ctx, {});
      }
    } else if (!resuming) {
      single = arg && arg.single;
    }

    const settings = resuming ? saved.settings : ctx.store.settings();
    const seed = resuming ? saved.seed : (ctx.seed != null ? ctx.seed : undefined);
    const rng = ctx.rng.create(seed);
    const now = resuming ? saved.now : ctx.now();

    const sessionLength = settings.sessionLength || ctx.session.SESSION_LEN;
    // Frozen at session start (or restored from the snapshot) so answers
    // recorded mid-session - which update the live SRS map immediately - can't
    // change topic selection if the session is rebuilt here on resume.
    const srsSnapshot = resuming ? (saved.srsMap || {}) : JSON.parse(JSON.stringify(ctx.store.srsMap()));
    const session = single
      ? ctx.session.buildSingle(Object.assign({}, single), rng, sessionLength)
      : ctx.session.build({ content: ctx.content, settings, srsMap: srsSnapshot, rng, now, length: sessionLength });

    function playQuestionAudio(q, slower) {
      if (ctx.audio && ctx.audio.cancel) {
        // Best-effort only: replay should still continue if a stale audio graph
        // can't be cancelled cleanly during rapid replays or view switches.
        try { ctx.audio.cancel(); } catch { /* ok */ }
      }
      if (slower) withStretchedAudio(SLOW_REPLAY_FACTOR, function () { safe(q.audio); });
      else safe(q.audio);
    }

    function findLearnTopic(topicId) {
      for (const grade of ctx.content.grades || []) {
        const lesson = grade.topics && grade.topics.find((t) => t.id === topicId);
        if (lesson) return lesson;
      }
      return null;
    }

    // A button that opens the topic's "Why" explainer in a modal, falling back
    // to its Learn page lesson. Returns null if the topic has neither (e.g. an
    // aural topic with no matching theory lesson).
    function makeDigDeeperButton(topic, label) {
      if (topic.explainer) {
        const ex = (ctx.content.explainers || []).find((e) => e.id === topic.explainer);
        if (ex) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "dig-deeper";
          btn.innerHTML = `${label}: ${ex.title} <span aria-hidden="true">→</span>`;
          btn.addEventListener("click", () => {
            const m = ctx.C.openExplainerModal(btn);
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
          return btn;
        }
      }
      const lesson = findLearnTopic(topic.id);
      if (lesson) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "dig-deeper";
        btn.innerHTML = `${label}: ${lesson.title} <span aria-hidden="true">→</span>`;
        btn.addEventListener("click", () => ctx.router.navigate("learn", lesson.id));
        return btn;
      }
      return null;
    }

    if (!session.length) {
      if (resuming) ctx.quizResume.clear(ctx.sessionStore);
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

    const sessionLabel = single ? single.title : `Grade ${settings.grade} ${settings.mode === "path" ? "learning path" : "daily mix"}`;

    let idx = resuming ? Math.min(Math.max(0, saved.idx | 0), session.length) : 0;
    let score = resuming ? Math.max(0, saved.score | 0) : 0;
    let questionStart = ctx.now();
    let activeStopMic = null; // teardown for the current question's mic, if any
    let activeKeyHandler = null; // document keydown listener for number-key answers
    // True while there's a live, resumable session to protect - cleared once
    // finish() runs (it clears the resume snapshot itself), so the leaving cue
    // never fires for a completed session's summary screen.
    let sessionLive = true;
    const tally = (resuming && saved.tally && typeof saved.tally === "object") ? Object.assign({}, saved.tally) : {};

    // A small toast confirming the interrupted session is safe to resume -
    // shown on navigating away mid-quiz, since the resume mechanism (issue
    // #14) otherwise protects silently and the learner has no way to know.
    // Appended to the document body (not `main`) because the router clears
    // `main` immediately after this view's teardown runs.
    function showLeavingSavedCue() {
      const doc = global.document;
      if (!doc || !doc.body) return;
      const toast = doc.createElement("div");
      toast.className = "session-saved-toast";
      toast.setAttribute("role", "status");
      toast.textContent = "✓ Progress saved — resume anytime from Home.";
      doc.body.appendChild(toast);
      global.setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 4000);
    }

    function detachKeyHandler() {
      if (activeKeyHandler) { document.removeEventListener("keydown", activeKeyHandler); activeKeyHandler = null; }
    }

    // Persisted at the start of every question - never mid-reveal - so a
    // refresh can never replay an already-scored question and double-count it.
    function persistProgress() {
      ctx.quizResume.save({
        v: 1,
        seed: rng.seed,
        singleId: single ? single.id : null,
        settings: { grade: settings.grade, mode: settings.mode, sessionLength },
        srsMap: single ? null : srsSnapshot,
        now,
        idx,
        score,
        tally,
        label: sessionLabel,
        total: session.length,
      }, ctx.sessionStore);
    }

    nextQuestion();

    // Router calls this before navigating away: stop any open mic, remove the
    // document-level key listener so it can't outlive the view, and (for a
    // still-live session) reassure the learner their place was saved.
    return function teardown() {
      if (activeStopMic) { try { activeStopMic(); } catch { /* ok */ } activeStopMic = null; }
      detachKeyHandler();
      if (sessionLive) showLeavingSavedCue();
    };

    function nextQuestion() {
      if (idx >= session.length) return finish();
      persistProgress();
      detachKeyHandler();
      C.clear(main);
      const { topic, q } = session[idx];
      let answered = false;
      let newTopicBanner = null;
      questionStart = ctx.now();
      let stopMic = null; // cleanup function for mic sessions

      const view = C.el(`<div class="view"></div>`);

      const dots = session.map((_, i) =>
        `<span class="${i < idx ? "done" : i === idx ? "now" : ""}"></span>`).join("");
      view.appendChild(C.el(
        `<div class="progress-row" role="img" aria-label="Question ${idx + 1} of ${session.length}">`
        + `<div class="progress-dots" aria-hidden="true">${dots}</div>`
        + `<span class="progress-count">${idx + 1} / ${session.length}</span></div>`));
      const gradeName = topic.grade === 0 ? "Initial Grade" : `Grade ${topic.grade}`;
      view.appendChild(C.el(`<div class="topic-label">${gradeName} · ${topic.title}</div>`));

      // First-ever exposure to this topic (no recorded attempts yet): a bare
      // exam-style question is demoralising as an introduction, so show a
      // primer above it. Repeat exposures (card already has attempts) skip
      // this so the pretesting effect isn't lost.
      if (ctx.store.cardFor(topic.id).seen === 0) {
        newTopicBanner = C.el(`
          <div class="why-box new-topic-banner" role="note">
            <p style="margin:0 0 8px"><strong>New topic</strong>${topic.why ? " — " + topic.why : ""}</p>
          </div>`);
        const bannerRow = C.el(`<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"></div>`);
        const lessonBtn = makeDigDeeperButton(topic, "Read the lesson first");
        if (lessonBtn) bannerRow.appendChild(lessonBtn);
        bannerRow.appendChild(C.button("Dismiss", () => { if (newTopicBanner) newTopicBanner.remove(); newTopicBanner = null; }, { className: "ghost" }));
        newTopicBanner.appendChild(bannerRow);
        view.appendChild(newTopicBanner);
      }

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
        // Singing/memory tasks (micTask) are where a slower repeat is most
        // requested - the learner is trying to capture exact pitches/rhythm,
        // not just recognise a sound.
        if (q.micTask) {
          const slowBtn = C.playButton("Replay slower", () => playQuestionAudio(q, true));
          slowBtn.setAttribute("aria-label", "Replay the sound more slowly");
          slowBtn.style.marginLeft = "8px";
          view.appendChild(slowBtn);
        }
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

      if (q.buildTask) {
        stopMic = renderBuildTask(view, q, C, ctx, function (correct) {
          if (!answered) reveal(correct ? "correct" : "wrong", null);
        });
        activeStopMic = stopMic;
        idkBtn = document.createElement("button");
        idkBtn.className = "idk-btn";
        idkBtn.type = "button";
        idkBtn.textContent = "I don't know - show me";
        idkBtn.addEventListener("click", () => reveal("idk", null));
        view.appendChild(idkBtn);
      } else if (q.micTask) {
        stopMic = renderMicTask(view, q, C, ctx, function (detected, scoreDetail, quality) {
          if (!answered) reveal(detected === q.answer ? "correct" : "wrong", null, scoreDetail, quality);
        });
        activeStopMic = stopMic;
        const selfReport = C.el(`<div class="mic-self-report"></div>`);
        selfReport.appendChild(C.el(`<span class="muted" style="font-size:.88em;display:block;margin-bottom:6px">Self-report (if the mic or tapping isn't working) - your answer affects which topics the app revisits, so be honest:</span>`));
        q.choices.forEach((choice) => {
          // innerHTML (not textContent) so choices carrying notation markup (the
          // clap task's rhythm patterns) render as glyphs, not literal tags.
          const sb = document.createElement("button");
          sb.type = "button";
          sb.className = "btn ghost";
          sb.innerHTML = choice;
          sb.addEventListener("click", () => {
            if (!answered) reveal(choice === q.answer ? "correct" : "wrong", null);
          });
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
      if (!q.micTask && !q.buildTask) {
        activeKeyHandler = onKeydown;
        document.addEventListener("keydown", onKeydown);
      }

      function reveal(kind, pickedBtn, scoreDetail, quality) {
        if (answered) return;
        answered = true;
        if (newTopicBanner) { newTopicBanner.remove(); newTopicBanner = null; }
        detachKeyHandler();
        if (stopMic) { try { stopMic(); } catch { /* ok */ } stopMic = null; activeStopMic = null; }
        const correct = kind === "correct";
        if (correct) score++;
        const responseMs = ctx.now() - questionStart;
        // `quality` (sung takes) grades a partial attempt; `choices` feeds the
        // guess guard so a lucky answer on a two-way question is treated warily.
        // Mic tasks are graded by pitch, not the two-option self-report sentinel,
        // so their choice count would misfire the guard - omit it there.
        const answerRecord = { correct, responseMs, now: ctx.now() };
        if (!q.micTask && !q.buildTask && q.choices) answerRecord.choices = q.choices.length;
        if (typeof quality === "number") answerRecord.quality = quality;
        ctx.store.recordAnswer(topic.id, answerRecord);

        // Log a miss for the Progress view's "recent misses" review list. Mic
        // tasks are graded by pitch/rhythm rather than a literal answer choice
        // (see the verdict text below), so "your answer"/"correct answer" fall
        // back to the note/interval score detail rather than the self-report
        // sentinel.
        if (!correct) {
          const yourAnswer = q.micTask
            ? (scoreDetail || "(self-reported miss)")
            : q.buildTask
              ? (kind === "idk" ? "(said I don't know)" : "(built the wrong notes)")
              : (kind === "idk" ? "(said I don't know)" : stripTags(pickedBtn ? pickedBtn._choice : ""));
          const correctAnswerText = q.micTask
            ? "(sung/tapped task)"
            : q.buildTask
              ? (q.buildTask.answerText || "(constructed on the staff)")
              : stripTags(q.answer);
          ctx.store.recordMiss({
            topicId: topic.id,
            topicTitle: topic.title,
            grade: topic.grade,
            prompt: stripTags(q.prompt) || "(notation-based question)",
            yourAnswer,
            correctAnswer: correctAnswerText,
            at: ctx.now(),
          });
        }

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
              : q.buildTask
                ? `<span class="no">✗ Not quite.</span>`
                : `<span class="no">✗ Not quite</span> - the answer is <b>${q.answer}</b>.`
            : q.buildTask
              ? `<span class="idk-label">Here's how it's built.</span>`
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
        const dig = makeDigDeeperButton(topic, "Dig deeper");
        if (dig) revealEl.appendChild(dig);
        view.appendChild(revealEl);

        C.announce(
          (correct
            ? "Correct. "
            : q.micTask
              ? "Not quite. " + (scoreDetail ? scoreDetail + ". " : "")
              : q.buildTask
                ? "Not quite. "
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
      sessionLive = false; // nothing left to protect - the leaving cue would be noise here
      ctx.quizResume.clear(ctx.sessionStore);
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
      row.appendChild(C.button("Practise again", () => render(main, ctx, single ? { single } : undefined)));
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
