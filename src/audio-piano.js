/* audio-piano.js - sampled piano audio for the aural trainer.
 *
 * Wraps the WebAudioFont player + JCLive piano soundfont to provide the same
 * surface as MTT.audio (note, sequence, sequencePair, sequenceAt). Only
 * activates when both vendor scripts are loaded; gracefully absent otherwise.
 *
 * Exposed as MTT.audioPiano. aural-content.js prefers this when isReady()
 * returns true, falling back to the oscillator synth in MTT.audio.
 *
 * Public surface: global `MTT.audioPiano`.
 */
(function (global) {
  "use strict";

  let _ctx = null;
  let _masterGain = null;
  let _player = null;
  let _instrument = null;

  function isReady() {
    return typeof global.WebAudioFontPlayer === "function" &&
           typeof global._tone_0000_JCLive_sf2_file !== "undefined";
  }

  function ensure() {
    if (!isReady()) return null;
    const AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    try {
      if (!_ctx) {
        _ctx = new AC();
        _masterGain = _ctx.createGain();
        _masterGain.gain.value = 0.8;
        _masterGain.connect(_ctx.destination);
        _player = new global.WebAudioFontPlayer();
        _instrument = global._tone_0000_JCLive_sf2_file;
        _player.adjustPreset(_ctx, _instrument);
      }
      if (_ctx.state === "suspended" && _ctx.resume) _ctx.resume();
      return _ctx;
    } catch {
      return null;
    }
  }

  function toMidi(n) {
    if (typeof n === "number") return Math.round(n);
    const M = global.MTT && global.MTT.music;
    if (!M) return 60;
    if (typeof n === "string") return Math.round(12 * Math.log2(M.noteToFreq(n) / 440) + 69);
    if (typeof n === "object") return M.spelledToMidi(n);
    return 60;
  }

  function queueNote(ctx, midi, when, dur, vol) {
    if (!_player || !_instrument) return;
    try {
      _player.queueWaveTable(ctx, _masterGain, _instrument, when, midi, dur, vol);
    } catch { /* one bad note must never break a session */ }
  }

  function note(n, dur) {
    dur = dur === undefined ? 0.6 : dur;
    const ctx = ensure();
    if (!ctx) return;
    queueNote(ctx, toMidi(n), ctx.currentTime + 0.04, dur, 1.0);
  }

  function sequence(notes, step, dur) {
    step = step === undefined ? 0.42 : step;
    dur = dur === undefined ? 0.46 : dur;
    const ctx = ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + 0.04;
    notes.forEach(function (n, i) { queueNote(ctx, toMidi(n), t0 + i * step, dur, 1.0); });
  }

  // Play two phrases back-to-back with a one-beat gap (used by spot-the-change).
  function sequencePair(notes1, notes2, step, dur) {
    step = step === undefined ? 0.42 : step;
    dur = dur === undefined ? 0.46 : dur;
    const ctx = ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + 0.04;
    const gap = notes1.length * step + step;
    notes1.forEach(function (n, i) { queueNote(ctx, toMidi(n), t0 + i * step, dur, 1.0); });
    notes2.forEach(function (n, i) { queueNote(ctx, toMidi(n), t0 + gap + i * step, dur, 1.0); });
  }

  // Play at a specific volume level (used by aural dynamics tasks: forte/piano).
  // gain=0.75 → full volume, gain=0.12 → quiet, matching the MTT.audio convention.
  function sequenceAt(notes, gain, step, dur) {
    step = step === undefined ? 0.42 : step;
    dur = dur === undefined ? 0.46 : dur;
    const ctx = ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + 0.04;
    const vol = Math.max(0.04, Math.min(1.0, gain / 0.75));
    notes.forEach(function (n, i) { queueNote(ctx, toMidi(n), t0 + i * step, dur, vol); });
  }

  function cancel() {
    if (_ctx && _player) {
      try { _player.cancelQueue(_ctx); } catch { /* ignore */ }
    }
  }

  function unlock() {
    const ctx = ensure();
    if (ctx && ctx.state === "suspended" && ctx.resume) {
      const p = ctx.resume();
      if (p && typeof p.catch === "function") p.catch(function () {});
    }
  }

  const api = {
    note: note,
    sequence: sequence,
    sequencePair: sequencePair,
    sequenceAt: sequenceAt,
    cancel: cancel,
    unlock: unlock,
    isReady: isReady,
  };

  global.MTT = global.MTT || {};
  global.MTT.audioPiano = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
