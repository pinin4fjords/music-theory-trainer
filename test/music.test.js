import { describe, it, expect } from "vitest";

const M = globalThis.MTT.music;

describe("music - note <-> MIDI", () => {
  it("parses scientific pitch names", () => {
    expect(M.noteToMidi("C4")).toBe(60);
    expect(M.noteToMidi("A4")).toBe(69);
    expect(M.noteToMidi("Eb4")).toBe(63);
    expect(M.noteToMidi("F#5")).toBe(78);
    expect(M.noteToMidi("C♯4")).toBe(61);
    expect(M.noteToMidi("C")).toBe(60); // defaults to octave 4
  });

  it("frequencies: A4 = 440, octave doubles", () => {
    expect(M.midiToFreq(69)).toBeCloseTo(440, 6);
    expect(M.midiToFreq(81) / M.midiToFreq(69)).toBeCloseTo(2, 6);
  });

  it("spelledName / parseSpelled round-trip including double accidentals", () => {
    expect(M.spelledName(M.spelled("F", 2, 4))).toBe("F𝄪");
    expect(M.spelledName(M.spelled("B", -2, 4))).toBe("B𝄫");
    const fx = M.parseSpelled("F𝄪");
    expect(fx.accidental).toBe(2);
    expect(M.parseSpelled("Bb").accidental).toBe(-1);
    expect(M.parseSpelled("C#").accidental).toBe(1);
  });
});

describe("music - intervals", () => {
  const cases = [
    ["C", "E", "major 3rd", 4],
    ["C", "Eb", "minor 3rd", 3],
    ["C", "G", "perfect 5th", 7],
    ["C", "Gb", "diminished 5th", 6],
    ["C", "F#", "augmented 4th", 6],
    ["C", "B", "major 7th", 11],
    ["C", "Bb", "minor 7th", 10],
    ["C", "C", "perfect unison", 0],
  ];
  it.each(cases)("%s up to %s is a %s (%i semitones)", (lo, hi, name, semis) => {
    const iv = M.interval(M.parseSpelled(lo), M.parseSpelled(hi));
    expect(iv.name).toBe(name);
    expect(iv.semitones).toBe(semis);
  });

  it("classifies compound intervals and marks them compound", () => {
    const iv = M.interval(M.spelled("C", 0, 4), M.spelled("E", 0, 5));
    expect(iv.number).toBe(10);
    expect(iv.quality).toBe("major");
    expect(iv.name).toBe("major 10th");
    expect(iv.compound).toBe(true);
  });

  it("invertInterval: numbers sum to 9, quality flips", () => {
    expect(M.invertInterval(6, "minor")).toMatchObject({ number: 3, quality: "major" });
    expect(M.invertInterval(5, "perfect")).toMatchObject({ number: 4, quality: "perfect" });
    expect(M.invertInterval(2, "augmented")).toMatchObject({ number: 7, quality: "diminished" });
  });

  it("inverting twice returns the original simple interval", () => {
    for (const [n, q] of [[2, "major"], [3, "minor"], [4, "perfect"], [6, "minor"], [7, "major"]]) {
      const back = M.invertInterval(M.invertInterval(n, q).number, M.invertInterval(n, q).quality);
      expect(back).toMatchObject({ number: n, quality: q });
    }
  });
});

describe("music - transpose (roundtrip invariant)", () => {
  const combos = [[2, "major"], [3, "minor"], [3, "major"], [4, "perfect"], [5, "diminished"], [5, "perfect"], [6, "major"], [7, "minor"]];
  const roots = ["C", "D", "E", "F", "G", "A", "B"];
  it("interval(root, transpose(root, n, q)) recovers n and q (ascending)", () => {
    for (const r of roots) {
      for (const [n, q] of combos) {
        const top = M.transpose(r, n, q, 1);
        const iv = M.interval(M.parseSpelled(r), top);
        expect({ number: iv.number, quality: iv.quality }).toEqual({ number: n, quality: q });
      }
    }
  });

  it("transposing down a major 3rd from C gives Ab", () => {
    expect(M.spelledName(M.transpose("C", 3, "major", -1))).toBe("A♭");
  });
});

describe("music - scales", () => {
  it("D major is spelled D E F# G A B C# D", () => {
    expect(M.scale("D", "major").map((n) => M.spelledName(n, { unicode: false }))).toEqual(
      ["D", "E", "F#", "G", "A", "B", "C#", "D"]);
  });

  it("A harmonic minor raises the 7th (G#) creating an augmented 2nd", () => {
    const sc = M.scale("A", "harmonicMinor");
    expect(sc.map((n) => M.spelledName(n, { unicode: false }))).toEqual(
      ["A", "B", "C", "D", "E", "F", "G#", "A"]);
    const aug2 = M.interval(sc[5], sc[6]); // F up to G#
    expect(aug2).toMatchObject({ number: 2, quality: "augmented" });
  });

  it("every scale uses each of the seven letters once (correct enharmonic spelling)", () => {
    for (const key of ["C", "G", "D", "A", "E", "B", "F#", "Db", "Eb", "Ab"]) {
      const letters = M.scale(key, "major").slice(0, 7).map((n) => n.letter);
      expect(new Set(letters).size).toBe(7);
    }
  });
});

describe("music - key signatures", () => {
  it("counts sharps/flats correctly", () => {
    expect(M.keySignature("C", "major").count).toBe(0);
    expect(M.keySignature("G", "major")).toMatchObject({ count: 1, type: "sharp", accidentals: ["F"] });
    expect(M.keySignature("F", "major")).toMatchObject({ count: -1, type: "flat", accidentals: ["B"] });
    expect(M.keySignature("C#", "major").count).toBe(7);
    expect(M.keySignature("Cb", "major").count).toBe(-7);
  });

  it("a minor key borrows its relative major's signature", () => {
    expect(M.keySignature("A", "minor").count).toBe(0); // relative of C
    expect(M.keySignature("E", "minor").count).toBe(1); // relative of G
    expect(M.keySignature("C#", "minor").count).toBe(4); // relative of E
  });
});

describe("music - triads & enharmonics", () => {
  it("triadQuality derives the chord type", () => {
    expect(M.triadQuality(M.chordTriad("C", "major"))).toBe("major");
    expect(M.triadQuality(M.chordTriad("C", "minor"))).toBe("minor");
    expect(M.triadQuality(M.chordTriad("C", "diminished"))).toBe("diminished");
    expect(M.triadQuality(M.chordTriad("C", "augmented"))).toBe("augmented");
  });

  it("inversions move the bass note up an octave", () => {
    const root = M.triad("C", "major", 1, 0);
    const first = M.triad("C", "major", 1, 1);
    expect(M.spelledName(first[0])).toBe(M.spelledName(root[1])); // 3rd in the bass
  });

  it("sameSound recognises enharmonic equivalents", () => {
    expect(M.sameSound(M.spelled("F", 2, 4), M.spelled("G", 0, 4))).toBe(true);
    expect(M.sameSound(M.spelled("G", 1, 4), M.spelled("A", -1, 4))).toBe(true);
    expect(M.sameSound(M.spelled("C", 0, 4), M.spelled("C", 1, 4))).toBe(false);
  });
});
