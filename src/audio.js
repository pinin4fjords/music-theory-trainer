/* audio.js - the sound engine.
 *
 * A tiny Web Audio synth (oscillator + ADSR gain) with no audio files, so the app
 * stays self-contained and offline. Plays single notes, melodic/harmonic intervals,
 * scales and chords, plus raw-frequency playback for the tuning / harmonic-series
 * demos.
 *
 * Lifecycle is hardened against browser autoplay policy:
 *   - The AudioContext is created lazily and only on a user gesture.
 *   - `unlock()` (wired to the first click/keypress) resumes a suspended context.
 *   - Every play call is wrapped so a single audio failure never breaks a quiz.
 *   - `replay()` repeats the last thing played (used by the "replay" control).
 *   - In a non-browser/Node context (tests) every call is a safe no-op.
 *
 * Public surface: global `MTT.audio` (deliberately NOT the native `Audio`).
 */
(function (global) {
  "use strict";

  let ctx = null;
  let master = null;
  let enabled = true;
  let lastPlay = null; // a thunk replaying the previous sound

  function AudioCtor() {
    return global.AudioContext || global.webkitAudioContext || null;
  }

  function isAvailable() {
    return !!AudioCtor();
  }

  // Create the context lazily; resume if the browser suspended it. Returns the
  // context, or null when audio is unavailable (e.g. Node) - callers must handle.
  function ensure() {
    const AC = AudioCtor();
    if (!AC) return null;
    try {
      if (!ctx) {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.6;
        master.connect(ctx.destination);
      }
      if (ctx.state === "suspended" && ctx.resume) ctx.resume();
      return ctx;
    } catch {
      return null;
    }
  }

  // Resume audio on a user gesture (autoplay policy). Safe to call repeatedly.
  function unlock() {
    const c = ensure();
    if (c && c.state === "suspended" && c.resume) {
      const p = c.resume();
      if (p && typeof p.catch === "function") p.catch(() => {});
    }
  }

  function tone(freq, when, dur = 0.6, gain = 0.25, type = "triangle") {
    if (!ctx || !master || !Number.isFinite(freq)) return;
    try {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      const a = 0.012, rel = 0.18;
      env.gain.setValueAtTime(0, when);
      env.gain.linearRampToValueAtTime(gain, when + a);
      env.gain.setValueAtTime(gain, when + Math.max(a, dur - rel));
      env.gain.linearRampToValueAtTime(0, when + dur);
      osc.connect(env).connect(master);
      osc.start(when);
      osc.stop(when + dur + 0.02);
    } catch {
      /* one bad tone must never break a session */
    }
  }

  const music = () => global.MTT.music;

  function freqList(notes) {
    const M = music();
    return notes.map((n) =>
      typeof n === "number" ? M.midiToFreq(n)
        : typeof n === "object" ? M.midiToFreq(M.spelledToMidi(n))
          : M.noteToFreq(n));
  }

  // Wrap a play action: respect the enabled flag, ensure the context, remember it
  // for replay, and swallow any error.
  function play(fn) {
    if (!enabled) return;
    const c = ensure();
    if (!c) return;
    lastPlay = fn;
    try {
      fn(c);
    } catch {
      /* never throw out of a play call */
    }
  }

  function note(n, dur = 0.6) {
    play((c) => tone(freqList([n])[0], c.currentTime, dur));
  }

  function sequence(notes, step = 0.42, dur = 0.46) {
    play((c) => {
      const t0 = c.currentTime + 0.04;
      freqList(notes).forEach((f, i) => tone(f, t0 + i * step, dur));
    });
  }

  function chord(notes, dur = 1.1) {
    play((c) => {
      const t0 = c.currentTime + 0.04;
      freqList(notes).forEach((f) => tone(f, t0, dur, 0.18));
    });
  }

  function freqSequence(freqs, step = 0.5, dur = 0.5) {
    play((c) => {
      const t0 = c.currentTime + 0.04;
      freqs.forEach((f, i) => tone(f, t0 + i * step, dur));
    });
  }

  function freqChord(freqs, dur = 1.4) {
    play((c) => {
      const t0 = c.currentTime + 0.04;
      freqs.forEach((f) => tone(f, t0, dur, 0.16));
    });
  }

  // Repeat the most recent sound (the "replay" / "hear it again" control).
  function replay() {
    if (lastPlay) play(lastPlay);
  }

  function setEnabled(on) { enabled = !!on; }
  function isEnabled() { return enabled; }

  const api = {
    note, sequence, chord, freqSequence, freqChord, replay,
    setEnabled, isEnabled, ensure, unlock, isAvailable,
  };

  global.MTT = global.MTT || {};
  global.MTT.audio = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
