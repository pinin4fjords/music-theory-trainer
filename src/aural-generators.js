/* aural-generators.js - a seeded, spec-constrained melodic stimulus engine.
 *
 * The aural trainer's echo, memory and spot-the-change tasks were originally
 * drawn from tiny hand-written phrase banks (4-7 items, all rooted on C, all
 * isochronous). Learners memorise such a bank long before the skill is trained.
 * This module replaces the banks with generated stimuli: seeded RNG in, a
 * schema-valid melody out, constrained by a per-grade spec that mirrors the
 * ABRSM requirements (key set, mode, range in scale degrees, rhythm palette,
 * maximum leap, start/end anchoring).
 *
 * Everything is threaded through the passed rng, so validate-content and the
 * generator tests keep their determinism guarantees.
 *
 * A `spec` looks like:
 *   {
 *     keys: ["C", "G", "F"],            // key names; one is chosen per call
 *     mode: "major" | "minor" | "either",
 *     range: { above: 2, below: 0 },    // scale degrees relative to the tonic
 *     bars: 2, beatsPerBar: 4,
 *     rhythmPalette: [[1,1,1,1], [2,1,1]], // per-bar duration patterns (beats)
 *     maxLeap: 2,                       // largest jump, in scale degrees
 *     startsOn: "tonic" | "mediant" | "dominant" | ["tonic","mediant"],
 *     endsOn: "tonic" | "free",
 *   }
 *
 * generateMelody returns:
 *   { key, mode, tonicMidi, notes: [midi...], durations: [beats...],
 *     degrees: [scaleDegree...], bars, beatsPerBar }
 * where notes.length === durations.length === degrees.length.
 *
 * Public surface: global `MTT.auralGen`.
 */
