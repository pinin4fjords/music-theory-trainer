import { describe, it, expect } from "vitest";

const { auralGen, rng } = globalThis.MTT;

// Pitch-class membership of a key's scale, for asserting generated notes stay
// in key. Mirrors the engine's own step tables but recomputed independently.
function scalePcs(key, mode) {
  const steps = mode === "minor" ? auralGen.MINOR_STEPS : auralGen.MAJOR_STEPS;
  const tonic = auralGen.KEY_PC[key];
  return new Set(steps.map((s) => (tonic + s) % 12));
}

const SPECS = {
  "g1-echo": { keys: ["C"], mode: "major", range: { above: 2, below: 0 }, bars: 1, beatsPerBar: 3, rhythmPalette: [[1, 1, 1]], maxLeap: 1, startsOn: ["tonic", "mediant"], endsOn: "free" },
  "g3-echo": { keys: ["C", "G", "F"], mode: "either", range: { above: 4, below: 3 }, bars: 1, beatsPerBar: 4, rhythmPalette: [[1, 1, 1, 1], [2, 1, 1]], maxLeap: 2, startsOn: "tonic", endsOn: "free" },
  "memory": { keys: ["C", "G", "D", "A", "F", "Bb", "Eb"], minorKeys: ["A", "E", "B", "F#", "D", "G", "C"], mode: "either", range: { above: 4, below: 3 }, bars: 2, beatsPerBar: 3, rhythmPalette: [[1, 1, 1], [2, 1], [1, 2]], maxLeap: 2, startsOn: "tonic", endsOn: "tonic" },
};

// Sharps/flats in a key signature, for asserting the copy's "up to N accidentals"
// claim. Minor keys borrow their relative major's signature.
const MAJOR_ACCIDENTALS = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, "F#": 6, "C#": 7, F: 1, Bb: 2, Eb: 3, Ab: 4, Db: 5, Gb: 6 };
const MINOR_REL_MAJOR = { A: "C", E: "G", B: "D", "F#": "A", "C#": "E", "G#": "B", D: "F", G: "Bb", C: "Eb", F: "Ab", Bb: "Db" };
function keyAccidentals(key, mode) {
  return mode === "minor" ? MAJOR_ACCIDENTALS[MINOR_REL_MAJOR[key]] : MAJOR_ACCIDENTALS[key];
}

describe("aural melody generator - spec conformance", () => {
  for (const [id, spec] of Object.entries(SPECS)) {
    it(`${id}: 200 generated melodies all obey the spec`, () => {
      const r = rng.create("melody-" + id);
      for (let i = 0; i < 200; i++) {
        const m = auralGen.generateMelody(r, spec);

        // Shape invariants.
        expect(m.notes.length).toBe(m.durations.length);
        expect(m.notes.length).toBe(m.degrees.length);
        const keyPool = (m.mode === "minor" && spec.minorKeys) ? spec.minorKeys : spec.keys;
        expect(keyPool).toContain(m.key);
        expect(["major", "minor"]).toContain(m.mode);

        // Rhythm sums to the bar length.
        const total = m.durations.reduce((s, d) => s + d, 0);
        expect(total).toBeCloseTo(spec.bars * spec.beatsPerBar, 6);

        // Degrees inside the declared range.
        const min = -spec.range.below, max = spec.range.above;
        for (const d of m.degrees) {
          expect(d).toBeGreaterThanOrEqual(min);
          expect(d).toBeLessThanOrEqual(max);
        }

        // Start / end anchoring.
        const starts = Array.isArray(spec.startsOn) ? spec.startsOn : [spec.startsOn];
        const startMap = { tonic: 0, mediant: 2, dominant: 4 };
        expect(starts.map((s) => startMap[s])).toContain(m.degrees[0]);
        if (spec.endsOn === "tonic") expect(m.degrees[m.degrees.length - 1]).toBe(0);

        // Every note is a member of the key's scale.
        const pcs = scalePcs(m.key, m.mode);
        for (const midi of m.notes) expect(pcs.has(((midi % 12) + 12) % 12)).toBe(true);

        // No adjacent leap exceeds maxLeap scale degrees.
        for (let k = 1; k < m.degrees.length; k++) {
          expect(Math.abs(m.degrees[k] - m.degrees[k - 1])).toBeLessThanOrEqual(spec.maxLeap);
        }
      }
    });
  }

  it("memory: keys stay within 3 sharps/flats and honour the major/minor pools", () => {
    const spec = SPECS["memory"];
    const r = rng.create("memory-accidentals");
    const seenMajor = new Set(), seenMinor = new Set();
    for (let i = 0; i < 400; i++) {
      const m = auralGen.generateMelody(r, spec);
      expect(keyAccidentals(m.key, m.mode)).toBeLessThanOrEqual(3);
      if (m.mode === "major") { expect(spec.keys).toContain(m.key); seenMajor.add(m.key); }
      else { expect(spec.minorKeys).toContain(m.key); seenMinor.add(m.key); }
    }
    // Flat majors and sharp minors - unreachable before the pools were widened -
    // are now drawn.
    expect(seenMajor.has("Bb")).toBe(true);
    expect(seenMinor.has("F#")).toBe(true);
  });

  it("is deterministic: same seed => identical melody", () => {
    const spec = SPECS["g3-echo"];
    const a = rng.create("det-melody");
    const b = rng.create("det-melody");
    for (let i = 0; i < 20; i++) {
      const ma = auralGen.generateMelody(a, spec);
      const mb = auralGen.generateMelody(b, spec);
      expect(mb.notes).toEqual(ma.notes);
      expect(mb.durations).toEqual(ma.durations);
    }
  });
});

