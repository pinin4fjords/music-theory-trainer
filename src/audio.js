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
  let scheduled = []; // pending setTimeout ids for multi-phase playback

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
    // Also unlock the piano context if it's been initialised. Gated on
    // `enabled` so a muted user's first click/keydown - which fires this
    // regardless of what they interacted with - doesn't trigger the piano's
    // lazy vendor-script download for sound they've opted out of.
    if (!enabled) return;
    const piano = global.MTT && global.MTT.audioPiano;
    if (piano && piano.unlock) piano.unlock();
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

  // Returns the piano engine when loaded and ready; null otherwise.
  // Checked at call time so audio.js can load before audio-piano.js. Also
  // triggers the (idempotent) lazy-load of the piano's vendor scripts on
  // first use, so playback never waits on them up front.
  function getPiano() {
    if (!enabled) return null;
    const p = global.MTT && global.MTT.audioPiano;
    if (p && p.preload) p.preload();
    return (p && p.isReady()) ? p : null;
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
    const p = getPiano();
    if (p) { lastPlay = () => p.note(n, dur); lastPlay(); return; }
    play((c) => tone(freqList([n])[0], c.currentTime, dur));
  }

  // `velocities`, when given, is a per-note loudness multiplier (0-1) used for
  // metric accents (strong/medium/weak beats). Omitted → uniform default gain.
  function sequence(notes, step = 0.42, dur = 0.46, velocities) {
    const p = getPiano();
    if (p) { lastPlay = () => p.sequence(notes, step, dur, velocities); lastPlay(); return; }
    play((c) => {
      const t0 = c.currentTime + 0.04;
      freqList(notes).forEach((f, i) => tone(f, t0 + i * step, dur, velocities ? 0.32 * velocities[i] : 0.25));
    });
  }

  // Play notes with per-note durations (in beats; 1 = crotchet) rather than a
  // fixed step — needed for genuine rhythm patterns (mixed note values), as
  // opposed to sequence()'s isochronous pulse. A `null` entry in notes is a
  // rest: silent, but still advances the clock by its duration.
  function sequenceRhythm(notes, durations, beatSec = 0.5, velocities) {
    const p = getPiano();
    if (p) { lastPlay = () => p.sequenceRhythm(notes, durations, beatSec, velocities); lastPlay(); return; }
    play((c) => {
      let t = c.currentTime + 0.04;
      notes.forEach((n, i) => {
        const noteDur = (durations[i] || 1) * beatSec;
        if (n !== null) tone(freqList([n])[0], t, noteDur * 0.88, velocities ? 0.32 * velocities[i] : 0.25);
        t += noteDur;
      });
    });
  }

  function chord(notes, dur = 1.1) {
    const p = getPiano();
    if (p) { lastPlay = () => p.chord(notes, dur); lastPlay(); return; }
    play((c) => {
      const t0 = c.currentTime + 0.04;
      freqList(notes).forEach((f) => tone(f, t0, dur, 0.18));
    });
  }

  // freqSequence and freqChord use raw frequencies for physics demos (harmonic
  // series, monochord) where exact Hz matters more than timbre — keep synthesis.
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

  // Play two note sequences back-to-back with a one-beat gap between them.
  function sequencePair(notes1, notes2, step = 0.42, dur = 0.46) {
    const p = getPiano();
    if (p) { lastPlay = () => p.sequencePair(notes1, notes2, step, dur); lastPlay(); return; }
    play((c) => {
      const t0 = c.currentTime + 0.04;
      const gap = notes1.length * step + step;
      freqList(notes1).forEach((f, i) => tone(f, t0 + i * step, dur));
      freqList(notes2).forEach((f, i) => tone(f, t0 + gap + i * step, dur));
    });
  }

  // Play at a specific volume level (aural dynamics tasks). Per-note gain, so a
  // concurrent sound's volume is never corrupted by mutating the shared master.
  function sequenceAt(notes, gain, step = 0.42, dur = 0.46) {
    const p = getPiano();
    if (p) { lastPlay = () => p.sequenceAt(notes, gain, step, dur); lastPlay(); return; }
    play((c) => {
      const g = Math.max(0, Math.min(1, gain));
      const t0 = c.currentTime + 0.04;
      freqList(notes).forEach((f, i) => tone(f, t0 + i * step, dur, g));
    });
  }

  // Repeat the most recent sound. lastPlay is either a zero-arg piano thunk or
  // a (c)=> synth function — handle both.
  function replay() {
    if (!lastPlay) return;
    if (lastPlay.length === 0) {
      if (enabled) { try { lastPlay(); } catch { /* ignore */ } }
    } else {
      play(lastPlay);
    }
  }

  function setEnabled(on) { enabled = !!on; }
  function isEnabled() { return enabled; }

  // Schedule the second (or later) phase of a multi-part stimulus. Unlike a bare
  // setTimeout, these fire only while audio is enabled and are all cancellable via
  // cancel(), so navigating away mid-phrase can't leak a delayed phrase into the
  // next view. Signature mirrors setTimeout: (fn, ms).
  function after(fn, ms) {
    const id = global.setTimeout(function () {
      scheduled = scheduled.filter((x) => x !== id);
      if (enabled) { try { fn(); } catch { /* never throw out of scheduled audio */ } }
    }, ms);
    scheduled.push(id);
    return id;
  }

  // Silence everything: clear pending scheduled phases and cancel any notes the
  // sampled-piano engine has queued on the audio clock. Called on navigation.
  function cancel() {
    scheduled.forEach((id) => global.clearTimeout(id));
    scheduled = [];
    const p = global.MTT && global.MTT.audioPiano;
    if (p && p.cancel) { try { p.cancel(); } catch { /* ok */ } }
  }

  const api = {
    note, sequence, sequenceRhythm, sequencePair, sequenceAt, chord, freqSequence, freqChord, replay,
    after, cancel, setEnabled, isEnabled, ensure, unlock, isAvailable,
  };

  global.MTT = global.MTT || {};
  global.MTT.audio = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
