// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";

const { music: M, notation: N, staffEditor: SE } = globalThis.MTT;

const note = (letter, accidental, octave) => ({ letter, accidental, octave });
const C4 = note("C", 0, 4);
const trebleRange = { minMidi: M.noteToMidi("C4"), maxMidi: M.noteToMidi("C6") };

function key(el, k, opts = {}) {
  el.dispatchEvent(new KeyboardEvent("keydown", Object.assign({ key: k, bubbles: true }, opts)));
}

describe("notation - interactive markup", () => {
  it("tags each notehead with a focusable slot only when interactive", () => {
    const spec = { clef: "treble", notes: [[C4]] };
    expect(N.staffHTML(spec)).not.toMatch(/note-slot/);

    const html = N.staffHTML(Object.assign({ interactive: true }, spec));
    expect(html).toMatch(/class="note-slot"/);
    expect(html).toMatch(/data-col="0"/);
    expect(html).toMatch(/data-note="0"/);
    expect(html).toMatch(/tabindex="0"/);
    expect(html).toMatch(/aria-label="C4"/);
  });

  it("tags every note of a chord column separately", () => {
    const html = N.staffHTML({ clef: "treble", notes: [[C4, note("E", 0, 4), note("G", 0, 4)]], interactive: true });
    expect((html.match(/class="note-slot"/g) || []).length).toBe(3);
    expect(html).toMatch(/data-note="2"/);
  });
});

describe("staffEditor.grade / slotValidity", () => {
  it("grades exact spelling and enharmonic pitch differently", () => {
    expect(SE.grade([C4], [C4])).toBe(true);
    // B#4 sounds like C5, not C4 - wrong pitch and wrong spelling.
    expect(SE.grade([note("B", 1, 4)], [C4], { spelling: "exact" })).toBe(false);
    // C and B# (same octave region) are the same pitch: accepted only under pitch.
    const bSharp = note("B", 1, 3); // B#3 == C4
    expect(SE.grade([bSharp], [C4], { spelling: "pitch" })).toBe(true);
    expect(SE.grade([bSharp], [C4], { spelling: "exact" })).toBe(false);
  });

  it("honours ignoreOctave", () => {
    expect(SE.grade([note("C", 0, 5)], [C4], { spelling: "exact" })).toBe(false);
    expect(SE.grade([note("C", 0, 5)], [C4], { spelling: "exact", ignoreOctave: true })).toBe(true);
  });

  it("is order-insensitive by default and order-sensitive when asked", () => {
    const cMaj = [C4, note("E", 0, 4), note("G", 0, 4)];
    const scrambled = [note("G", 0, 4), C4, note("E", 0, 4)];
    expect(SE.grade(scrambled, cMaj)).toBe(true);
    expect(SE.grade(scrambled, cMaj, { ordered: true })).toBe(false);
  });

  it("flags per-note validity for live feedback", () => {
    const built = [C4, note("F", 0, 4)];
    const target = [C4, note("E", 0, 4)];
    expect(SE.slotValidity(built, target, { spelling: "exact", ordered: true })).toEqual(["ok", "error"]);
  });
});

describe("staffEditor - interactive editing", () => {
  let onChange, ed;
  beforeEach(() => {
    document.body.innerHTML = "";
    onChange = vi.fn();
  });

  function mount(opts) {
    ed = SE.create(Object.assign({ clef: "treble", range: trebleRange, onChange }, opts));
    document.body.appendChild(ed.el);
    return ed;
  }

  it("shifts pitch a diatonic step with Up/Down and fires onChange", () => {
    mount({ columns: [[C4]], editableCols: [0] });
    const slot = ed.el.querySelector(".note-slot");
    key(slot, "ArrowUp");
    expect(ed.getNotes()[0]).toMatchObject({ letter: "D", accidental: 0, octave: 4 });
    expect(onChange).toHaveBeenCalled();
    key(ed.el.querySelector(".note-slot"), "ArrowDown");
    expect(ed.getNotes()[0]).toMatchObject({ letter: "C", accidental: 0, octave: 4 });
  });

  it("adds sharps and flats with Shift+Up/Down, clamped to a double accidental", () => {
    mount({ columns: [[note("F", 0, 4)]], editableCols: [0] });
    const slot = () => ed.el.querySelector(".note-slot");
    key(slot(), "ArrowUp", { shiftKey: true });
    expect(ed.getNotes()[0]).toMatchObject({ letter: "F", accidental: 1, octave: 4 });
    key(slot(), "ArrowUp", { shiftKey: true }); // double sharp
    key(slot(), "ArrowUp", { shiftKey: true }); // clamped, still +2
    expect(ed.getNotes()[0].accidental).toBe(2);
  });

  it("refuses a nudge outside the allowed range", () => {
    // Min is C4; a step down from C4 would be B3, out of range - rejected.
    mount({ columns: [[C4]], editableCols: [0] });
    key(ed.el.querySelector(".note-slot"), "ArrowDown");
    expect(ed.getNotes()[0]).toMatchObject({ letter: "C", accidental: 0, octave: 4 });
  });

  it("moves focus between editable notes with Left/Right", () => {
    mount({ columns: [[C4], [note("E", 0, 4)]], editableCols: [0, 1] });
    ed.focusFirst();
    expect(document.activeElement.dataset.col).toBe("0");
    key(document.activeElement, "ArrowRight");
    expect(document.activeElement.dataset.col).toBe("1");
    key(document.activeElement, "ArrowLeft");
    expect(document.activeElement.dataset.col).toBe("0");
  });

  it("marks non-editable notes as fixed and not focusable", () => {
    mount({ columns: [[C4], [note("E", 0, 4)]], editableCols: [1] });
    const fixed = ed.el.querySelector('.note-slot[data-col="0"]');
    expect(fixed.classList.contains("fixed")).toBe(true);
    expect(fixed.getAttribute("tabindex")).toBe("-1");
  });

  it("applies validity classes and survives a re-render", () => {
    mount({ columns: [[C4], [note("E", 0, 4)]], editableCols: [0, 1] });
    ed.setValidity(["error", "ok"]);
    expect(ed.el.querySelector('.note-slot[data-col="0"]').classList.contains("error")).toBe(true);
    expect(ed.el.querySelector('.note-slot[data-col="1"]').classList.contains("ok")).toBe(true);
    // A nudge re-renders the SVG; the validity styling must be re-applied.
    key(ed.el.querySelector('.note-slot[data-col="1"]'), "ArrowUp");
    expect(ed.el.querySelector('.note-slot[data-col="0"]').classList.contains("error")).toBe(true);
  });

  it("never mutates the caller's seed columns", () => {
    const seed = [[C4]];
    mount({ columns: seed, editableCols: [0] });
    key(ed.el.querySelector(".note-slot"), "ArrowUp");
    expect(seed[0][0]).toMatchObject({ letter: "C", accidental: 0, octave: 4 });
  });
});