describe("aural sight-sing melody generator - spec conformance", () => {
  // Mirrors src/aural-content.js's MELODY_SPECS.g4SightSing/g5SightSing/
  // g6SightSing: sight-singing begins and ends on the tonic (exam-board 4B/5B/6B),
  // and 5B/6B permit exactly one exception to stepwise motion - the rising
  // dominant-below-to-tonic 4th.
  const SIGHT_SPECS = {
    "g4-sight": { keys: ["C", "F", "G"], mode: "major", range: { above: 2, below: 2 }, bars: 1, beatsPerBar: 5, rhythmPalette: [[1, 1, 1, 1, 1]], maxLeap: 2, startsOn: "tonic", endsOn: "tonic" },
    "g5-sight": { keys: ["C", "F", "G", "D", "Bb"], mode: "major", range: { above: 4, below: 3 }, bars: 1, beatsPerBar: 6, rhythmPalette: [[1, 1, 1, 1, 1, 1]], maxLeap: 1, startsOn: "tonic", endsOn: "tonic", leap: { from: -3, to: 0, chance: 0.5 } },
    "g6-sight": { keys: ["C", "F", "G", "D", "Bb"], mode: "major", range: { above: 7, below: 3 }, bars: 1, beatsPerBar: 7, rhythmPalette: [[1, 1, 1, 1, 1, 1, 1]], maxLeap: 1, startsOn: "tonic", endsOn: "tonic", leap: { from: -3, to: 0, chance: 0.5 } },
    // The shared g7SightSing/g8SightSing two-part spec: same tonic anchoring and
    // stepwise-plus-rising-4th rule, keys up to 4 sharps or flats.
    "g78-sight": { keys: ["C", "G", "D", "A", "E", "F", "Bb", "Eb", "Ab"], mode: "major", range: { above: 7, below: 3 }, bars: 1, beatsPerBar: 6, rhythmPalette: [[1, 1, 1, 1, 1, 1]], maxLeap: 1, startsOn: "tonic", endsOn: "tonic", leap: { from: -3, to: 0, chance: 0.5 } },
  };
  const SIGHT_ACCIDENTAL_LIMIT = { "g4-sight": 1, "g5-sight": 2, "g6-sight": 2, "g78-sight": 4 };

  for (const [id, spec] of Object.entries(SIGHT_SPECS)) {
    it(`${id}: 300 generated phrases begin and end on the tonic and only ever leap via the declared exception`, () => {
      const r = rng.create("sight-" + id);
      let sawLeap = false;
      for (let i = 0; i < 300; i++) {
        const m = auralGen.generateMelody(r, spec);

        expect(spec.keys).toContain(m.key);
        expect(keyAccidentals(m.key, m.mode)).toBeLessThanOrEqual(SIGHT_ACCIDENTAL_LIMIT[id]);
        expect(m.degrees[0]).toBe(0);
        expect(m.degrees[m.degrees.length - 1]).toBe(0);

        const pcs = scalePcs(m.key, m.mode);
        for (const midi of m.notes) expect(pcs.has(((midi % 12) + 12) % 12)).toBe(true);

        for (let k = 1; k < m.degrees.length; k++) {
          const delta = m.degrees[k] - m.degrees[k - 1];
          if (Math.abs(delta) > spec.maxLeap) {
            expect(spec.leap).toBeTruthy();
            expect(m.degrees[k - 1]).toBe(spec.leap.from);
            expect(m.degrees[k]).toBe(spec.leap.to);
            sawLeap = true;
          }
        }
      }
      if (spec.leap) expect(sawLeap).toBe(true);
    });
  }
});

