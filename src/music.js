/* music.js - the music-theory model.
 *
 * Pure, dependency-free functions shared by lessons, quizzes, explainers and the
 * playground: note <-> MIDI conversion, key signatures, scale + interval + triad
 * construction, transposition, interval inversion and the standard technical
 * degree names. Everything downstream builds on these rather than re-deriving
 * pitch maths.
 *
 * A "spelled note" is { letter, accidental, octave } where accidental is a signed
 * count of semitones (-2..+2). Keeping letter separate from pitch is what makes
 * D# and Eb distinct, so interval quality and notation stay correct.
 *
 * Public surface: global `MTT.music` (also `module.exports` for tests).
 *
 * @typedef {{ letter: string, accidental: number, octave: number }} SpelledNote
 * @typedef {{ number: number, semitones: number, quality: string, name: string,
 *             compound: boolean }} Interval
 * @typedef {{ count: number, accidentals: string[], type: "sharp"|"flat" }} KeySig
 */
(function (global) {
  "use strict";

  const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
  const LETTER_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const ACCIDENTAL = { "-2": "𝄫", "-1": "♭", "0": "", "1": "♯", "2": "𝄪" };

  const DEGREE_NAMES = [
    "tonic", "supertonic", "mediant", "subdominant",
    "dominant", "submediant", "leading note",
  ];

  const SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"];
  const FLAT_ORDER = ["B", "E", "A", "D", "G", "C", "F"];

  // Major key signatures: name -> count (+sharps / -flats). Minor relatives share
  // the same signature; see relativeMajorOf.
  const MAJOR_SIGNATURES = {
    C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, "F#": 6, "C#": 7,
    F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7,
  };

  const SCALE_STEPS = {
    major: [2, 2, 1, 2, 2, 2, 1],
    naturalMinor: [2, 1, 2, 2, 1, 2, 2],
    harmonicMinor: [2, 1, 2, 2, 1, 3, 1],
    melodicMinorAsc: [2, 1, 2, 2, 2, 2, 1],
    ionian: [2, 2, 1, 2, 2, 2, 1],
    dorian: [2, 1, 2, 2, 2, 1, 2],
    phrygian: [1, 2, 2, 2, 1, 2, 2],
    lydian: [2, 2, 2, 1, 2, 2, 1],
    mixolydian: [2, 2, 1, 2, 2, 1, 2],
    aeolian: [2, 1, 2, 2, 1, 2, 2],
    locrian: [1, 2, 2, 1, 2, 2, 2],
  };

  // --- Note <-> MIDI -------------------------------------------------------

  function noteToMidi(name) {
    const m = /^([A-Ga-g])([#b♯♭x ]*)?(-?\d+)?$/.exec(String(name).trim());
    if (!m) throw new Error("Bad note name: " + name);
    const letter = m[1].toUpperCase();
    let acc = 0;
    for (const ch of m[2] || "") {
      if (ch === "#" || ch === "♯") acc += 1;
      else if (ch === "b" || ch === "♭") acc -= 1;
      else if (ch === "x") acc += 2;
    }
    const octave = m[3] === undefined ? 4 : parseInt(m[3], 10);
    return (octave + 1) * 12 + LETTER_SEMITONES[letter] + acc;
  }

  function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function noteToFreq(name) {
    return midiToFreq(noteToMidi(name));
  }

  // --- Spelled notes -------------------------------------------------------

  function spelled(letter, accidental, octave) {
    return { letter, accidental, octave };
  }

  function spelledToMidi(n) {
    return (n.octave + 1) * 12 + LETTER_SEMITONES[n.letter] + n.accidental;
  }

  function spelledName(n, { unicode = true } = {}) {
    const acc = unicode
      ? ACCIDENTAL[String(n.accidental)]
      : n.accidental > 0 ? "#".repeat(n.accidental)
        : n.accidental < 0 ? "b".repeat(-n.accidental) : "";
    return n.letter + acc;
  }

  function parseSpelled(name, octave = 4) {
    const m = /^([A-Ga-g])(#{1,2}|b{1,2}|x|♯{1,2}|♭{1,2}|𝄪|𝄫)?$/.exec(String(name).trim());
    if (!m) throw new Error("Bad note name: " + name);
    let acc = 0;
    const a = m[2];
    if (a === "x" || a === "𝄪") acc = 2;
    else if (a === "𝄫") acc = -2;
    else if (a) acc = (a[0] === "#" || a[0] === "♯") ? a.length : -a.length;
    return spelled(m[1].toUpperCase(), acc, octave);
  }

  // True when two spelled notes sound the same pitch but may be spelled
  // differently (enharmonic), e.g. F𝄪 and G, or G# and Ab.
  function sameSound(a, b) {
    const x = typeof a === "string" ? parseSpelled(a) : a;
    const y = typeof b === "string" ? parseSpelled(b) : b;
    return spelledToMidi(x) === spelledToMidi(y);
  }

  // --- Key signatures ------------------------------------------------------

  function keySignature(tonic, mode) {
    let majorName = tonic;
    if (mode === "minor") majorName = relativeMajorOf(tonic);
    const count = MAJOR_SIGNATURES[majorName];
    if (count === undefined) {
      throw new Error("No signature for key: " + tonic + " " + mode);
    }
    const letters = count > 0 ? SHARP_ORDER.slice(0, count) : FLAT_ORDER.slice(0, -count);
    return { count, accidentals: letters, type: count >= 0 ? "sharp" : "flat" };
  }

  const RELATIVE_MAJOR = {
    A: "C", E: "G", B: "D", "F#": "A", "C#": "E", "G#": "B", "D#": "F#", "A#": "C#",
    D: "F", G: "Bb", C: "Eb", F: "Ab", Bb: "Db", Eb: "Gb", Ab: "Cb",
  };
  function relativeMajorOf(minorTonic) {
    if (!(minorTonic in RELATIVE_MAJOR)) throw new Error("Unknown minor tonic: " + minorTonic);
    return RELATIVE_MAJOR[minorTonic];
  }
  // Inverse map: relative minor of a major tonic (where one exists in our set).
  function relativeMinorOf(majorTonic) {
    for (const k in RELATIVE_MAJOR) {
      if (RELATIVE_MAJOR[k] === majorTonic) return k;
    }
    // Derive from the 6th degree spelling as a fallback.
    return spelledName(scale(majorTonic, "major")[5]);
  }

  // --- Scales --------------------------------------------------------------

  function scale(tonic, type, octave = 4) {
    const steps = SCALE_STEPS[type];
    if (!steps) throw new Error("Unknown scale type: " + type);
    const t = parseSpelled(tonic, octave);
    const out = [t];
    let midi = spelledToMidi(t);
    let letterIdx = LETTERS.indexOf(t.letter);
    let oct = t.octave;
    for (let i = 0; i < steps.length; i++) {
      midi += steps[i];
      letterIdx = (letterIdx + 1) % 7;
      const letter = LETTERS[letterIdx];
      if (letter === "C") oct += 1;
      const natural = (oct + 1) * 12 + LETTER_SEMITONES[letter];
      out.push(spelled(letter, midi - natural, oct));
    }
    return out;
  }

  // --- Intervals -----------------------------------------------------------

  function ordinal(n) {
    if (n === 1) return "unison";
    if (n === 8) return "octave";
    const SUFFIX = { 2: "nd", 3: "rd" };
    return n + (SUFFIX[n] || "th");
  }

  // Reduce a (possibly compound) interval number to its simple 1..8 equivalent,
  // so quality maths only deals with one octave. A 9th -> 2nd, a 10th -> 3rd,
  // a 15th -> octave.
  function simpleNumber(number) {
    if (number <= 8) return number;
    let n = number;
    while (n > 8) n -= 7;
    return n;
  }

  // Classify the interval between two spelled notes.
  /** @returns {Interval} */
  function interval(low, high) {
    const a = typeof low === "string" ? parseSpelled(low) : low;
    const b = typeof high === "string" ? parseSpelled(high) : high;
    const semis = spelledToMidi(b) - spelledToMidi(a);
    const aDia = a.octave * 7 + LETTERS.indexOf(a.letter);
    const bDia = b.octave * 7 + LETTERS.indexOf(b.letter);
    const number = Math.abs(bDia - aDia) + 1;
    const quality = intervalQuality(number, ((Math.abs(semis) % 12) + 12) % 12);
    const compound = number > 8;
    return {
      number,
      semitones: semis,
      quality,
      compound,
      name: quality + " " + ordinal(number),
    };
  }

  function intervalQuality(number, semis) {
    const simple = simpleNumber(number);
    const PERFECT = { 1: 0, 4: 5, 5: 7, 8: 0 };
    const MAJOR = { 2: 2, 3: 4, 6: 9, 7: 11 };
    if (simple in PERFECT) {
      const diff = semis - PERFECT[simple];
      if (diff === 0) return "perfect";
      if (diff === 1 || diff === -11) return "augmented";
      if (diff === -1 || diff === 11) return "diminished";
    } else {
      const diff = semis - MAJOR[simple];
      if (diff === 0) return "major";
      if (diff === -1) return "minor";
      if (diff === 1) return "augmented";
      if (diff === -2) return "diminished";
    }
    return "?";
  }

  function intervalSemitones(number, quality) {
    const simple = simpleNumber(number);
    const octaves = Math.floor((number - simple) / 7);
    const PERFECT = { 1: 0, 4: 5, 5: 7, 8: 12 };
    const MAJOR = { 2: 2, 3: 4, 6: 9, 7: 11 };
    let base;
    if (simple in PERFECT) {
      base = PERFECT[simple] + ({ perfect: 0, augmented: 1, diminished: -1 }[quality] || 0);
    } else {
      base = MAJOR[simple] + ({ major: 0, minor: -1, augmented: 1, diminished: -2 }[quality] || 0);
    }
    return base + octaves * 12;
  }

  // Invert a simple interval: the number becomes 9 - number, and quality flips
  // (major<->minor, augmented<->diminished, perfect stays perfect).
  /** @returns {{ number: number, quality: string, name: string }} */
  function invertInterval(number, quality) {
    const simple = simpleNumber(number);
    const FLIP = { major: "minor", minor: "major", augmented: "diminished", diminished: "augmented", perfect: "perfect" };
    const invNumber = 9 - simple;
    const invQuality = FLIP[quality] || quality;
    return { number: invNumber, quality: invQuality, name: invQuality + " " + ordinal(invNumber) };
  }

  // Spell the note a given interval (number + quality) from a root. dir = 1 for
  // above (default), -1 for below.
  function transpose(root, number, quality, dir = 1) {
    const r = typeof root === "string" ? parseSpelled(root) : root;
    const steps = (number - 1) * dir;
    const rawIdx = LETTERS.indexOf(r.letter) + steps;
    const newLetter = LETTERS[((rawIdx % 7) + 7) % 7];
    const newOct = r.octave + Math.floor(rawIdx / 7);
    const targetMidi = spelledToMidi(r) + dir * intervalSemitones(number, quality);
    const naturalMidi = (newOct + 1) * 12 + LETTER_SEMITONES[newLetter];
    return spelled(newLetter, targetMidi - naturalMidi, newOct);
  }

  // --- Triads / chords -----------------------------------------------------

  function chordTriad(root, quality) {
    const TH = { major: "major", minor: "minor", diminished: "minor", augmented: "major" };
    const FI = { major: "perfect", minor: "perfect", diminished: "diminished", augmented: "augmented" };
    const r = typeof root === "string" ? parseSpelled(root) : root;
    return [r, transpose(r, 3, TH[quality]), transpose(r, 5, FI[quality])];
  }

  // Diatonic triad on a scale degree of a key, as ascending spelled notes.
  function triad(tonic, mode, degree, inversion = 0) {
    const sc = scale(tonic, mode === "minor" ? "harmonicMinor" : "major");
    const idx = degree - 1;
    const at = (k) => {
      const n = sc[k % 7];
      return spelled(n.letter, n.accidental, n.octave + Math.floor(k / 7));
    };
    const notes = [at(idx), at(idx + 2), at(idx + 4)];
    for (let i = 0; i < inversion; i++) {
      const low = notes.shift();
      notes.push(spelled(low.letter, low.accidental, low.octave + 1));
    }
    return notes;
  }

  // Derive a triad's quality (major/minor/diminished/augmented) from its root
  // position notes, by measuring the 3rd and 5th above the lowest-by-letter root.
  function triadQuality(notes) {
    const sorted = notes.slice().sort((a, b) => spelledToMidi(a) - spelledToMidi(b));
    const root = sorted[0];
    const third = interval(root, sorted[1]);
    const fifth = interval(root, sorted[2]);
    if (third.quality === "major" && fifth.quality === "perfect") return "major";
    if (third.quality === "minor" && fifth.quality === "perfect") return "minor";
    if (third.quality === "minor" && fifth.quality === "diminished") return "diminished";
    if (third.quality === "major" && fifth.quality === "augmented") return "augmented";
    return "unknown";
  }

  function degreeName(degree) {
    return DEGREE_NAMES[(degree - 1) % 7];
  }

  const api = {
    LETTERS, LETTER_SEMITONES, ACCIDENTAL, DEGREE_NAMES, SCALE_STEPS,
    MAJOR_SIGNATURES, SHARP_ORDER, FLAT_ORDER,
    noteToMidi, midiToFreq, noteToFreq,
    spelled, spelledToMidi, spelledName, parseSpelled, sameSound,
    keySignature, relativeMajorOf, relativeMinorOf,
    scale, interval, intervalQuality, intervalSemitones, invertInterval,
    simpleNumber, ordinal, transpose, chordTriad, triad, triadQuality, degreeName,
  };

  global.MTT = global.MTT || {};
  global.MTT.music = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
