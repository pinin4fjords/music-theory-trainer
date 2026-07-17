/* rhythm-grade.js - pure timing analysis for the tap-the-pulse and clap-back
 * aural tasks. No Web Audio, no DOM: energy envelopes and timestamp arrays in,
 * scores out, so the scoring can be unit-tested without a real microphone.
 *
 *   detectOnsets(frames, opts)      energy envelope -> onset times (ms)
 *   gradeClap(targetIOIs, onsets)   clapped rhythm vs target inter-onset gaps
 *   gradeTaps({taps, accents, ...}) tap-along pulse: stability, tempo, accent
 *
 * Public surface: global `MTT.rhythmGrade`.
 */
(function (global) {
  "use strict";

  function clamp01(x) {
    return x < 0 ? 0 : x > 1 ? 1 : x;
  }

  // Successive differences of a sorted timestamp array (the inter-onset
  // intervals). n timestamps yield n-1 intervals.
  function toIOIs(times) {
    const out = [];
    for (let i = 1; i < times.length; i++) out.push(times[i] - times[i - 1]);
    return out;
  }

  // Peak-pick onsets from an energy envelope. `frames` is a sequence of
  // non-negative energy readings (e.g. per-frame RMS) spaced `hopMs` apart. An
  // onset is a local maximum that rises sharply above the recent local baseline
  // and clears an absolute floor, with a refractory gap so one clap's decay
  // ripple can't register twice. Returns onset times in milliseconds.
  function detectOnsets(frames, opts) {
    opts = opts || {};
    const hopMs = opts.hopMs != null ? opts.hopMs : 16;
    const refractoryMs = opts.refractoryMs != null ? opts.refractoryMs : 90;
    const ratio = opts.ratio != null ? opts.ratio : 1.8;
    const windowFrames = opts.windowFrames != null ? opts.windowFrames : 8;
    const floor = opts.floor != null ? opts.floor : 0.008;
    const floorFrac = opts.floorFrac != null ? opts.floorFrac : 0.15;

    const n = frames.length;
    if (n === 0) return [];

    let globalMax = 0;
    for (let i = 0; i < n; i++) if (frames[i] > globalMax) globalMax = frames[i];
    const absFloor = Math.max(floor, globalMax * floorFrac);

    const onsets = [];
    let lastOnsetFrame = -Infinity;
    for (let i = 1; i < n; i++) {
      let sum = 0, cnt = 0;
      for (let j = Math.max(0, i - windowFrames); j < i; j++) { sum += frames[j]; cnt++; }
      const baseline = cnt ? sum / cnt : 0;
      const rising = frames[i] > frames[i - 1];
      const isLocalMax = i + 1 >= n || frames[i] >= frames[i + 1];
      const strong = frames[i] >= absFloor && frames[i] >= baseline * ratio;
      if (rising && isLocalMax && strong && (i - lastOnsetFrame) * hopMs >= refractoryMs) {
        onsets.push(i * hopMs);
        lastOnsetFrame = i;
      }
    }
    return onsets;
  }

  // Grade a clapped rhythm against target inter-onset intervals. Tempo is
  // normalised out (a correct rhythm clapped fast or slow still passes): the
  // overall speed is fitted first, then each interval is checked against its
  // scaled target within `tolerance` (a fraction of that interval). Wrong onset
  // counts are penalised and never pass.
  //
  // targetIOIs and onsetTimes may be in any consistent unit (ms recommended).
  function gradeClap(targetIOIs, onsetTimes, opts) {
    opts = opts || {};
    const tolerance = opts.tolerance != null ? opts.tolerance : 0.28;
    const passScore = opts.passScore != null ? opts.passScore : 0.75;

    const targets = targetIOIs || [];
    const onsets = (onsetTimes || []).slice().sort(function (a, b) { return a - b; });
    const detIOIs = toIOIs(onsets);
    const expected = targets.length;

    const result = {
      expectedOnsets: expected + 1,
      detectedOnsets: onsets.length,
      matched: 0,
      total: expected,
      countOk: detIOIs.length === expected,
      score: 0,
      pass: false,
      feedback: "",
    };

    if (onsets.length === 0) {
      result.feedback = "No claps detected. Try again, clapping firmly.";
      return result;
    }
    if (expected === 0 || detIOIs.length === 0) {
      result.feedback = "Only one clap detected. Clap the whole rhythm.";
      return result;
    }

    const k = Math.min(detIOIs.length, expected);
    let sumDet = 0, sumTgt = 0;
    for (let i = 0; i < k; i++) { sumDet += detIOIs[i]; sumTgt += targets[i]; }
    const scale = sumTgt > 0 ? sumDet / sumTgt : 1;

    let matched = 0;
    for (let i = 0; i < k; i++) {
      const exp = targets[i] * scale;
      if (exp > 0 && Math.abs(detIOIs[i] - exp) <= tolerance * exp) matched++;
    }
    result.matched = matched;

    // Penalise extra or missing claps by dividing hits over the larger interval
    // count, so 5 claps against a 4-clap target can never score a clean pass.
    const denom = Math.max(expected, detIOIs.length);
    result.score = denom > 0 ? matched / denom : 0;
    result.pass = result.countOk && result.score >= passScore;

    if (!result.countOk) {
      result.feedback = onsets.length > expected + 1
        ? `Too many claps (${onsets.length} for ${expected + 1}); clap only the notes you heard.`
        : `Too few claps (${onsets.length} for ${expected + 1}); clap every note.`;
    } else if (result.pass) {
      result.feedback = "Rhythm matched.";
    } else {
      result.feedback = `${matched} of ${expected} gaps in time; listen again for the long and short notes.`;
    }
    return result;
  }

  // Fraction of taps whose accent flag matches the best-fitting downbeat grid:
  // accents should recur every `beatsPerBar` taps. Trying every starting phase
  // tolerates the learner beginning their accent count on any tap. Returns 0
  // when no tap was accented (the strong-beat task was not attempted).
  function scoreAccents(accents, beatsPerBar) {
    const n = accents.length;
    if (!n || !beatsPerBar) return 0;
    let numAccents = 0;
    for (let i = 0; i < n; i++) if (accents[i]) numAccents++;
    if (numAccents === 0) return 0;

    let best = 0;
    for (let r = 0; r < beatsPerBar; r++) {
      let match = 0;
      for (let i = 0; i < n; i++) {
        const expected = (i % beatsPerBar) === r;
        if (expected === !!accents[i]) match++;
      }
      if (match > best) best = match;
    }
    return best / n;
  }

  // Grade a tap-along-the-pulse attempt.
  //   input.taps         array of tap timestamps (ms)
  //   input.accents      parallel booleans: which taps were the strong beat
  //   input.targetBeatMs the played pulse's beat period (for tempo accuracy)
  //   input.beatsPerBar  bar length (for accent grading)
  // Returns component scores in [0,1] (tempoStability, tempoAccuracy, accent),
  // an overall score, and a pass flag. tempoAccuracy/accent are null when the
  // needed inputs are absent.
  function gradeTaps(input, opts) {
    input = input || {};
    opts = opts || {};
    const stabilityTol = opts.stabilityTol != null ? opts.stabilityTol : 0.18;
    const tempoTol = opts.tempoTol != null ? opts.tempoTol : 0.22;
    const minTaps = opts.minTaps != null ? opts.minTaps : 4;
    const passStability = opts.passStability != null ? opts.passStability : 0.5;

    const taps = (input.taps || []).slice().sort(function (a, b) { return a - b; });
    const accents = input.accents || null;
    const targetBeatMs = input.targetBeatMs;
    const beatsPerBar = input.beatsPerBar || null;

    const result = {
      tapCount: taps.length,
      meanIOI: null,
      bpm: null,
      cv: null,
      tempoStability: 0,
      tempoAccuracy: null,
      accent: null,
      overall: 0,
      pass: false,
      feedback: "",
    };

    const iois = toIOIs(taps);
    if (iois.length < Math.max(1, minTaps - 1)) {
      result.feedback = "Not enough taps. Tap along for the whole pulse.";
      return result;
    }

    let mean = 0;
    for (let i = 0; i < iois.length; i++) mean += iois[i];
    mean /= iois.length;
    result.meanIOI = mean;
    result.bpm = mean > 0 ? 60000 / mean : null;

    let variance = 0;
    for (let i = 0; i < iois.length; i++) variance += (iois[i] - mean) * (iois[i] - mean);
    variance /= iois.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
    result.cv = cv;
    result.tempoStability = clamp01(1 - cv / stabilityTol);

    if (targetBeatMs) {
      const err = Math.abs(mean - targetBeatMs) / targetBeatMs;
      result.tempoAccuracy = clamp01(1 - err / tempoTol);
    }

    if (accents && beatsPerBar && accents.length === taps.length) {
      result.accent = scoreAccents(accents, beatsPerBar);
    }

    const parts = [result.tempoStability];
    if (result.tempoAccuracy != null) parts.push(result.tempoAccuracy);
    if (result.accent != null) parts.push(result.accent);
    let overall = 0;
    for (let i = 0; i < parts.length; i++) overall += parts[i];
    result.overall = overall / parts.length;

    result.pass = result.tempoStability >= passStability
      && (result.tempoAccuracy == null || result.tempoAccuracy >= 0.4)
      && (result.accent == null || result.accent >= 0.5);

    if (result.pass) {
      result.feedback = "Steady pulse, well placed.";
    } else if (result.tempoStability < passStability) {
      result.feedback = "Uneven tapping. Keep the gaps between taps equal.";
    } else if (result.accent != null && result.accent < 0.5) {
      result.feedback = "Accent the first beat of each bar more consistently.";
    } else {
      result.feedback = "Close. Match the pulse tempo more exactly.";
    }
    return result;
  }

  const api = { detectOnsets, gradeClap, gradeTaps, scoreAccents, toIOIs };

  global.MTT = global.MTT || {};
  global.MTT.rhythmGrade = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