describe("aural companion-line (counterpoint) generator", () => {
  const CONSONANT = new Set([0, 3, 4, 7, 8, 9]); // semitones mod octave
  const PERFECT = new Set([0, 7]);
  // The g3 echo melody and the Grade 7/8 two-part sight-singing line are both
  // harmonised by generateCompanion below; the counterpoint must hold for each.
  const COMPANION_SPECS = {
    "g3-echo": SPECS["g3-echo"],
    "g78-sight": { keys: ["C", "G", "D", "A", "E", "F", "Bb", "Eb", "Ab"], mode: "major", range: { above: 7, below: 3 }, bars: 1, beatsPerBar: 6, rhythmPalette: [[1, 1, 1, 1, 1, 1]], maxLeap: 1, startsOn: "tonic", endsOn: "tonic", leap: { from: -3, to: 0, chance: 0.5 } },
  };

  for (const [id, spec] of Object.entries(COMPANION_SPECS)) {
    it(`${id}: companion is consonant, diatonic, below the melody, with no parallel perfect 5ths/8ves`, () => {
      const r = rng.create("companion-" + id);
      for (let i = 0; i < 200; i++) {
        const m = auralGen.generateMelody(r, spec);
        const comp = auralGen.generateCompanion(r, m, { direction: "below" });
        expect(comp.length).toBe(m.notes.length);
        const pcs = auralGen.scalePcSet(m.key, m.mode);

        const intervals = [];
        for (let k = 0; k < comp.length; k++) {
          expect(comp[k]).toBeLessThanOrEqual(m.notes[k]); // below (or unison)
          expect(pcs.has(((comp[k] % 12) + 12) % 12)).toBe(true); // diatonic
          const semi = ((m.notes[k] - comp[k]) % 12 + 12) % 12;
          expect(CONSONANT.has(semi)).toBe(true); // consonant
          intervals.push(semi);
        }

        // No two consecutive identical perfect consonances moving in the same
        // direction (parallel 5ths / octaves).
        for (let k = 1; k < comp.length; k++) {
          if (PERFECT.has(intervals[k]) && intervals[k] === intervals[k - 1]) {
            const tMove = Math.sign(m.notes[k] - m.notes[k - 1]);
            const cMove = Math.sign(comp[k] - comp[k - 1]);
            const parallel = tMove !== 0 && tMove === cMove;
            expect(parallel).toBe(false);
          }
        }
      }
    });
  }
});

describe("aural spot-the-change generator", () => {
  const spec = SPECS["g3-echo"];

  it("changes exactly one note (pitch) or one duration (rhythm), near the start or end", () => {
    const r = rng.create("change");
    for (let i = 0; i < 200; i++) {
      const m = auralGen.generateMelody(r, spec);
      const c = auralGen.generateChange(r, m, { allowRhythm: true });

      expect(["beginning", "end"]).toContain(c.position);
      const n = m.notes.length;
      if (c.position === "beginning") expect(c.index).toBeLessThanOrEqual(1);
      else expect(c.index).toBeGreaterThanOrEqual(n - 2);

      if (c.kind === "pitch") {
        // Durations untouched; exactly one note differs.
        expect(c.modified.durations).toEqual(c.original.durations);
        const diffs = c.modified.notes.filter((v, k) => v !== c.original.notes[k]);
        expect(diffs.length).toBe(1);
        expect(c.modified.notes[c.index]).not.toBe(c.original.notes[c.index]);
      } else {
        // Notes untouched; exactly one duration differs.
        expect(c.modified.notes).toEqual(c.original.notes);
        const diffs = c.modified.durations.filter((v, k) => v !== c.original.durations[k]);
        expect(diffs.length).toBe(1);
      }
    }
  });
});
