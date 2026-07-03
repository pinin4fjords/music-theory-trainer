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
  "memory": { keys: ["C", "G", "F"], mode: "either", range: { above: 4, below: 3 }, bars: 2, beatsPerBar: 3, rhythmPalette: [[1, 1, 1], [2, 1]], maxLeap: 2, startsOn: "tonic", endsOn: "tonic" },
};

describe("aural melody generator - spec conformance", () => {
  for (const [id, spec] of Object.entries(SPECS)) {
    it(`${id}: 200 generated melodies all obey the spec`, () => {
      const r = rng.create("melody-" + id);
      for (let i = 0; i < 200; i++) {
        const m = auralGen.generateMelody(r, spec);

        // Shape invariants.
        expect(m.notes.length).toBe(m.durations.length);
        expect(m.notes.length).toBe(m.degrees.length);
        expect(spec.keys).toContain(m.key);
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