(function (global) {
  "use strict";

  const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
  const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10]; // natural minor
  const KEY_PC = {
    C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6,
    Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
  };
  const START_DEGREE = { tonic: 0, mediant: 2, dominant: 4 };

  // Semitone offset of an integer scale degree (0 = tonic) in the given mode,
  // for any degree including negatives and those beyond one octave.
  function degreeSemitone(deg, mode) {
    const steps = mode === "minor" ? MINOR_STEPS : MAJOR_STEPS;
    const oct = Math.floor(deg / 7);
    const idx = ((deg % 7) + 7) % 7;
    return oct * 12 + steps[idx];
  }

  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  function startDegree(startsOn, rng) {
    const choice = Array.isArray(startsOn) ? rng.pick(startsOn) : (startsOn || "tonic");
    return START_DEGREE[choice] != null ? START_DEGREE[choice] : 0;
  }

  // A constrained random walk over scale degrees. Mostly stepwise, with the
  // occasional leap up to maxLeap that then steps back the other way (a natural
  // melodic tendency), bounded by the range, starting on the requested degree
  // and - when endsOn is "tonic" - steered so the phrase can still reach the
  // tonic in the notes that remain without ever exceeding maxLeap.
  function walkDegrees(rng, n, spec, mode) {
    const below = (spec.range && spec.range.below) || 0;
    const above = (spec.range && spec.range.above != null) ? spec.range.above : 2;
    const min = -below, max = above;
    const maxLeap = spec.maxLeap || 1;
    const endTonic = spec.endsOn !== "free";

    const degs = [clamp(startDegree(spec.startsOn, rng), min, max)];
    for (let i = 1; i < n; i++) {
      if (endTonic && i === n - 1) { degs.push(0); break; } // land on the tonic
      const prev = degs[i - 1];
      const lastMove = i >= 2 ? degs[i - 1] - degs[i - 2] : 0;
      let move;
      if (Math.abs(lastMove) >= 2) {
        move = -Math.sign(lastMove); // step back after a leap
      } else {
        const canLeap = maxLeap >= 2 && rng.bool(0.25);
        const size = canLeap ? rng.int(2, maxLeap) : 1;
        move = (rng.bool() ? 1 : -1) * size;
      }
      let next = clamp(prev + move, min, max);
      if (next === prev) next = clamp(prev + (rng.bool() ? 1 : -1), min, max);
      // Reachability: with R steps left to reach the tonic, the note must stay
      // within R*maxLeap of it, or the closing step would have to be a bigger
      // leap than allowed. Pull it back toward the tonic when it strays too far.
      if (endTonic) {
        const bound = ((n - 1) - i) * maxLeap;
        if (next > bound) next = bound;
        else if (next < -bound) next = -bound;
      }
      degs.push(next);
    }
    return degs;
  }

  // Pick a rhythm: one per-bar pattern per bar, concatenated. When no palette is
  // given, fall back to an isochronous bar of crotchets.
  function chooseRhythm(rng, spec) {
    const bars = spec.bars || 1;
    const beatsPerBar = spec.beatsPerBar || 4;
    const palette = (spec.rhythmPalette && spec.rhythmPalette.length)
      ? spec.rhythmPalette
      : [Array(beatsPerBar).fill(1)];
    const durations = [];
    for (let b = 0; b < bars; b++) durations.push(...rng.pick(palette));
    return durations;
  }

  // Shift the whole phrase by octaves so it sits within a comfortable singing
  // register (roughly G3-G5), keeping every note's pitch class and the melody's
  // shape intact.
  function fitRegister(notes) {
    const LOW = 55, HIGH = 79; // G3 .. G5
    const out = notes.slice();
    let guard = 0;
    while (Math.max(...out) > HIGH && guard++ < 4) for (let i = 0; i < out.length; i++) out[i] -= 12;
    guard = 0;
    while (Math.min(...out) < LOW && guard++ < 4) for (let i = 0; i < out.length; i++) out[i] += 12;
    return out;
  }

  function generateMelody(rng, spec) {
    const mode = spec.mode === "either" ? (rng.bool() ? "major" : "minor") : (spec.mode || "major");
    const key = rng.pick(spec.keys);
    const durations = chooseRhythm(rng, spec);
    const n = durations.length;
    const degrees = walkDegrees(rng, n, spec, mode);
    const tonicMidi = 60 + (KEY_PC[key] != null ? KEY_PC[key] : 0);
    let notes = degrees.map((d) => tonicMidi + degreeSemitone(d, mode));
    notes = fitRegister(notes);
    return {
      key: key, mode: mode, tonicMidi: tonicMidi,
      notes: notes, durations: durations, degrees: degrees,
      bars: spec.bars || 1, beatsPerBar: spec.beatsPerBar || 4,
    };
  }

  // Produce a one-note variant of a generated melody for the spot-the-change
  // task. The change sits near the beginning or the end (but not always the very
  // first/last note), and is either a diatonic-step pitch change (up or down) or,
  // when allowRhythm is set, a lengthen/shorten of one note's duration.
  function generateChange(rng, melody, opts) {
    opts = opts || {};
    const n = melody.notes.length;
    const position = rng.bool() ? "beginning" : "end";
    // "near the beginning" = one of the first two notes; "near the end" = one of
    // the last two - but never trivially always index 0 or n-1.
    const idx = position === "beginning"
      ? clamp(rng.int(0, 1), 0, n - 1)
      : clamp(n - 1 - rng.int(0, 1), 0, n - 1);

    const isRhythm = !!opts.allowRhythm && rng.bool();
    if (isRhythm) {
      const durations = melody.durations.slice();
      const longer = rng.bool();
      durations[idx] = longer ? durations[idx] * 2 : durations[idx] / 2;
      return {
        kind: "rhythm", position: position, index: idx, longer: longer,
        original: { notes: melody.notes.slice(), durations: melody.durations.slice() },
        modified: { notes: melody.notes.slice(), durations: durations },
      };
    }

    // Diatonic-step pitch change: move that note one scale degree up or down.
    const below = -3, above = 10; // generous bounds; we only shift by one degree
    let dir = rng.bool() ? 1 : -1;
    let newDeg = clamp(melody.degrees[idx] + dir, below, above);
    if (newDeg === melody.degrees[idx]) { dir = -dir; newDeg = melody.degrees[idx] + dir; }
    const offset = degreeSemitone(newDeg, melody.mode) - degreeSemitone(melody.degrees[idx], melody.mode);
    const notes = melody.notes.slice();
    notes[idx] = notes[idx] + offset;
    return {
      kind: "pitch", position: position, index: idx, direction: dir > 0 ? "up" : "down",
      original: { notes: melody.notes.slice(), durations: melody.durations.slice() },
      modified: { notes: notes, durations: melody.durations.slice() },
    };
  }

  // Consonant harmonic intervals, in semitones (ignoring octave doublings):
  // minor/major 3rd, perfect 5th, minor/major 6th, octave. Perfect consonances
  // (5th, octave/unison) are tracked separately so parallels can be forbidden.
  const CONSONANT_SEMIS = [3, 4, 7, 8, 9, 12];
  const PERFECT_SEMIS = new Set([0, 7, 12]);

  function scalePcSet(key, mode) {
    const steps = mode === "minor" ? MINOR_STEPS : MAJOR_STEPS;
    const tonic = KEY_PC[key] != null ? KEY_PC[key] : 0;
    return new Set(steps.map((s) => (tonic + s) % 12));
  }

  // Build a genuinely independent companion line for a generated melody: a
  // first-species-style counterpoint where every note forms a consonance with
  // the melody, the companion stays diatonic, and parallel perfect 5ths/octaves
  // are forbidden (so the two lines are not the locked parallel thirds the old
  // `thirdBelow` produced). `direction` places it below (default) or above.
  function generateCompanion(rng, melody, opts) {
    opts = opts || {};
    const below = opts.direction !== "above";
    const pcs = scalePcSet(melody.key, melody.mode);
    const line = [];
    let prevInterval = null;
    let prevCompanion = null;
    for (let i = 0; i < melody.notes.length; i++) {
      const t = melody.notes[i];
      // Candidate companion pitches a consonant interval below (or above) that
      // are in key.
      const cands = [];
      for (const s of CONSONANT_SEMIS) {
        const c = below ? t - s : t + s;
        if (pcs.has(((c % 12) + 12) % 12)) cands.push({ midi: c, semi: s });
      }
      if (!cands.length) { line.push(below ? t - 12 : t + 12); prevInterval = 12; prevCompanion = line[i]; continue; }
      const scored = cands.map(function (cand) {
        let score = rng.float(0, 1);
        // Prefer imperfect consonances (3rds/6ths) for independence and colour.
        if (!PERFECT_SEMIS.has(cand.semi)) score += 1.5;
        // Prefer contrary/oblique motion between the two lines.
        if (i > 0) {
          const tMove = Math.sign(t - melody.notes[i - 1]);
          const cMove = Math.sign(cand.midi - prevCompanion);
          if (tMove !== 0 && cMove !== 0 && tMove !== cMove) score += 1.0; // contrary
          else if (cMove === 0 || tMove === 0) score += 0.5;               // oblique
          // Forbid parallel perfect consonances (same perfect interval, similar motion).
          if (PERFECT_SEMIS.has(cand.semi) && PERFECT_SEMIS.has(prevInterval) &&
              cand.semi === prevInterval && tMove === cMove && tMove !== 0) {
            score -= 10;
          }
        }
        return { cand: cand, score: score };
      }).sort(function (a, b) { return b.score - a.score; });
      const chosen = scored[0].cand;
      line.push(chosen.midi);
      prevInterval = chosen.semi;
      prevCompanion = chosen.midi;
    }
    return line;
  }

  const api = {
    generateMelody: generateMelody,
    generateChange: generateChange,
    generateCompanion: generateCompanion,
    scalePcSet: scalePcSet,
    CONSONANT_SEMIS: CONSONANT_SEMIS,
    degreeSemitone: degreeSemitone,
    MAJOR_STEPS: MAJOR_STEPS,
    MINOR_STEPS: MINOR_STEPS,
    KEY_PC: KEY_PC,
  };

  global.MTT = global.MTT || {};
  global.MTT.auralGen = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
