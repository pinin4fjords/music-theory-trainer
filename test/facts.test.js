/**
 * Fact-check of the published numbers. Every figure shown in the Reference tab
 * is re-derived here from first principles (or cross-checked against the music
 * engine) so a typo or an edit-drift in the curriculum fails the suite. This is
 * the deterministic half of the project's fact-checking pass; conceptual and
 * historical prose is audited separately and recorded in FACT-CHECK.md.
 */
import { describe, it, expect } from "vitest";

const { content, music: M } = globalThis.MTT;

const section = (id) => {
  const s = content.reference.find((r) => r.id === id);
  if (!s) throw new Error("no reference section: " + id);
  return s;
};
// Tables that print signed cents use a real minus sign (U+2212).
const num = (s) => Number(String(s).replace(/[−‒-―]/g, "-").replace(/[^\d.-]/g, ""));
const log2 = (x) => Math.log2(x);

describe("facts - interval ratios vs cents (Acoustics: 'ratios')", () => {
  const rows = section("ratios").rows; // [name, "a:b", justCents, equalCents, "Equal is"]

  it.each(rows)("%s: just cents = 1200·log2(ratio)", (name, ratio, justStr) => {
    const [a, b] = ratio.split(":").map(Number);
    const just = 1200 * log2(a / b);
    expect(Math.abs(just - num(justStr))).toBeLessThanOrEqual(1);
  });

  it.each(rows)("%s: equal cents is the nearest 12-TET semitone to just", (name, ratio, justStr, equalStr) => {
    const [a, b] = ratio.split(":").map(Number);
    const just = 1200 * log2(a / b);
    const equal = num(equalStr);
    expect(equal % 100).toBe(0);
    expect(equal).toBe(Math.round(just / 100) * 100);
  });

  it.each(rows)("%s: 'Equal is' delta = equal − just", (name, ratio, justStr, equalStr, deltaStr) => {
    expect(num(deltaStr)).toBe(num(equalStr) - num(justStr));
  });
});

describe("facts - note frequencies (Acoustics: 'frequencies')", () => {
  const rows = section("frequencies").rows; // [name, "x Hz", "±n from A4"]

  it.each(rows)("%s: printed Hz = 440·2^((n−69)/12)", (name, hz, dist) => {
    expect(num(hz).toFixed(2)).toBe(M.noteToFreq(name).toFixed(2));
    const semis = M.noteToMidi(name) - M.noteToMidi("A4");
    expect(parseInt(dist, 10)).toBe(semis);
  });

  it("A4 is exactly 440.00 Hz and the octave doubles frequency", () => {
    const a4 = rows.find((r) => r[0] === "A4");
    expect(num(a4[1]).toFixed(2)).toBe("440.00");
    expect(M.noteToFreq("C5") / M.noteToFreq("C4")).toBeCloseTo(2, 9);
  });
});

describe("facts - acoustic constants (Acoustics: 'constants')", () => {
  const byTerm = Object.fromEntries(section("constants").items.map((i) => [i.term, i.def]));

  // The published figure must equal the value computed here, to its own precision.
  const expectDefContains = (term, value) => {
    expect(byTerm[term], term).toBeDefined();
    expect(byTerm[term]).toContain(value);
  };

  it("equal semitone ≈ 1.0595 (×2^(1/12)) and ≈ 5.95% rise", () => {
    expectDefContains("Equal semitone", Math.pow(2, 1 / 12).toFixed(4)); // 1.0595
    expectDefContains("Equal semitone", ((Math.pow(2, 1 / 12) - 1) * 100).toFixed(2)); // 5.95
  });

  it("Pythagorean comma ≈ 23.46 cents (twelve 5ths overshoot seven octaves)", () => {
    const cents = 1200 * log2(Math.pow(3 / 2, 12) / Math.pow(2, 7));
    expectDefContains("Pythagorean comma", cents.toFixed(2)); // 23.46
  });

  it("syntonic comma = 81:80 ≈ 21.51 cents", () => {
    expectDefContains("Syntonic comma", "81:80");
    expectDefContains("Syntonic comma", (1200 * log2(81 / 80)).toFixed(2)); // 21.51
  });

  it("octave is the 2:1 ratio", () => {
    expectDefContains("Octave", "2:1");
  });
});

describe("facts - interval semitone counts (Pitch & keys: 'intervals')", () => {
  const rows = section("intervals").rows; // [name, semitones, "C - X [/ C - Y]"]
  const note = (tok) => tok.trim() + (/\d/.test(tok) ? "" : "4");

  it.each(rows)("%s: semitone count matches the worked example", (name, semis, example) => {
    const pair = example.split("/")[0].split("-").map((t) => t.trim());
    const lo = M.noteToMidi(note(pair[0]));
    const hi = M.noteToMidi(note(pair[1]));
    // Unison and octave both read "C - C"; assert their defining size directly.
    if (lo === hi) {
      expect([0, 12]).toContain(Number(semis));
    } else {
      expect(hi - lo).toBe(Number(semis));
    }
  });

  it("a perfect octave is 12 semitones", () => {
    expect(M.noteToMidi("C5") - M.noteToMidi("C4")).toBe(12);
  });
});

