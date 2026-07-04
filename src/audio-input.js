/* audio-input.js - microphone input for aural training.
 *
 * Provides pitch detection (for sing-back tasks) using the autocorrelation
 * method (YIN-inspired), running on a small periodic sample rather than an
 * AudioWorklet so it stays compatible with the no-build-step architecture.
 *
 * Public surface: global `MTT.audioInput`.
 *
 * Usage:
 *   const mic = MTT.audioInput;
 *   const ok = await mic.requestPermission();   // returns true/false
 *   const stop = mic.startPitchDetection(({ midi, cents, clarity }) => { … });
 *   stop(); // stop the detector
 */
(function (global) {
  "use strict";

  // Minimum autocorrelation clarity to trust a pitch reading (0–1).
  const MIN_CLARITY = 0.85;
  // FFT / analysis buffer size (samples). 2048 @ 44100 Hz ≈ 46 ms per frame.
  const BUFFER_SIZE = 2048;
  // Polling interval (ms). We re-read the analyser at this rate.
  const POLL_MS = 80;
  // A4 = 440 Hz (MIDI 69).
  const A4_HZ = 440;
  const A4_MIDI = 69;

  let stream = null;       // MediaStream (kept for cleanup)
  let analyser = null;     // AnalyserNode
  let ctx = null;          // AudioContext (shared with MTT.audio when possible)
  let source = null;       // MediaStreamAudioSourceNode
  let pollTimer = null;    // setInterval handle

  function isAvailable() {
    return !!(global.navigator && global.navigator.mediaDevices && global.navigator.mediaDevices.getUserMedia);
  }

  // --- Pitch maths --------------------------------------------------------

  function hzToMidi(hz) {
    return A4_MIDI + 12 * Math.log2(hz / A4_HZ);
  }

  // Returns the nearest integer MIDI note and cent offset (-50 to +50).
  function midiAndCents(hz) {
    const exact = hzToMidi(hz);
    const midi = Math.round(exact);
    const cents = Math.round((exact - midi) * 100);
    return { midi, cents };
  }

  // --- Autocorrelation pitch detector (YIN-inspired) ----------------------
  // Returns detected frequency in Hz, or 0 if no clear pitch found.
  function detectPitch(buf, sampleRate) {
    const n = buf.length;
    // We only search lags corresponding to MIDI 36–84 (C2–C6): 65–1047 Hz.
    const minHz = 65;
    const maxHz = 1050;
    const minLag = Math.floor(sampleRate / maxHz);
    const maxLag = Math.ceil(sampleRate / minHz);

    // Compute sum-of-squared differences for each lag (SDF).
    let bestLag = -1;
    let bestVal = Infinity;

    // Cumulative mean normalized difference (CMND).
    const d = new Float32Array(maxLag + 1);
    // d[0] always 0 by definition.
    let runningSum = 0;
    for (let tau = 1; tau <= maxLag; tau++) {
      let sdf = 0;
      for (let j = 0; j < n - maxLag; j++) {
        const diff = buf[j] - buf[j + tau];
        sdf += diff * diff;
      }
      runningSum += sdf;
      d[tau] = (tau / runningSum) * sdf;
    }

    // Find first dip below threshold 0.15 in valid lag range.
    const THRESHOLD = 0.15;
    for (let tau = minLag; tau <= maxLag; tau++) {
      if (d[tau] < THRESHOLD) {
        // Refine with parabolic interpolation.
        let betterLag = tau;
        if (tau > 0 && tau < maxLag) {
          const s0 = d[tau - 1], s1 = d[tau], s2 = d[tau + 1];
          const shift = (s2 - s0) / (2 * (2 * s1 - s0 - s2));
          betterLag = tau + shift;
        }
        return { hz: sampleRate / betterLag, clarity: 1 - d[tau] };
      }
      // Track global minimum for fallback.
      if (d[tau] < bestVal) { bestVal = d[tau]; bestLag = tau; }
    }

    // No dip below threshold: use minimum, but clarity is low.
    if (bestLag < minLag) return { hz: 0, clarity: 0 };
    return { hz: sampleRate / bestLag, clarity: 1 - bestVal };
  }

  // --- Permission + stream management -------------------------------------

  async function requestPermission() {
    if (!isAvailable()) return false;
    try {
      const s = await global.navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      // We got it — but release immediately; the real stream opens on start.
      s.getTracks().forEach((t) => t.stop());
      return true;
    } catch {
      return false;
    }
  }

  function stop() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (source) { try { source.disconnect(); } catch { /* ok */ } source = null; }
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    analyser = null;
  }

  // Starts pitch detection. Calls `onPitch({ midi, cents, clarity, hz })` on
  // each frame. Returns a stop function. Rejects if permission is denied.
  async function startPitchDetection(onPitch) {
    if (!isAvailable()) throw new Error("Microphone not available in this browser.");
    stop(); // clean up any previous session

    // Disable audio processing: auto-gain and noise-suppression distort the raw
    // signal the autocorrelation detector needs, and turning them off reduces how
    // aggressively the OS audio session is reconfigured when the mic opens.
    stream = await global.navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      video: false,
    });

    // Use a dedicated AudioContext for mic — do NOT share with the playback context.
    // On mobile Chrome, adding a MediaStreamSource to the playback context triggers
    // audio rerouting (voice-comm mode) which cuts off any melody already playing.
    const AC = global.AudioContext || global.webkitAudioContext;
    ctx = new AC();

    analyser = ctx.createAnalyser();
    analyser.fftSize = BUFFER_SIZE * 2;
    analyser.smoothingTimeConstant = 0;

    source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);
    // Deliberately NOT connecting analyser → destination so mic doesn't feed back.

    const buf = new Float32Array(BUFFER_SIZE);

    pollTimer = setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      const { hz, clarity } = detectPitch(buf, ctx.sampleRate);
      if (clarity < MIN_CLARITY || hz <= 0) {
        onPitch({ midi: null, cents: 0, clarity, hz: 0 });
        return;
      }
      const { midi, cents } = midiAndCents(hz);
      onPitch({ midi, cents, clarity, hz });
    }, POLL_MS);

    return stop;
  }

  // --- MIDI / note utilities ----------------------------------------------

  // Note name for a MIDI number (e.g. 60 → "C4").
  // Pass useFlats=true for flat keys (F, Bb, Eb, …) so accidentals are spelled
  // correctly (e.g. Bb4 instead of A♯4) in "You sang" feedback.
  const NOTE_NAMES_SHARP = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
  const NOTE_NAMES_FLAT  = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];
  function midiToName(midi, useFlats) {
    if (midi == null) return "–";
    const names = useFlats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;
    const octave = Math.floor(midi / 12) - 1;
    return names[((midi % 12) + 12) % 12] + octave;
  }

  const api = {
    isAvailable,
    requestPermission,
    startPitchDetection,
    stop,
    midiToName,
    hzToMidi,
    midiAndCents,
    MIN_CLARITY,
  };

  global.MTT = global.MTT || {};
  global.MTT.audioInput = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
