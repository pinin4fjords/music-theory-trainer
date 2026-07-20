import { describe, it, expect } from "vitest";

const { content, staffEditor: SE, music: M, validate, rng } = globalThis.MTT;
const H = content.helpers;

// Column-major flat notes with their originating column index, matching the
// order staffEditor uses for getNotes()/target.
function flatWithCols(columns) {
  const out = [];
  columns.forEach((col, ci) => col.forEach((n) => out.push({ n, col: ci })));
  return out;
}

const GENERATORS = [
  ["buildNoteQuestion", (r) => H.buildNoteQuestion(r)],
  ["buildTonicTriadQuestion", (r) => H.buildTonicTriadQuestion(r, ["C", "G", "D", "F", "Bb"])],
  ["buildIntervalAboveQuestion", (r) => H.buildIntervalAboveQuestion(r, ["C", "D", "E", "F", "G", "A", "B"])],
  ["buildHarmonicSeventhQuestion", (r) => H.buildHarmonicSeventhQuestion(r)],
  ["buildDominantSeventhQuestion", (r) => H.buildDominantSeventhQuestion(r, ["C", "G", "F", "D"])],
];

describe("content - build-task generators", () => {
  for (const [name, gen] of GENERATORS) {
    it(`${name} produces valid, solvable build tasks`, () => {
      const r = rng.create("build-" + name);
      for (let i = 0; i < 60; i++) {
        const q = gen(r);
        const v = validate.validateQuestion(q);
        expect(v.errors, name + " errors: " + v.errors.join("; ")).toEqual([]);

        const bt = q.buildTask;
        expect(Array.isArray(bt.target) && bt.target.length).toBeTruthy();
        const opts = { spelling: bt.spelling, ignoreOctave: bt.ignoreOctave, ordered: bt.ordered };

        // Every target note is inside the editor's compass and legally spelt,
        // so the learner can actually reach it with steps + accidentals.
        bt.target.forEach((n) => {
          const midi = M.spelledToMidi(n);
          expect(midi).toBeGreaterThanOrEqual(bt.range.minMidi);
          expect(midi).toBeLessThanOrEqual(bt.range.maxMidi);
          expect(Math.abs(n.accidental)).toBeLessThanOrEqual(2);
        });

        // Fixed (non-editable) notes must already equal the target at their
        // positions, so editing only the editable slots can complete the task.
        const editable = new Set(bt.editableCols);
        const start = flatWithCols(bt.columns);
        expect(start.length).toBe(bt.target.length);
        start.forEach((slot, k) => {
          if (!editable.has(slot.col)) {
            expect(M.spelledName(slot.n) + slot.n.octave).toBe(M.spelledName(bt.target[k]) + bt.target[k].octave);
          }
        });

        // The target grades itself as correct under its own policy.
        expect(SE.grade(bt.target, bt.target, opts)).toBe(true);
      }
    });
  }
});