describe("facts - order of sharps & flats (Pitch & keys: 'order')", () => {
  const items = Object.fromEntries(section("order").items.map((i) => [i.term, i.def]));
  const letters = (def) => def.split(/\s+-\s+|\s+–\s+/)[0].trim().split(/\s+/).map((t) => t[0]);
  const pc = (l) => M.LETTER_SEMITONES[l];
  const step = (seq, i) => (pc(seq[i + 1]) - pc(seq[i]) + 12) % 12;

  it("each sharp sits a perfect 5th (7 semitones) above the last", () => {
    const seq = letters(items["Order of sharps"]);
    expect(seq).toEqual(["F", "C", "G", "D", "A", "E", "B"]);
    for (let i = 0; i < seq.length - 1; i++) expect(step(seq, i)).toBe(7);
  });

  it("the flats are the sharps reversed (each a perfect 5th below)", () => {
    const sharps = letters(items["Order of sharps"]);
    const flats = letters(items["Order of flats"]);
    expect(flats).toEqual([...sharps].reverse());
    for (let i = 0; i < flats.length - 1; i++) expect(step(flats, i)).toBe(5);
  });
});

describe("facts - key signatures (Pitch & keys: 'keys')", () => {
  // Independent canonical reference: major key -> [sharps(+)/flats(-), relative minor].
  const CANON = {
    "C major": [0, "A minor"], "G major": [1, "E minor"], "D major": [2, "B minor"],
    "A major": [3, "F# minor"], "E major": [4, "C# minor"], "B major": [5, "G# minor"],
    "F# major": [6, "D# minor"], "C# major": [7, "A# minor"],
    "F major": [-1, "D minor"], "Bb major": [-2, "G minor"], "Eb major": [-3, "C minor"],
    "Ab major": [-4, "F minor"], "Db major": [-5, "Bb minor"], "Gb major": [-6, "Eb minor"],
    "Cb major": [-7, "Ab minor"],
  };
  const rows = section("keys").rows; // [key, "n sharps|flats|none", glyph, relMinor]

  it.each(rows)("%s: accidental count and relative minor match the canon", (key, count, glyph, relMinor) => {
    const [n, minor] = CANON[key];
    expect(CANON[key], key).toBeDefined();
    const expected = n === 0 ? "none" : `${Math.abs(n)} ${n > 0 ? "sharp" : "flat"}${Math.abs(n) > 1 ? "s" : ""}`;
    expect(count).toBe(expected);
    expect(relMinor).toBe(minor);
  });

  it("covers all fifteen standard major keys", () => {
    expect(rows.map((r) => r[0]).sort()).toEqual(Object.keys(CANON).sort());
  });
});

describe("facts - scale step patterns (engine data behind 'scales')", () => {
  // Canonical T/S step sets, independent of the engine's own SCALE_STEPS.
  const CANON = {
    major: [2, 2, 1, 2, 2, 2, 1], naturalMinor: [2, 1, 2, 2, 1, 2, 2],
    harmonicMinor: [2, 1, 2, 2, 1, 3, 1], melodicMinorAsc: [2, 1, 2, 2, 2, 2, 1],
    dorian: [2, 1, 2, 2, 2, 1, 2], phrygian: [1, 2, 2, 2, 1, 2, 2],
    lydian: [2, 2, 2, 1, 2, 2, 1], mixolydian: [2, 2, 1, 2, 2, 1, 2],
    aeolian: [2, 1, 2, 2, 1, 2, 2], locrian: [1, 2, 2, 1, 2, 2, 2],
  };

  it.each(Object.entries(CANON))("%s: engine pattern matches the canon and spans an octave", (name, steps) => {
    expect(M.SCALE_STEPS[name]).toEqual(steps);
    expect(steps.reduce((a, b) => a + b, 0)).toBe(12);
  });

  it("Aeolian is identical to the natural minor", () => {
    expect(M.SCALE_STEPS.aeolian).toEqual(M.SCALE_STEPS.naturalMinor);
  });
});

describe("facts - chord spellings (Chords: 'chordtypes')", () => {
  const items = section("chordtypes").items;
  // Build ascending spelled notes from a "C-E♭-G" spelling, bumping the octave
  // whenever the pitch class fails to rise, so the chord reads bottom-to-top.
  const parseChord = (def) => {
    const inner = def.match(/\(([^)]+)\)/)[1];
    const toks = inner.split("-").map((t) => t.trim());
    let oct = 4, prevMidi = -Infinity;
    return toks.map((t) => {
      let sp = M.parseSpelled(t, oct);
      if (M.spelledToMidi(sp) <= prevMidi) { oct += 1; sp = M.parseSpelled(t, oct); }
      prevMidi = M.spelledToMidi(sp);
      return sp;
    });
  };

  const TRIAD = { "Major triad": "major", "Minor triad": "minor", "Diminished triad": "diminished", "Augmented triad": "augmented" };

  it.each(Object.entries(TRIAD))("%s: engine confirms the printed spelling", (term, quality) => {
    const def = items.find((i) => i.term === term).def;
    expect(M.triadQuality(parseChord(def))).toBe(quality);
  });

  const SEVENTH = {
    "Dominant 7th": ["major", "minor", 7],
    "Major 7th": ["major", "major", 7],
    "Minor 7th": ["minor", "minor", 7],
    "Diminished 7th": ["diminished", "diminished", 7],
    "Half-diminished 7th": ["diminished", "minor", 7],
  };

  it.each(Object.entries(SEVENTH))("%s: triad + 7th quality match the printed spelling", (term, [triadQ, seventhQ, seventhN]) => {
    const def = items.find((i) => i.term === term).def;
    const notes = parseChord(def);
    expect(M.triadQuality(notes.slice(0, 3))).toBe(triadQ);
    const seventh = M.interval(notes[0], notes[3]);
    expect(seventh.quality).toBe(seventhQ);
    expect(seventh.number).toBe(seventhN);
  });
});

describe("facts - scale-degree names (Pitch & keys: 'degrees')", () => {
  it("reference names match the engine's degree order", () => {
    const refNames = section("degrees").rows.map((r) => r[1].toLowerCase());
    expect(refNames).toEqual(M.DEGREE_NAMES.map((n) => n.toLowerCase()));
  });
});
