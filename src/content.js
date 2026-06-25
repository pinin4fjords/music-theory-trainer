/* content.js - the curriculum.
 *
 * Every grade/topic the app teaches. Each topic carries:
 *   why       - a short hook grounding the topic in *why* it exists
 *   what      - the concise lesson (HTML string)
 *   questions - a generator (rng) => Question, producing a fresh question each
 *               call so practice never runs dry. The rng is a seeded generator
 *               (see core/rng.js): pass a fixed seed and a generator is exactly
 *               reproducible, which is what the tests assert on.
 *   tags      - optional topic tags (e.g. "comingNext" for scaffolded items)
 *
 * A Question is { prompt, choices, answer, explanation?, audio?, a11yText?,
 * meta? } - see core/validate.js. `meta` describes the question's structure so
 * core/diagnose.js can explain the *likely confusion* behind a wrong answer.
 *
 * Grades 1-6 carry full question generators; Grades 7-8 carry the drillable
 * identification items plus clearly-flagged "coming next" composition topics.
 *
 * This is the file to grow. The engine (session, srs, ui) is content-agnostic.
 *
 * Public surface: global `MTT.content`.
 */
(function (global) {
  "use strict";

  const M = global.MTT.music;
  const N = global.MTT.notation;
  const audio = () => global.MTT.audio;

  // --- Authoring helpers (all rng-threaded) ------------------------------

  function pick(rng, arr) { return rng.pick(arr); }

  // n answer choices including the correct one plus distinct distractors.
  function choices(rng, correct, distractors, n = 4) {
    const pool = rng.shuffle([...new Set(distractors)].filter((d) => d !== correct));
    return rng.shuffle([correct, ...pool.slice(0, n - 1)]);
  }

  function staffBlock(spec) {
    return `<div class="staff-wrap">${N.staffHTML(spec)}</div>`;
  }

  // Plain-text alternative for a staff-bearing prompt.
  function a11y(text, spec) {
    return text + " " + N.describe(spec);
  }

  // Inline SVG glyph for a note value (semibreve, minim, crotchet, quaver, semiquaver).
  function noteValueGlyph(name) {
    const cfg = { semibreve: [true, false, 0], minim: [true, true, 0], crotchet: [false, true, 0], quaver: [false, true, 1], semiquaver: [false, true, 2] }[name];
    if (!cfg) return "";
    const [open, hasStem, flags] = cfg;
    const H = hasStem ? 40 : 18;
    const cy = hasStem ? 33 : 9;
    const headAttr = open ? `fill="none" stroke="currentColor" stroke-width="1.5"` : `fill="currentColor"`;
    let g = `<ellipse cx="8" cy="${cy}" rx="6.5" ry="4.5" transform="rotate(-20 8 ${cy})" ${headAttr}/>`;
    if (hasStem) g += `<line x1="14" y1="${cy - 4}" x2="14" y2="4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`;
    for (let f = 0; f < flags; f++) {
      const fy = 4 + f * 7;
      g += `<path d="M14,${fy} C21,${fy + 4} 21,${fy + 14} 14,${fy + 18}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`;
    }
    return `<svg viewBox="0 0 22 ${H}" height="${hasStem ? "1.5em" : "0.9em"}" style="vertical-align:${hasStem ? "-0.55em" : "-0.1em"};display:inline-block;margin:0 3px" aria-hidden="true">${g}</svg>`;
  }

  function intervalContrast(iv) {
    const noun = M.ordinal(iv.number);
    if ([1, 4, 5, 8].indexOf(M.simpleNumber(iv.number)) !== -1) {
      if (iv.quality === "perfect") return `A semitone wider and it would be an <b>augmented ${noun}</b>; a semitone narrower, a <b>diminished ${noun}</b>.`;
      if (iv.quality === "augmented") return `Narrow it by a semitone and it becomes a <b>perfect ${noun}</b>.`;
      return `Widen it by a semitone and it becomes a <b>perfect ${noun}</b>.`;
    }
    if (iv.quality === "major") return `A semitone narrower and it would be a <b>minor ${noun}</b>; wider, an <b>augmented ${noun}</b>.`;
    if (iv.quality === "minor") return `A semitone wider and it would be a <b>major ${noun}</b>; narrower, a <b>diminished ${noun}</b>.`;
    if (iv.quality === "augmented") return `Narrow it by a semitone and it becomes a <b>major ${noun}</b>.`;
    return `Widen it by a semitone and it becomes a <b>minor ${noun}</b>.`;
  }

  const INTERVAL_NAME_POOL = [
    "minor 2nd", "major 2nd", "minor 3rd", "major 3rd", "perfect 4th", "augmented 4th",
    "diminished 5th", "perfect 5th", "minor 6th", "major 6th", "minor 7th", "major 7th", "octave",
  ];

  // === Grade 1-4 generators ==============================================

  const READ_RANGES = {
    treble: [["C", 4], ["E", 4], ["G", 4], ["B", 4], ["D", 5], ["F", 5], ["A", 5], ["F", 4], ["A", 4], ["C", 5], ["E", 5], ["G", 5]],
    bass: [["G", 2], ["B", 2], ["D", 3], ["F", 3], ["A", 3], ["C", 3], ["E", 3], ["G", 3], ["C", 4], ["A", 2], ["E", 2], ["F", 2]],
  };
  function readNotesQuestion(rng, clef) {
    const c = clef || pick(rng, ["treble", "bass"]);
    const [letter, octave] = pick(rng, READ_RANGES[c]);
    const n = M.spelled(letter, 0, octave);
    const spec = { clef: c, notes: [n], accidentals: "none" };
    return {
      prompt: `Name this note on the <b>${c} clef</b>:` + staffBlock(spec),
      a11yText: a11y(`Name this note on the ${c} clef.`, spec),
      choices: choices(rng, letter, M.LETTERS),
      answer: letter,
      explanation: `This note is <b>${letter}</b> (${letter}${octave}) on the ${c} clef.`,
      audio: () => audio().note(n),
    };
  }

  const VALUE_PAIRS = [
    ["semibreve", "minims", 2], ["minim", "crotchets", 2], ["crotchet", "quavers", 2], ["quaver", "semiquavers", 2],
    ["semibreve", "crotchets", 4], ["minim", "quavers", 4], ["crotchet", "semiquavers", 4], ["semibreve", "quavers", 8],
  ];
  function noteValueQuestion(rng) {
    const [big, small, n] = pick(rng, VALUE_PAIRS);
    const smallSingular = small.replace(/s$/, "");
    return {
      prompt: `How many <b>${noteValueGlyph(smallSingular)}${small}</b> fit in a <b>${noteValueGlyph(big)}${big}</b>?`,
      a11yText: `How many ${small} fit in a ${big}?`,
      choices: choices(rng, String(n), ["1", "2", "3", "4", "6", "8", "16"]),
      answer: String(n),
      explanation: `A ${big} lasts <b>${n} ${small}</b>. ${noteValueGlyph(big)} = ${n} × ${noteValueGlyph(smallSingular)}`,
    };
  }

  const TS_PAIRS = [
    ["E", "F", "semitone"], ["B", "C", "semitone"], ["C", "D", "tone"], ["F", "G", "tone"],
    ["G", "A", "tone"], ["A", "B", "tone"], ["D", "E", "tone"], ["C", "C#", "semitone"], ["F", "F#", "semitone"],
  ];
  function toneSemitoneQuestion(rng) {
    const [a, b, ans] = pick(rng, TS_PAIRS);
    return {
      prompt: `Is the distance from <b>${a}</b> up to <b>${b}</b> a tone or a semitone?`,
      choices: choices(rng, ans, ["tone", "semitone"]),
      answer: ans,
      explanation: `${a} up to ${b} is a <b>${ans}</b> - ${ans === "semitone" ? "the smallest step, one key on the piano" : "two semitones"}.`,
      audio: () => audio().sequence([M.parseSpelled(a), M.parseSpelled(b)]),
    };
  }

  function keySigSubset(rng, keys, mode) {
    const key = pick(rng, keys);
    const m = mode || "major";
    const sig = M.keySignature(key, m);
    const n = Math.abs(sig.count);
    const correct = n === 0 ? "none" : `${n} ${sig.type}${n > 1 ? "s" : ""}`;
    const order = sig.accidentals.map((l) => l + (sig.type === "sharp" ? "♯" : "♭")).join(" ");
    return {
      prompt: `How many sharps or flats are in the key signature of <b>${key} ${m}</b>?`,
      choices: choices(rng, correct, ["none", "1 sharp", "2 sharps", "3 sharps", "4 sharps", "1 flat", "2 flats", "3 flats", "4 flats"]),
      answer: correct,
      explanation: n === 0 ? `${key} ${m} has no sharps or flats.` : `${key} ${m} has <b>${correct}</b>: ${order}.`,
      meta: { type: "keysig" },
    };
  }

  function intervalNumberQuestion(rng, roots) {
    const root = pick(rng, roots);
    const sc = M.scale(root, "major");
    const top = pick(rng, sc.slice(1));
    const iv = M.interval(sc[0], top);
    const correct = M.ordinal(iv.number);
    const spec = { clef: "treble", notes: [sc[0], top] };
    return {
      prompt: `What is the <b>interval number</b> from <b>${M.spelledName(sc[0])}</b> up to <b>${M.spelledName(top)}</b>? (count the letter names)` + staffBlock(spec),
      a11yText: a11y(`Interval number from ${M.spelledName(sc[0], { unicode: false })} up to ${M.spelledName(top, { unicode: false })}.`, spec),
      choices: choices(rng, correct, ["2nd", "3rd", "4th", "5th", "6th", "7th", "octave", "unison"]),
      answer: correct,
      explanation: `Counting ${M.spelledName(sc[0])} as 1, up to ${M.spelledName(top)} is ${iv.number} letter names - ${correct === "octave" || correct === "unison" ? "an " + correct : "a " + correct}. The number counts letter names; sharps and flats change the <i>quality</i>, not the number.`,
      audio: () => audio().sequence([sc[0], top]),
    };
  }

  const MINOR_FORMS = [["naturalMinor", "natural minor"], ["harmonicMinor", "harmonic minor"], ["melodicMinorAsc", "melodic (ascending) minor"]];
  function minorFormQuestion(rng) {
    const root = pick(rng, ["A", "D", "E", "G", "C", "B"]);
    const [type, label] = pick(rng, MINOR_FORMS);
    const note = type === "harmonicMinor" ? " The raised 7th creates the augmented 2nd you can hear."
      : type === "melodicMinorAsc" ? " Both the 6th and 7th are raised on the way up." : " No degrees are raised.";
    const spec = { clef: "treble", notes: M.scale(root, type) };
    return {
      prompt: `<b>${root} minor</b> - which form is this?` + staffBlock(spec),
      a11yText: a11y(`Which form of ${root} minor is this scale?`, spec),
      choices: choices(rng, label, MINOR_FORMS.map((f) => f[1])),
      answer: label,
      explanation: `This is <b>${root} ${label}</b>.${note}`,
      audio: () => audio().sequence(M.scale(root, type)),
    };
  }

  function degreeNameQuestion(rng) {
    const keys = ["C", "G", "D", "A", "E", "F", "Bb", "Eb", "B"];
    const key = pick(rng, keys);
    const degree = rng.int(1, 7);
    const sc = M.scale(key, "major");
    const noteName = M.spelledName(sc[degree - 1]);
    const correct = M.degreeName(degree);
    const blurbs = {
      tonic: "the home note the key is named after",
      supertonic: "one step above the tonic (Latin <i>super</i> = above)",
      mediant: "midway between tonic and dominant",
      subdominant: "a 5th <i>below</i> the tonic, mirroring the dominant above",
      dominant: "a 5th above the tonic - the strongest pull back home",
      submediant: "midway between tonic and subdominant going down",
      "leading note": "a semitone below the tonic, leaning up into it",
    };
    const spec = { clef: "treble", keySignature: M.keySignature(key, "major"), notes: [sc[degree - 1]] };
    return {
      prompt: `In ${key} major, what is the technical name of this note (degree ${degree}, <b>${noteName}</b>)?` + staffBlock(spec),
      a11yText: a11y(`In ${key} major, the technical name of degree ${degree}, ${noteName}.`, spec),
      choices: choices(rng, correct, M.DEGREE_NAMES),
      answer: correct,
      explanation: `Degree ${degree} of ${key} major is <b>${noteName}</b>, the <b>${correct}</b> - ${blurbs[correct]}.`,
      audio: () => audio().note(sc[degree - 1]),
    };
  }

  function intervalQuestion(rng) {
    const roots = ["C", "D", "E", "F", "G", "A"];
    const root = pick(rng, roots);
    const sc = M.scale(root, rng.bool() ? "major" : "naturalMinor");
    const top = pick(rng, sc.slice(1));
    const iv = M.interval(sc[0], top);
    const spec = { clef: "treble", notes: [sc[0], top] };
    return {
      prompt: `Name the interval from <b>${M.spelledName(sc[0])}</b> up to <b>${M.spelledName(top)}</b>.` + staffBlock(spec),
      a11yText: a11y(`Name the interval from ${M.spelledName(sc[0], { unicode: false })} up to ${M.spelledName(top, { unicode: false })}.`, spec),
      choices: choices(rng, iv.name, INTERVAL_NAME_POOL),
      answer: iv.name,
      explanation: `${M.spelledName(sc[0])} up to ${M.spelledName(top)} spans ${iv.number} letter names and ${Math.abs(iv.semitones)} semitone${Math.abs(iv.semitones) === 1 ? "" : "s"}, making it a <b>${iv.name}</b>. ${intervalContrast(iv)}`,
      audio: () => audio().sequence([sc[0], top]),
      meta: { type: "interval", number: iv.number, quality: iv.quality },
    };
  }

  function keySignatureQuestion(rng) {
    const keys = Object.keys(M.MAJOR_SIGNATURES);
    const key = pick(rng, keys);
    const sig = M.keySignature(key, "major");
    const n = Math.abs(sig.count);
    const correct = n === 0 ? "none" : `${n} ${sig.type}${n > 1 ? "s" : ""}`;
    const order = sig.accidentals.map((l) => l + (sig.type === "sharp" ? "♯" : "♭")).join(" ");
    return {
      prompt: `How many sharps or flats are in the key signature of <b>${key} major</b>?`,
      choices: choices(rng, correct, ["none", "1 sharp", "2 sharps", "3 sharps", "4 sharps", "1 flat", "2 flats", "3 flats", "4 flats", "5 sharps", "5 flats"]),
      answer: correct,
      explanation: n === 0
        ? `${key} major has no sharps or flats - the one major key with an empty signature.`
        : `${key} major has <b>${correct}</b>: ${order}, added in the fixed circle-of-fifths order.`,
      meta: { type: "keysig" },
    };
  }

  const ALTO_NOTES = [
    ["C", 3], ["D", 3], ["E", 3],
    ["F", 3], ["G", 3], ["A", 3], ["B", 3], ["C", 4], ["D", 4], ["E", 4],
    ["F", 4], ["G", 4], ["A", 4], ["B", 4], ["C", 5], ["D", 5], ["E", 5],
  ];
  function altoClefQuestion(rng) {
    const [letter, octave] = pick(rng, ALTO_NOTES);
    const n = M.spelled(letter, 0, octave);
    const spec = { clef: "alto", notes: [n], accidentals: "none" };
    return {
      prompt: `Name this note written on the <b>alto clef</b>:` + staffBlock(spec),
      a11yText: a11y("Name this note on the alto clef.", spec),
      choices: choices(rng, letter, M.LETTERS),
      answer: letter,
      explanation: `Middle C (C4) sits on the centre line of the alto clef, so this note is <b>${letter}</b> (${letter}${octave}).`,
      audio: () => audio().note(n),
    };
  }

  const ENHARM = [
    { a: "F𝄪", b: "G", play: "G", why: "a double sharp (𝄪) raises a note two semitones, so F𝄪 is two above F" },
    { a: "C𝄪", b: "D", play: "D", why: "C𝄪 is two semitones above C" },
    { a: "G𝄪", b: "A", play: "A", why: "G𝄪 is two semitones above G" },
    { a: "A𝄪", b: "B", play: "B", why: "A𝄪 is two semitones above A" },
    { a: "B𝄫", b: "A", play: "A", why: "a double flat (𝄫) lowers a note two semitones" },
    { a: "D𝄫", b: "C", play: "C", why: "D𝄫 is two semitones below D" },
    { a: "E♯", b: "F", play: "F", why: "E to F is already only a semitone, so E♯ is F" },
    { a: "B♯", b: "C", play: "C", why: "B to C is only a semitone, so B♯ is C" },
    { a: "C♭", b: "B", play: "B", why: "C down to B is a semitone, so C♭ is B" },
    { a: "F♭", b: "E", play: "E", why: "F down to E is a semitone, so F♭ is E" },
    { a: "G♯", b: "A♭", play: "Ab", why: "the black key between G and A, spelled either way" },
    { a: "A♯", b: "B♭", play: "Bb", why: "the same black key, spelled up from A or down from B" },
    { a: "C♯", b: "D♭", play: "Db", why: "the black key between C and D" },
    { a: "D♯", b: "E♭", play: "Eb", why: "the black key between D and E" },
    { a: "F♯", b: "G♭", play: "Gb", why: "the black key between F and G" },
  ];
  const ENHARM_POOL = ["A", "B", "C", "D", "E", "F", "G", "A♭", "B♭", "D♭", "E♭", "G♭", "C♯", "F♯"];
  function enharmonicQuestion(rng) {
    const e = pick(rng, ENHARM);
    return {
      prompt: `Which note is the same pitch (the <b>enharmonic equivalent</b>) as <b>${e.a}</b>?`,
      choices: choices(rng, e.b, ENHARM_POOL),
      answer: e.b,
      explanation: `<b>${e.a}</b> and <b>${e.b}</b> are enharmonic - the same key on the piano spelled differently: ${e.why}.`,
      audio: () => audio().note(M.noteToMidi(e.play)),
    };
  }

  const TIMES = [
    { sig: "2/4", cat: "simple duple", why: "two crotchet beats, each dividing into two" },
    { sig: "3/4", cat: "simple triple", why: "three crotchet beats, each dividing into two" },
    { sig: "4/4", cat: "simple quadruple", why: "four crotchet beats" },
    { sig: "3/8", cat: "simple triple", why: "three quaver beats" },
    { sig: "2/2", cat: "simple duple", why: "two minim beats" },
    { sig: "6/8", cat: "compound duple", why: "six quavers grouping into two dotted-crotchet beats" },
    { sig: "9/8", cat: "compound triple", why: "nine quavers grouping into three dotted-crotchet beats" },
    { sig: "12/8", cat: "compound quadruple", why: "twelve quavers grouping into four dotted-crotchet beats" },
    { sig: "6/4", cat: "compound duple", why: "six crotchets grouping into two dotted-minim beats" },
  ];
  const TIME_CATS = ["simple duple", "simple triple", "simple quadruple", "compound duple", "compound triple", "compound quadruple"];
  function timeClassifyQuestion(rng) {
    const t = pick(rng, TIMES);
    return {
      prompt: `How is the time signature <b>${t.sig}</b> described?`,
      choices: choices(rng, t.cat, TIME_CATS),
      answer: t.cat,
      explanation: `<b>${t.sig}</b> is <b>${t.cat}</b>: ${t.why}.`,
    };
  }
  function dottedValueQuestion(rng) {
    const [name, sq] = pick(rng, [["crotchet", 4], ["minim", 8], ["semibreve", 16]]);
    const dd = sq + sq / 2 + sq / 4;
    const distractors = [String(sq), String(sq + sq / 2), String(sq * 2), String(dd + 1)];
    return {
      prompt: `A <b>double-dotted ${name}</b> lasts how many semiquavers?`,
      choices: choices(rng, String(dd), distractors),
      answer: String(dd),
      explanation: `A ${name} is ${sq} semiquavers. The first dot adds half (${sq / 2}), the second dot adds half again (${sq / 4}): ${sq} + ${sq / 2} + ${sq / 4} = <b>${dd}</b>.`,
    };
  }
  function tupletQuestion(rng) {
    const t = pick(rng, [
      { q: "a duplet", a: "2 notes in the time of 3", d: ["3 notes in the time of 2", "2 notes in the time of 4", "4 notes in the time of 3"], why: "it squeezes two equal notes into a space that normally holds three, so it appears in compound time" },
      { q: "a triplet", a: "3 notes in the time of 2", d: ["2 notes in the time of 3", "3 notes in the time of 4", "3 notes in the time of 1"], why: "it fits three equal notes into the time of two, so it appears in simple time" },
    ]);
    return {
      prompt: `What does <b>${t.q}</b> mean?`,
      choices: choices(rng, t.a, t.d),
      answer: t.a,
      explanation: `${t.q[0].toUpperCase() + t.q.slice(1)} means <b>${t.a}</b> - ${t.why}.`,
    };
  }
  function timeSignatureQuestion(rng) {
    const r = rng.next();
    return r < 0.5 ? timeClassifyQuestion(rng) : r < 0.78 ? dottedValueQuestion(rng) : tupletQuestion(rng);
  }

  const TRIAD_KEYS = ["C", "G", "D", "F", "Bb", "A", "Eb"];
  const DEGREE_FN = { 1: "tonic", 4: "subdominant", 5: "dominant" };
  const ROMAN = { 1: "I", 2: "ii", 4: "IV", 5: "V" };
  function triadFunctionQuestion(rng) {
    const key = pick(rng, TRIAD_KEYS);
    const degree = pick(rng, [1, 4, 5]);
    const notes = M.triad(key, "major", degree, 0);
    const correct = DEGREE_FN[degree];
    const names = notes.map((n) => M.spelledName(n)).join("-");
    const all = [1, 4, 5].map((d) => `${ROMAN[d]} ${DEGREE_FN[d]} ${M.triad(key, "major", d, 0).map((n) => M.spelledName(n)).join("-")}`).join(", ");
    const spec = { clef: "treble", notes: [notes] };
    return {
      prompt: `In <b>${key} major</b>, which triad is this?` + staffBlock(spec),
      a11yText: a11y(`In ${key} major, name this triad by function.`, spec),
      choices: choices(rng, correct, ["tonic", "subdominant", "dominant"]),
      answer: correct,
      explanation: `This is <b>${names}</b> on degree ${degree} - the <b>${correct}</b> triad (chord ${ROMAN[degree]}). The primary triads of ${key} major are ${all}.`,
      audio: () => audio().chord(notes),
    };
  }
  const INV_NAMES = ["root position", "first inversion", "second inversion"];
  function triadInversionQuestion(rng) {
    const key = pick(rng, TRIAD_KEYS);
    const degree = pick(rng, [1, 4, 5]);
    const inv = pick(rng, [0, 1, 2]);
    const notes = M.triad(key, "major", degree, inv);
    const root = M.triad(key, "major", degree, 0);
    const bass = M.spelledName(notes[0]);
    const reason = inv === 0 ? "the root is in the bass, so it is in <b>root position</b>"
      : inv === 1 ? "the 3rd is in the bass, so it is in <b>first inversion</b>"
        : "the 5th is in the bass, so it is in <b>second inversion</b>";
    const spec = { clef: "treble", notes: [notes] };
    return {
      prompt: `Which position is this triad in?` + staffBlock(spec),
      a11yText: a11y("Which inversion is this triad in?", spec),
      choices: choices(rng, INV_NAMES[inv], INV_NAMES),
      answer: INV_NAMES[inv],
      explanation: `The lowest note is <b>${bass}</b> - ${reason}. The bass note decides: ${M.spelledName(root[0])} = root position, ${M.spelledName(root[1])} = first inversion, ${M.spelledName(root[2])} = second inversion.`,
      audio: () => audio().chord(notes),
      meta: { type: "inversion" },
    };
  }
  function triadQuestion(rng) {
    return rng.bool(0.6) ? triadFunctionQuestion(rng) : triadInversionQuestion(rng);
  }

  const ORNAMENTS = [
    { name: "trill", desc: "a rapid alternation between the written note and the note above", play: ["C5", "D5", "C5", "D5", "C5", "D5", "C5"] },
    { name: "upper mordent", desc: "a single quick alternation with the note above, then back", play: ["C5", "D5", "C5"] },
    { name: "lower mordent", desc: "a single quick alternation with the note below, then back", play: ["C5", "B4", "C5"] },
    { name: "turn", desc: "the note above, the written note, the note below, then the note again", play: ["D5", "C5", "B4", "C5"] },
    { name: "acciaccatura", desc: "a very quick 'crushed' grace note just before the main note", play: ["B4", "C5"] },
    { name: "appoggiatura", desc: "a leaning grace note that takes part of the main note's value", play: ["D5", "C5"] },
  ];
  function ornamentQuestion(rng) {
    const o = pick(rng, ORNAMENTS);
    const playIt = () => audio().sequence(o.play, 0.13, 0.16);
    if (rng.bool()) {
      return {
        prompt: `Which ornament is this: "${o.desc}"?`,
        choices: choices(rng, o.name, ORNAMENTS.map((x) => x.name)),
        answer: o.name,
        explanation: `That is the <b>${o.name}</b>: ${o.desc}.`,
        audio: playIt,
      };
    }
    return {
      prompt: `What does a <b>${o.name}</b> do?`,
      choices: choices(rng, o.desc, ORNAMENTS.map((x) => x.desc)),
      answer: o.desc,
      explanation: `A <b>${o.name}</b> is ${o.desc}.`,
      audio: playIt,
    };
  }

  // === Grade 5 generators ================================================

  const ALL_MAJOR_KEYS = Object.keys(M.MAJOR_SIGNATURES); // C..C# and F..Cb (to 7)
  const ALL_MINOR_KEYS = Object.keys({
    A: 1, E: 1, B: 1, "F#": 1, "C#": 1, "G#": 1, "D#": 1, "A#": 1,
    D: 1, G: 1, C: 1, F: 1, Bb: 1, Eb: 1, Ab: 1,
  });

  // Key identification, both directions, all keys to 7 sharps/flats.
  function keyIdQuestion(rng) {
    const mode = rng.bool() ? "major" : "minor";
    const keys = mode === "major" ? ALL_MAJOR_KEYS : ALL_MINOR_KEYS;
    const key = pick(rng, keys);
    const sig = M.keySignature(key, mode);
    const n = Math.abs(sig.count);
    const sigText = n === 0 ? "no sharps or flats" : `${n} ${sig.type}${n > 1 ? "s" : ""}`;
    if (rng.bool()) {
      // key -> signature
      const correct = n === 0 ? "none" : `${n} ${sig.type}${n > 1 ? "s" : ""}`;
      const distract = ["none", "1 sharp", "2 sharps", "5 sharps", "6 sharps", "7 sharps", "1 flat", "2 flats", "5 flats", "6 flats", "7 flats"];
      return {
        prompt: `What is the key signature of <b>${key} ${mode}</b>?`,
        choices: choices(rng, correct, distract),
        answer: correct,
        explanation: `${key} ${mode} has <b>${sigText}</b>.` + (mode === "minor" ? ` It shares the signature of its relative major, ${M.relativeMajorOf(key)} major.` : ""),
        meta: { type: "keysig" },
      };
    }
    // signature -> key
    const others = (mode === "major" ? ALL_MAJOR_KEYS : ALL_MINOR_KEYS).map((k) => `${k} ${mode}`);
    const correct = `${key} ${mode}`;
    return {
      prompt: `Which <b>${mode}</b> key has <b>${sigText}</b>?`,
      choices: choices(rng, correct, others),
      answer: correct,
      explanation: `${sigText.charAt(0).toUpperCase() + sigText.slice(1)} is <b>${key} ${mode}</b>.`,
    };
  }

  // Full interval identification including augmented/diminished, from natural-ish
  // roots so spellings stay sane. The qualities come from constructing the upper
  // note with M.transpose, then re-deriving the name with M.interval.
  const G5_INTERVALS = [
    [2, "minor"], [2, "major"], [3, "minor"], [3, "major"],
    [4, "perfect"], [4, "augmented"], [5, "diminished"], [5, "perfect"],
    [6, "minor"], [6, "major"], [7, "minor"], [7, "major"], [8, "perfect"],
  ];
  function intervalQualityQuestion(rng) {
    const root = M.parseSpelled(pick(rng, ["C", "D", "E", "F", "G", "A", "B"]), 4);
    const [num, qual] = pick(rng, G5_INTERVALS);
    const top = M.transpose(root, num, qual);
    const iv = M.interval(root, top);
    const spec = { clef: "treble", notes: [root, top] };
    return {
      prompt: `Name this interval (number <i>and</i> quality) from <b>${M.spelledName(root)}</b> up to <b>${M.spelledName(top)}</b>.` + staffBlock(spec),
      a11yText: a11y(`Name the interval from ${M.spelledName(root, { unicode: false })} up to ${M.spelledName(top, { unicode: false })}.`, spec),
      choices: choices(rng, iv.name, INTERVAL_NAME_POOL),
      answer: iv.name,
      explanation: `${M.spelledName(root)} up to ${M.spelledName(top)} is ${iv.number} letter names and ${Math.abs(iv.semitones)} semitones - a <b>${iv.name}</b>. ${intervalContrast(iv)}`,
      audio: () => audio().sequence([root, top]),
      meta: { type: "interval", number: iv.number, quality: iv.quality },
    };
  }

  // Compound intervals (greater than an octave).
  function compoundIntervalQuestion(rng) {
    const root = M.parseSpelled(pick(rng, ["C", "D", "E", "F", "G"]), 3);
    const [num, qual] = pick(rng, [[2, "major"], [3, "major"], [3, "minor"], [6, "major"], [7, "minor"]]);
    const top = M.transpose(root, num + 7, qual); // an octave higher
    const iv = M.interval(root, top);
    const simple = M.interval(root, M.transpose(root, num, qual));
    const spec = { clef: "treble", notes: [root, top] };
    return {
      prompt: `This interval is larger than an octave. Name it (as a compound interval) from <b>${M.spelledName(root)}</b> up to <b>${M.spelledName(top)}</b>.` + staffBlock(spec),
      a11yText: a11y(`Name this compound interval from ${M.spelledName(root, { unicode: false })} up to ${M.spelledName(top, { unicode: false })}.`, spec),
      choices: choices(rng, iv.name, [
        simple.name, "major 9th", "minor 9th", "major 10th", "minor 10th", "perfect 11th", "perfect 12th", "major 13th",
      ]),
      answer: iv.name,
      explanation: `It spans ${iv.number} letter names - a <b>${iv.name}</b>. Reduce it by an octave (7 letter names) and you get its simple form, a <b>${simple.name}</b>.`,
      audio: () => audio().sequence([root, top]),
      meta: { type: "interval", number: iv.number, quality: iv.quality },
    };
  }

  // Interval inversion.
  function intervalInversionQuestion(rng) {
    const [num, qual] = pick(rng, G5_INTERVALS.filter(([n]) => n >= 2 && n <= 7));
    const original = qual + " " + M.ordinal(num);
    const inv = M.invertInterval(num, qual);
    return {
      prompt: `What is the <b>inversion</b> of a <b>${original}</b>?`,
      choices: choices(rng, inv.name, INTERVAL_NAME_POOL),
      answer: inv.name,
      explanation: `Invert a ${original} and you get a <b>${inv.name}</b>: the numbers add up to 9 (${num} + ${inv.number}), and the quality flips (${qual} becomes ${inv.quality}).`,
      meta: { type: "interval", number: inv.number, quality: inv.quality },
    };
  }

  // Chord identification by Roman numeral + inversion, degrees I/ii/IV/V.
  const G5_CHORD_KEYS = ["C", "G", "D", "F", "Bb", "A", "Eb"];
  const INV_SUFFIX = ["", ", first inversion", ", second inversion"];
  function chordIdQuestion(rng) {
    const key = pick(rng, G5_CHORD_KEYS);
    const degree = pick(rng, [1, 2, 4, 5]);
    const inv = pick(rng, [0, 1, 2]);
    const notes = M.triad(key, "major", degree, inv);
    const correct = ROMAN[degree] + INV_SUFFIX[inv];
    const distractors = [];
    [1, 2, 4, 5].forEach((d) => [0, 1, 2].forEach((iv) => distractors.push(ROMAN[d] + INV_SUFFIX[iv])));
    const spec = { clef: "treble", keySignature: M.keySignature(key, "major"), notes: [notes] };
    const bass = M.spelledName(notes[0]);
    return {
      prompt: `In <b>${key} major</b>, name this chord by Roman numeral and inversion.` + staffBlock(spec),
      a11yText: a11y(`In ${key} major, name this chord by Roman numeral and inversion.`, spec),
      choices: choices(rng, correct, distractors),
      answer: correct,
      explanation: `It is the triad on degree ${degree} (<b>${ROMAN[degree]}</b>) with <b>${bass}</b> in the bass - so <b>${correct}</b>.`,
      audio: () => audio().chord(notes),
    };
  }

  // Cadence identification from the two chords given.
  const CADENCES = [
    { name: "perfect", prog: [5, 1], why: "V to I - the strongest, most final close" },
    { name: "plagal", prog: [4, 1], why: "IV to I - the gentle 'Amen' close" },
    { name: "imperfect", prog: [1, 5], why: "ends ON chord V - it sounds unfinished, expecting more" },
    { name: "interrupted", prog: [5, 6], why: "V leads not to I but to vi - the expected resolution is 'interrupted'" },
  ];
  const CADENCE_KEYS = ["C", "G", "D", "F", "Bb"];
  function cadenceQuestion(rng) {
    const key = pick(rng, CADENCE_KEYS);
    const c = pick(rng, CADENCES);
    // Imperfect cadences can end on V from I, ii, or IV; vary the starting chord.
    const prog = (c.name === "imperfect") ? [pick(rng, [1, 2, 4]), 5] : c.prog;
    const chord1 = M.triad(key, "major", prog[0], 0);
    const chord2 = M.triad(key, "major", prog[1], 0);
    const spec = { clef: "treble", keySignature: M.keySignature(key, "major"), notes: [chord1, chord2] };
    const ROMAN1 = { 1: "I", 2: "ii", 4: "IV", 5: "V" };
    const r1 = ROMAN1[prog[0]] || String(prog[0]);
    const r2 = prog[1] === 1 ? "I" : prog[1] === 5 ? "V" : "vi";
    return {
      prompt: `In <b>${key} major</b>, which cadence is this (${r1} - ${r2})?` + staffBlock(spec),
      a11yText: a11y(`In ${key} major, identify this cadence: chord ${r1} to chord ${r2}.`, spec),
      choices: choices(rng, c.name, CADENCES.map((x) => x.name)),
      answer: c.name,
      explanation: `${r1} - ${r2} is a <b>${c.name} cadence</b>: ${c.why}.`,
      audio: () => { audio().chord(chord1); },
    };
  }

  // Four clefs: read a note in treble/bass/alto/tenor.
  const TENOR_NOTES = [["D", 3], ["E", 3], ["F", 3], ["G", 3], ["A", 3], ["B", 3], ["C", 4], ["D", 4], ["E", 4], ["F", 4], ["G", 4]];
  function fourClefQuestion(rng) {
    const clef = pick(rng, ["treble", "bass", "alto", "tenor"]);
    let entry;
    if (clef === "alto") entry = pick(rng, ALTO_NOTES);
    else if (clef === "tenor") entry = pick(rng, TENOR_NOTES);
    else entry = pick(rng, READ_RANGES[clef]);
    const [letter, octave] = entry;
    const n = M.spelled(letter, 0, octave);
    const spec = { clef, notes: [n], accidentals: "none" };
    const hint = {
      treble: "the second line up is G", bass: "the second line down is F",
      alto: "the middle line is middle C", tenor: "the fourth line up is middle C",
    }[clef];
    return {
      prompt: `Name this note on the <b>${clef} clef</b>:` + staffBlock(spec),
      a11yText: a11y(`Name this note on the ${clef} clef.`, spec),
      choices: choices(rng, letter, M.LETTERS),
      answer: letter,
      explanation: `On the ${clef} clef, ${hint}; this note is <b>${letter}</b> (${letter}${octave}).`,
      audio: () => audio().note(n),
    };
  }

  // Transposing instruments (Bb, A, F): written <-> sounding pitch.
  const TRANSPOSERS = [
    { name: "B♭ clarinet", number: 2, quality: "major", semis: -2, blurb: "sounds a major 2nd lower than written" },
    { name: "B♭ trumpet", number: 2, quality: "major", semis: -2, blurb: "sounds a major 2nd lower than written" },
    { name: "clarinet in A", number: 3, quality: "minor", semis: -3, blurb: "sounds a minor 3rd lower than written" },
    { name: "horn in F", number: 5, quality: "perfect", semis: -7, blurb: "sounds a perfect 5th lower than written" },
    { name: "cor anglais", number: 5, quality: "perfect", semis: -7, blurb: "sounds a perfect 5th lower than written (in F)" },
  ];
  function transposeInstrumentQuestion(rng) {
    const inst = pick(rng, TRANSPOSERS);
    const concert = M.parseSpelled(pick(rng, ["C", "D", "E", "F", "G", "A", "Bb", "Eb"]), 4);
    // Written pitch is the interval ABOVE concert (sound is below written).
    const written = M.transpose(concert, inst.number, inst.quality, +1);
    const pool = ["C", "D", "E", "F", "G", "A", "B", "Bb", "Eb", "F#", "Ab", "Db"];
    return {
      prompt: `A <b>${inst.name}</b> ${inst.blurb}. To sound concert <b>${M.spelledName(concert)}</b>, what note must be <i>written</i> for the player?`,
      choices: choices(rng, M.spelledName(written), pool),
      answer: M.spelledName(written),
      explanation: `Since the instrument sounds lower than written, you write <i>higher</i> by the same interval: a ${inst.quality} ${M.ordinal(inst.number)} above ${M.spelledName(concert)} is <b>${M.spelledName(written)}</b>.`,
    };
  }

  // Transpose a single note up/down by a named interval.
  function transposeIntervalQuestion(rng) {
    const root = M.parseSpelled(pick(rng, ["C", "D", "E", "F", "G", "A", "Bb", "Eb"]), 4);
    const [num, qual] = pick(rng, [[2, "major"], [3, "minor"], [3, "major"], [4, "perfect"], [5, "perfect"], [6, "major"]]);
    const dir = rng.bool() ? 1 : -1;
    const result = M.transpose(root, num, qual, dir);
    const word = dir === 1 ? "up" : "down";
    const pool = ["C", "D", "E", "F", "G", "A", "B", "Bb", "Eb", "Ab", "Db", "F#", "C#", "G#"];
    return {
      prompt: `Transpose <b>${M.spelledName(root)}</b> <b>${word}</b> by a <b>${qual} ${M.ordinal(num)}</b>. What is the new note?`,
      choices: choices(rng, M.spelledName(result), pool),
      answer: M.spelledName(result),
      explanation: `A ${qual} ${M.ordinal(num)} ${word} from ${M.spelledName(root)} is <b>${M.spelledName(result)}</b> - count ${num} letter names ${word}, then adjust the accidental for the exact quality.`,
    };
  }

  // Foreign technical terms, grouped by function (cat) and language (lang).
  const TERMS = [
    // Tempo (Italian), broadly slow -> fast.
    { term: "Grave", lang: "It.", meaning: "very slow and solemn", cat: "tempo" },
    { term: "Largo", lang: "It.", meaning: "broad and very slow", cat: "tempo" },
    { term: "Lento", lang: "It.", meaning: "slow", cat: "tempo" },
    { term: "Adagio", lang: "It.", meaning: "slow and stately", cat: "tempo" },
    { term: "Andante", lang: "It.", meaning: "at a walking pace", cat: "tempo" },
    { term: "Moderato", lang: "It.", meaning: "at a moderate speed", cat: "tempo" },
    { term: "Allegretto", lang: "It.", meaning: "fairly quick", cat: "tempo" },
    { term: "Allegro", lang: "It.", meaning: "fast and lively", cat: "tempo" },
    { term: "Vivace", lang: "It.", meaning: "lively and brisk", cat: "tempo" },
    { term: "Presto", lang: "It.", meaning: "very fast", cat: "tempo" },
    { term: "Prestissimo", lang: "It.", meaning: "as fast as possible", cat: "tempo" },
    // Changing the tempo.
    { term: "Accelerando (accel.)", lang: "It.", meaning: "gradually getting faster", cat: "tempochange" },
    { term: "Ritardando (rit.)", lang: "It.", meaning: "gradually getting slower", cat: "tempochange" },
    { term: "Rallentando (rall.)", lang: "It.", meaning: "gradually slowing down", cat: "tempochange" },
    { term: "Ritenuto (riten.)", lang: "It.", meaning: "held back, immediately slower", cat: "tempochange" },
    { term: "Allargando", lang: "It.", meaning: "broadening - slower and often louder", cat: "tempochange" },
    { term: "Stringendo", lang: "It.", meaning: "pressing on, getting faster", cat: "tempochange" },
    { term: "Rubato", lang: "It.", meaning: "with flexible, expressive timing", cat: "tempochange" },
    { term: "A tempo", lang: "It.", meaning: "return to the original speed", cat: "tempochange" },
    { term: "Meno mosso", lang: "It.", meaning: "less movement - slower", cat: "tempochange" },
    { term: "Più mosso", lang: "It.", meaning: "more movement - faster", cat: "tempochange" },
    // Dynamics.
    { term: "pp (pianissimo)", lang: "It.", meaning: "very quiet", cat: "dynamics" },
    { term: "p (piano)", lang: "It.", meaning: "quiet", cat: "dynamics" },
    { term: "mp (mezzo-piano)", lang: "It.", meaning: "moderately quiet", cat: "dynamics" },
    { term: "mf (mezzo-forte)", lang: "It.", meaning: "moderately loud", cat: "dynamics" },
    { term: "f (forte)", lang: "It.", meaning: "loud", cat: "dynamics" },
    { term: "ff (fortissimo)", lang: "It.", meaning: "very loud", cat: "dynamics" },
    { term: "Crescendo (cresc.)", lang: "It.", meaning: "gradually getting louder", cat: "dynamics" },
    { term: "Diminuendo (dim.)", lang: "It.", meaning: "gradually getting quieter", cat: "dynamics" },
    { term: "sfz (sforzando)", lang: "It.", meaning: "a sudden strong accent", cat: "dynamics" },
    { term: "fp (fortepiano)", lang: "It.", meaning: "loud, then immediately quiet", cat: "dynamics" },
    { term: "Calando", lang: "It.", meaning: "getting quieter (and often slower)", cat: "dynamics" },
    { term: "Morendo", lang: "It.", meaning: "dying away", cat: "dynamics" },
    { term: "Smorzando (smorz.)", lang: "It.", meaning: "dying away in tone and speed", cat: "dynamics" },
    { term: "Perdendosi", lang: "It.", meaning: "fading away to nothing", cat: "dynamics" },
    // Articulation & touch.
    { term: "Legato", lang: "It.", meaning: "smoothly, notes connected", cat: "articulation" },
    { term: "Staccato", lang: "It.", meaning: "short and detached", cat: "articulation" },
    { term: "Staccatissimo", lang: "It.", meaning: "very short and detached", cat: "articulation" },
    { term: "Tenuto (ten.)", lang: "It.", meaning: "held for its full value", cat: "articulation" },
    { term: "Marcato", lang: "It.", meaning: "marked and accented", cat: "articulation" },
    { term: "Pizzicato (pizz.)", lang: "It.", meaning: "plucked (strings)", cat: "articulation" },
    { term: "Arco", lang: "It.", meaning: "with the bow (strings)", cat: "articulation" },
    { term: "Slur", lang: "It.", meaning: "a curved line over notes: connect them smoothly in one gesture", cat: "articulation" },
    // Expression & mood.
    { term: "Dolce", lang: "It.", meaning: "sweetly", cat: "expression" },
    { term: "Cantabile", lang: "It.", meaning: "in a singing style", cat: "expression" },
    { term: "Espressivo (espress.)", lang: "It.", meaning: "expressively", cat: "expression" },
    { term: "Grazioso", lang: "It.", meaning: "gracefully", cat: "expression" },
    { term: "Maestoso", lang: "It.", meaning: "majestically", cat: "expression" },
    { term: "Con brio", lang: "It.", meaning: "with vigour and spirit", cat: "expression" },
    { term: "Con moto", lang: "It.", meaning: "with movement", cat: "expression" },
    { term: "Tranquillo", lang: "It.", meaning: "calmly", cat: "expression" },
    { term: "Agitato", lang: "It.", meaning: "agitated and restless", cat: "expression" },
    { term: "Giocoso", lang: "It.", meaning: "playfully", cat: "expression" },
    { term: "Sotto voce", lang: "It.", meaning: "in an undertone, hushed", cat: "expression" },
    { term: "Sostenuto", lang: "It.", meaning: "sustained", cat: "expression" },
    { term: "Simile (sim.)", lang: "It.", meaning: "continue in the same manner", cat: "expression" },
    // Navigation / structure.
    { term: "Da capo (D.C.)", lang: "It.", meaning: "from the beginning", cat: "navigation" },
    { term: "Dal segno (D.S.)", lang: "It.", meaning: "from the sign", cat: "navigation" },
    { term: "Fine", lang: "It.", meaning: "the end", cat: "navigation" },
    { term: "Coda", lang: "It.", meaning: "a closing section", cat: "navigation" },
    { term: "Fermata (pause)", lang: "It.", meaning: "hold the note or rest longer than written", cat: "navigation" },
    { term: "Tacet", lang: "It.", meaning: "silent - do not play", cat: "navigation" },
    // French.
    { term: "Lent", lang: "Fr.", meaning: "slow", cat: "french" },
    { term: "Modéré", lang: "Fr.", meaning: "at a moderate speed", cat: "french" },
    { term: "Vite", lang: "Fr.", meaning: "quick", cat: "french" },
    { term: "Vif", lang: "Fr.", meaning: "lively", cat: "french" },
    { term: "Animé", lang: "Fr.", meaning: "animated, lively", cat: "french" },
    { term: "Doux", lang: "Fr.", meaning: "soft, sweet", cat: "french" },
    { term: "Retenu", lang: "Fr.", meaning: "held back, slower", cat: "french" },
    { term: "Cédez", lang: "Fr.", meaning: "yield - slow down", cat: "french" },
    { term: "Mouvement (mouvt)", lang: "Fr.", meaning: "tempo, or 'movement'", cat: "french" },
    // German.
    { term: "Langsam", lang: "Ger.", meaning: "slow", cat: "german" },
    { term: "Mässig", lang: "Ger.", meaning: "at a moderate speed", cat: "german" },
    { term: "Schnell", lang: "Ger.", meaning: "fast", cat: "german" },
    { term: "Lebhaft", lang: "Ger.", meaning: "lively", cat: "german" },
    { term: "Bewegt", lang: "Ger.", meaning: "with movement, agitated", cat: "german" },
    { term: "Ruhig", lang: "Ger.", meaning: "calm, peaceful", cat: "german" },
    { term: "Zart", lang: "Ger.", meaning: "tender, delicate", cat: "german" },
    { term: "Kräftig", lang: "Ger.", meaning: "strong, vigorous", cat: "german" },
    { term: "Mit Ausdruck", lang: "Ger.", meaning: "with expression", cat: "german" },
  ];
  function termQuestion(rng) {
    const t = pick(rng, TERMS);
    return {
      prompt: `What does <b>${t.term}</b> (${t.lang}) mean?`,
      choices: choices(rng, t.meaning, TERMS.map((x) => x.meaning)),
      answer: t.meaning,
      explanation: `<b>${t.term}</b> (${t.lang}) means <b>${t.meaning}</b>.`,
    };
  }

  // Instruments & voices: families and SATB ranges.
  const INSTRUMENTS = [
    { name: "oboe", family: "woodwind" }, { name: "clarinet", family: "woodwind" }, { name: "bassoon", family: "woodwind" }, { name: "flute", family: "woodwind" },
    { name: "trumpet", family: "brass" }, { name: "trombone", family: "brass" }, { name: "horn", family: "brass" }, { name: "tuba", family: "brass" },
    { name: "violin", family: "strings" }, { name: "viola", family: "strings" }, { name: "cello", family: "strings" }, { name: "double bass", family: "strings" },
    { name: "timpani", family: "percussion" }, { name: "xylophone", family: "percussion" }, { name: "snare drum", family: "percussion" },
  ];
  const FAMILIES = ["strings", "woodwind", "brass", "percussion"];
  const VOICES = [
    { name: "soprano", note: "highest female/treble voice" },
    { name: "alto", note: "lower female voice" },
    { name: "tenor", note: "higher male voice" },
    { name: "bass", note: "lowest male voice" },
  ];
  function instrumentQuestion(rng) {
    if (rng.bool(0.6)) {
      const inst = pick(rng, INSTRUMENTS);
      return {
        prompt: `Which family does the <b>${inst.name}</b> belong to?`,
        choices: choices(rng, inst.family, FAMILIES),
        answer: inst.family,
        explanation: `The ${inst.name} is a <b>${inst.family}</b> instrument.`,
      };
    }
    const order = rng.bool();
    if (order) {
      return {
        prompt: `Which is the <b>lowest</b> of the four standard voices (SATB)?`,
        choices: choices(rng, "bass", VOICES.map((v) => v.name)),
        answer: "bass",
        explanation: `SATB runs highest to lowest: soprano, alto, tenor, <b>bass</b>.`,
      };
    }
    const v = pick(rng, VOICES);
    return {
      prompt: `In SATB, which voice is the <b>${v.note}</b>?`,
      choices: choices(rng, v.name, VOICES.map((x) => x.name)),
      answer: v.name,
      explanation: `The <b>${v.name}</b> is the ${v.note}.`,
    };
  }

  // === Grade 6 generators ================================================

  // Dominant 7th and its inversions, plus ii7 - chord identification.
  const FIGURED = [
    { fig: "5/3 (or no figure)", inv: "root-position triad" },
    { fig: "6 (or 6/3)", inv: "first-inversion triad" },
    { fig: "6/4", inv: "second-inversion triad" },
    { fig: "7", inv: "root-position 7th chord" },
    { fig: "6/5", inv: "first-inversion 7th chord" },
    { fig: "4/3", inv: "second-inversion 7th chord" },
    { fig: "4/2 (or 2)", inv: "third-inversion 7th chord" },
  ];
  function figuredBassQuestion(rng) {
    const f = pick(rng, FIGURED);
    if (rng.bool()) {
      return {
        prompt: `In figured bass, what does the figure <b>${f.fig}</b> indicate?`,
        choices: choices(rng, f.inv, FIGURED.map((x) => x.inv)),
        answer: f.inv,
        explanation: `<b>${f.fig}</b> indicates a <b>${f.inv}</b>. The figures count the intervals above the bass note.`,
      };
    }
    return {
      prompt: `Which figured-bass symbol indicates a <b>${f.inv}</b>?`,
      choices: choices(rng, f.fig, FIGURED.map((x) => x.fig)),
      answer: f.fig,
      explanation: `A ${f.inv} is figured <b>${f.fig}</b>.`,
    };
  }

  function dominant7thQuestion(rng) {
    const key = pick(rng, ["C", "G", "D", "F", "Bb"]);
    const inv = pick(rng, [0, 1, 2, 3]);
    const labels = ["V7", "V7b (first inversion)", "V7c (second inversion)", "V7d (third inversion)"];
    const figures = ["7", "6/5", "4/3", "4/2"];
    const correct = labels[inv];
    return {
      prompt: `In <b>${key} major</b>, a dominant 7th chord is shown with figured bass <b>${figures[inv]}</b>. Which inversion is it?`,
      choices: choices(rng, correct, labels),
      answer: correct,
      explanation: `The figure <b>${figures[inv]}</b> on a dominant 7th means <b>${correct}</b>. V7 has four notes, so it has four positions (root, 1st, 2nd, 3rd inversion).`,
    };
  }

  // Non-chord (melodic decoration) notes.
  const NON_CHORD = [
    { name: "passing note", desc: "fills the gap between two different chord notes by step" },
    { name: "auxiliary note", desc: "steps away from a chord note and back to the same note" },
    { name: "suspension", desc: "a note held over from the previous chord, clashing, then resolving down by step" },
    { name: "appoggiatura", desc: "a leaning accented non-chord note approached by leap and resolved by step" },
    { name: "anticipation", desc: "a note of the next chord sounded early, before the chord arrives" },
    { name: "changing note", desc: "a pair of notes stepping above and below a chord note before resolving" },
  ];
  function nonChordToneQuestion(rng) {
    const nct = pick(rng, NON_CHORD);
    return {
      prompt: `Which non-chord note is this: "${nct.desc}"?`,
      choices: choices(rng, nct.name, NON_CHORD.map((x) => x.name)),
      answer: nct.name,
      explanation: `That is a <b>${nct.name}</b>: ${nct.desc}.`,
    };
  }

  // === Grade 7-8 drillable identification ================================

  const CHROMATIC_CHORDS = [
    { name: "diminished 7th", desc: "four notes stacked in minor 3rds, often built on the leading note (vii°7), very tense" },
    { name: "Neapolitan 6th", desc: "a major triad on the flattened supertonic (♭II), usually in first inversion, with a pre-dominant function" },
    { name: "supertonic 7th", desc: "a 7th chord built on the second degree (ii7), often leading to V" },
    { name: "dominant 7th", desc: "a major triad on the dominant with a minor 7th added (V7), resolving to the tonic" },
  ];
  function chromaticChordQuestion(rng) {
    const c = pick(rng, CHROMATIC_CHORDS);
    return {
      prompt: `Which chord is this: "${c.desc}"?`,
      choices: choices(rng, c.name, CHROMATIC_CHORDS.map((x) => x.name)),
      answer: c.name,
      explanation: `That is the <b>${c.name}</b>: ${c.desc}.`,
    };
  }

  const AUG_SIXTHS = [
    { name: "Italian 6th", desc: "augmented 6th + a major 3rd above the bass (three notes)" },
    { name: "French 6th", desc: "augmented 6th + major 3rd + augmented 4th above the bass" },
    { name: "German 6th", desc: "augmented 6th + major 3rd + perfect 5th above the bass (enharmonically a dominant 7th)" },
  ];
  function augmentedSixthQuestion(rng) {
    const a = pick(rng, AUG_SIXTHS);
    if (rng.bool()) {
      return {
        prompt: `Which augmented 6th chord is this: "${a.desc}"?`,
        choices: choices(rng, a.name, AUG_SIXTHS.map((x) => x.name)),
        answer: a.name,
        explanation: `That is the <b>${a.name}</b>: ${a.desc}.`,
      };
    }
    return {
      prompt: `What notes (above the bass) make up the <b>${a.name}</b>?`,
      choices: choices(rng, a.desc, AUG_SIXTHS.map((x) => x.desc)),
      answer: a.desc,
      explanation: `The <b>${a.name}</b> is built from ${a.desc}.`,
    };
  }

  const SECONDARY_DOMS = [
    { label: "V/V (five of five)", desc: "the dominant of the dominant - it tonicises chord V" },
    { label: "V/ii", desc: "the dominant of chord ii - it tonicises the supertonic" },
    { label: "V/IV", desc: "the dominant of chord IV - it tonicises the subdominant" },
    { label: "V/vi", desc: "the dominant of chord vi - it tonicises the submediant" },
  ];
  function secondaryDominantQuestion(rng) {
    const s = pick(rng, SECONDARY_DOMS);
    return {
      prompt: `A chromatic chord functions as "${s.desc}". How is it labelled?`,
      choices: choices(rng, s.label, SECONDARY_DOMS.map((x) => x.label)),
      answer: s.label,
      explanation: `That is <b>${s.label}</b>: ${s.desc}. Secondary dominants borrow the dominant of a chord other than the tonic to colour the harmony.`,
    };
  }

  // === Curriculum tree ====================================================

  const grades = [
    {
      grade: 1, title: "Grade 1", role: "practice",
      topics: [
        {
          id: "g1-notes", title: "Reading notes (treble & bass)",
          why: "The two staves are one system split around middle C - learn the landmark lines and you can read either clef without counting up from the bottom every time.",
          what: "<p>Treble lines are <b>E G B D F</b>, spaces <b>F A C E</b>; bass lines are <b>G B D F A</b>, spaces <b>A C E G</b>. Middle C sits one ledger line below the treble staff and one above the bass.</p>",
          questions: (rng) => readNotesQuestion(rng),
        },
        {
          id: "g1-rhythm", title: "Note values, tones & semitones",
          why: "Everything in rhythm is built by halving: each value splits into two of the next. And every scale is just a pattern of tones and semitones.",
          what: "<p>A semibreve = 2 minims = 4 crotchets = 8 quavers = 16 semiquavers. A <b>semitone</b> is the smallest step (one key on the piano); a <b>tone</b> is two semitones.</p>",
          questions: (rng) => (rng.bool() ? noteValueQuestion(rng) : toneSemitoneQuestion(rng)),
        },
        {
          id: "g1-keys", title: "C, G, D & F major",
          why: "The first four major keys you meet - and the start of the circle of fifths in both directions from C.",
          what: "<p>C major (no sharps or flats), then G major (1 sharp) and D major (2 sharps) clockwise, and F major (1 flat) anticlockwise. Plus naming simple intervals by number.</p>",
          questions: (rng) => (rng.bool() ? keySigSubset(rng, ["C", "G", "D", "F"]) : intervalNumberQuestion(rng, ["C", "G", "D", "F"])),
        },
      ],
    },
    {
      grade: 2, title: "Grade 2", role: "practice",
      topics: [
        {
          id: "g2-keys", title: "More keys, major & minor",
          why: "Each new key is one more step round the circle of fifths - and every major key has a relative minor that shares its signature.",
          what: "<p>Major keys out to A, B♭ and E♭, and the minor keys that share their signatures (a minor 3rd below the major). The minor's signature comes from its <i>relative major</i>.</p>",
          questions: (rng) => (rng.bool(0.6) ? keySigSubset(rng, ["G", "D", "A", "F", "Bb", "Eb"]) : keySigSubset(rng, ["E", "A", "D", "G", "C"], "minor")),
        },
        {
          id: "g2-intervals", title: "Intervals by number",
          why: "Before quality comes counting: name the size of an interval just by counting letter names, inclusively.",
          what: "<p>Count the lower note as 1 and step up the letters to the higher note. C up to G is C-D-E-F-G = a 5th. The same count works regardless of any sharps or flats.</p>",
          questions: (rng) => intervalNumberQuestion(rng, ["C", "G", "D", "A", "F", "Bb"]),
        },
        {
          id: "g2-rhythm", title: "Note values & rests",
          why: "Reading rhythm fluently means knowing every value in terms of every other, not just counting beats.",
          what: "<p>The same halving relationships extend to rests, which mirror the note values. Knowing how many of one value fill another is the key skill.</p>",
          questions: (rng) => noteValueQuestion(rng),
        },
      ],
    },
    {
      grade: 3, title: "Grade 3", role: "practice",
      topics: [
        {
          id: "g3-melodic", title: "The three minor scales",
          why: "Minor isn't one scale but three closely-related forms - telling them apart by sight and sound is the Grade 3 leap.",
          what: "<p><b>Natural</b> minor uses the key signature as-is; <b>harmonic</b> minor raises the 7th (making an augmented 2nd); <b>melodic</b> minor raises the 6th and 7th ascending, reverting descending.</p>",
          questions: (rng) => minorFormQuestion(rng),
        },
        {
          id: "g3-compound", title: "Simple & compound time",
          why: "The lilt of 6/8 versus the march of 2/4 comes from whether each beat divides into two or three.",
          what: "<p>In compound time (6/8, 9/8, 12/8) the beat is a dotted note dividing into three; divide the top number by three for the number of beats.</p>",
          questions: (rng) => timeClassifyQuestion(rng),
        },
        {
          id: "g3-quality", title: "Interval quality",
          why: "Same number, different size: a 3rd can be major or minor. Quality is where intervals start to carry feeling.",
          what: "<p>2nds, 3rds, 6ths and 7ths are major or minor; unisons, 4ths, 5ths and octaves are perfect. One semitone outside gives augmented or diminished.</p>",
          questions: (rng) => intervalQuestion(rng),
        },
      ],
    },
    {
      grade: 4, title: "Grade 4", role: "practice",
      topics: [
        {
          id: "g4-degree-names", title: "Technical names of scale degrees",
          why: "Every note in a key has a <i>job</i>, not just a letter. The 'dominant' pulls toward the tonic; the 'leading note' leans up into it by a semitone. Naming the role explains why melodies feel like they're going somewhere.",
          what: "<p>The seven degrees, in order: <b>tonic, supertonic, mediant, subdominant, dominant, submediant, leading note</b>. The subdominant sits a 5th <i>below</i> the tonic (mirroring the dominant a 5th above), and the leading note is only a semitone below the tonic in major and harmonic minor.</p>",
          questions: (rng) => degreeNameQuestion(rng),
        },
        {
          id: "g4-intervals", title: "Intervals by number and quality",
          why: "An interval's <i>number</i> (count the letter names) and its <i>quality</i> (the exact semitone span) are two separate facts. That's why C-E and C-Eb are both 'thirds' yet sound different: same number, different quality.",
          what: "<p>Count letter names inclusively for the number (C up to E = C,D,E = a 3rd). Then size it: major/minor for 2nds 3rds 6ths 7ths, perfect for unison 4th 5th octave, with augmented/diminished one semitone outside.</p>",
          questions: (rng) => intervalQuestion(rng),
        },
        {
          id: "g4-key-signatures", title: "Keys up to 5 sharps and flats",
          why: "Key signatures aren't arbitrary - they fall straight out of the circle of fifths. Each step clockwise adds one sharp, each step anticlockwise adds one flat, always in a fixed order (FCGDAEB / BEADGCF).",
          what: "<p>This level covers all major and minor keys up to five sharps and five flats, in both clefs, plus harmonic and melodic minor forms.</p>",
          questions: (rng) => keySignatureQuestion(rng),
        },
        {
          id: "g4-alto-clef", title: "The alto (C) clef",
          why: "The viola lives mostly between the treble and bass staves; the alto clef centres middle C on the middle line so it needs almost no ledger lines.",
          what: "<p>The alto clef is a <b>C clef</b>: its centre marks <b>middle C (C4)</b>, which sits on the <b>middle line</b>. From there, read up and down in line/space steps just like any clef. The lines from bottom to top are <b>F A C E G</b>; the spaces are <b>G B D F</b>.</p>",
          questions: (rng) => altoClefQuestion(rng),
        },
        {
          id: "g4-double-acc", title: "Double sharps/flats & enharmonics",
          why: "Double accidentals keep spelling consistent inside a key - the leading note of G# minor is F𝄪, not G, because every scale needs one of each letter name.",
          what: "<p>A <b>double sharp (𝄪)</b> raises a note two semitones; a <b>double flat (𝄫)</b> lowers it two. Two notes that sound identical but are spelled differently - like F𝄪 and G, or G# and A♭ - are <b>enharmonic equivalents</b>. Which spelling you use depends on the key and the musical direction.</p>",
          questions: (rng) => enharmonicQuestion(rng),
        },
        {
          id: "g4-time", title: "Simple & compound time, duplets, double dots",
          why: "Whether a beat splits in two or in three is what gives a march its stride and a jig its lilt - it's the difference between simple and compound time.",
          what: "<p>In <b>simple time</b> (2/4, 3/4, 4/4) each beat divides into two. In <b>compound time</b> (6/8, 9/8, 12/8) each beat is a <i>dotted</i> note that divides into three; the top number divided by three gives the number of beats. A <b>dot</b> adds half a note's value, a <b>second dot</b> adds half again. A <b>duplet</b> fits two notes into the time of three; a <b>triplet</b> fits three into the time of two.</p>",
          questions: (rng) => timeSignatureQuestion(rng),
        },
        {
          id: "g4-triads", title: "Tonic, subdominant & dominant triads",
          why: "I, IV and V between them contain all seven notes of the scale - which is why so much music is built from just these three chords.",
          what: "<p>A <b>triad</b> stacks two 3rds: a root, a 3rd and a 5th. The three primary triads are built on the <b>tonic (I)</b>, <b>subdominant (IV)</b> and <b>dominant (V)</b>. Putting the 3rd in the bass gives <b>first inversion</b>; the 5th in the bass gives <b>second inversion</b>.</p>",
          questions: (rng) => triadQuestion(rng),
        },
        {
          id: "g4-ornaments", title: "Ornaments",
          why: "Ornaments are shorthand for decorations performers once improvised; the signs save writing every tiny note out - and each has its own flavour you can hear.",
          what: "<p>The common ornaments: the <b>trill</b> (rapid alternation with the note above), the <b>upper</b> and <b>lower mordent</b> (one quick alternation above or below), the <b>turn</b> (above-note-below-note), and the grace notes - the crushed <b>acciaccatura</b> and the leaning <b>appoggiatura</b>.</p>",
          questions: (rng) => ornamentQuestion(rng),
        },
      ],
    },
    {
      grade: 5, title: "Grade 5", role: "practice",
      topics: [
        {
          id: "g5-key-id", title: "All keys & key identification",
          why: "Grade 5 completes the circle of fifths. Once you can name any key from its signature - in either direction - every later analysis question starts from solid ground.",
          what: "<p>All major and minor keys up to <b>seven</b> sharps and flats. Recognise a key from its signature, and give the signature of any named key. A minor key borrows the signature of its relative major (a minor 3rd above).</p>",
          questions: (rng) => keyIdQuestion(rng),
        },
        {
          id: "g5-intervals", title: "All intervals, compound & inverted",
          why: "By Grade 5 every interval must be named exactly - including the augmented and diminished ones - and you must handle intervals bigger than an octave and work out inversions.",
          what: "<p>Name any simple interval by number and quality, including <b>augmented</b> and <b>diminished</b>. A <b>compound</b> interval is larger than an octave (a 9th, 10th...). To <b>invert</b> an interval, the numbers add to 9 and the quality flips (major↔minor, augmented↔diminished, perfect stays perfect).</p>",
          questions: (rng) => {
            const r = rng.next();
            return r < 0.5 ? intervalQualityQuestion(rng) : r < 0.78 ? intervalInversionQuestion(rng) : compoundIntervalQuestion(rng);
          },
        },
        {
          id: "g5-chords", title: "Chords & cadences",
          why: "Naming chords by Roman numeral and inversion, and hearing the cadences at phrase-ends, is the gateway to all the harmony in Grades 6-8.",
          what: "<p>Identify the triads on <b>I, ii, IV and V</b> in root position and first/second inversion. Recognise the four cadences: <b>perfect</b> (V-I), <b>plagal</b> (IV-I), <b>imperfect</b> (ending on V) and <b>interrupted</b> (V-vi).</p>",
          questions: (rng) => (rng.bool(0.6) ? chordIdQuestion(rng) : cadenceQuestion(rng)),
        },
        {
          id: "g5-clefs", title: "The four clefs",
          why: "Treble, bass, alto and tenor between them keep almost every instrument's part near the staff, with few ledger lines. Reading all four fluently is a Grade 5 staple.",
          what: "<p>The <b>tenor clef</b> is a C clef centring middle C on the <b>fourth line up</b> (used for higher cello, bassoon and trombone passages). With the alto clef (middle C on the centre line) you can now read all four common clefs.</p>",
          questions: (rng) => fourClefQuestion(rng),
        },
        {
          id: "g5-transposition", title: "Transposition",
          why: "Transposing instruments sound at a different pitch from what's written, so players and arrangers constantly convert between written and concert pitch.",
          what: "<p>Transpose a melody by a named interval, up or down. Know the common transposing instruments: instruments <b>in B♭</b> sound a major 2nd lower than written, <b>in A</b> a minor 3rd lower, <b>in F</b> a perfect 5th lower. To sound a given concert pitch you write that interval <i>higher</i>.</p>",
          questions: (rng) => (rng.bool() ? transposeInstrumentQuestion(rng) : transposeIntervalQuestion(rng)),
        },
        {
          id: "g5-terms", title: "Foreign terms & signs",
          why: "Italian (with some French and German) terms are the shared vocabulary of expression marks - knowing them turns a printed page into instructions.",
          what: "<p>A working vocabulary of tempo, dynamic and expression terms - mostly <b>Italian</b>, with common <b>French</b> and <b>German</b> equivalents.</p>",
          questions: (rng) => termQuestion(rng),
        },
        {
          id: "g5-instruments", title: "Instruments & voices",
          why: "Knowing the instrument families and the four voice types (SATB) is the groundwork for reading scores and understanding how music is laid out.",
          what: "<p>The four families - <b>strings, woodwind, brass, percussion</b> - and the four standard voices from highest to lowest: <b>soprano, alto, tenor, bass</b>.</p>",
          questions: (rng) => instrumentQuestion(rng),
        },
      ],
    },
    {
      grade: 6, title: "Grade 6", role: "practice",
      topics: [
        {
          id: "g6-figured-bass", title: "Figured bass & inversions",
          why: "Figured bass is harmony's shorthand: a few numbers under a bass note tell you the whole chord and its inversion. Reading it fluently is the foundation of Grade 6 harmony.",
          what: "<p>The figures count intervals above the bass. A triad: <b>5/3</b> (root), <b>6</b> (first inversion), <b>6/4</b> (second inversion). A 7th chord: <b>7</b>, <b>6/5</b>, <b>4/3</b>, <b>4/2</b> for its four positions.</p>",
          questions: (rng) => (rng.bool() ? figuredBassQuestion(rng) : dominant7thQuestion(rng)),
        },
        {
          id: "g6-chords", title: "Dominant & supertonic 7ths",
          why: "The dominant 7th (V7) is the engine of tonal harmony - its built-in dissonance pulls hard to the tonic. Knowing its inversions and the supertonic 7th expands your harmonic palette.",
          what: "<p><b>V7</b> adds a minor 7th above the dominant triad, giving a four-note chord with four inversions (V7, V7b, V7c, V7d). The <b>supertonic 7th (ii7)</b> commonly precedes V.</p>",
          questions: (rng) => dominant7thQuestion(rng),
        },
        {
          id: "g6-non-chord", title: "Melodic decoration",
          why: "Not every note belongs to the chord beneath it. Naming passing notes, suspensions and the rest is how you analyse and write expressive melodic lines.",
          what: "<p>The non-chord notes: <b>passing</b> and <b>auxiliary</b> notes (stepwise), the <b>suspension</b> (held over and resolved down), the <b>appoggiatura</b> (leant on, by leap then step), the <b>anticipation</b> and the <b>changing note</b>.</p>",
          questions: (rng) => nonChordToneQuestion(rng),
        },
        {
          id: "g6-harmony-write", title: "Harmonising a melody",
          why: "Choosing chords to support a tune - and voicing them well - is the core compositional skill of Grade 6. It is open-ended writing, not a single-answer drill.",
          what: "<p>This is a writing task: given a short melody, choose suitable chords (by Roman numeral) at the cadence points and through the phrase, then voice them in four parts. Drill the building blocks - figured bass, 7th chords, cadences - in the other Grade 6 topics; full harmonisation practice is coming next.</p>",
          questions: null,
          tags: ["comingNext"],
        },
      ],
    },
    {
      grade: 7, title: "Grade 7", role: "practice",
      topics: [
        {
          id: "g7-chromatic", title: "Chromatic chords",
          why: "Grade 7 adds colour beyond the diatonic chords: the tense diminished 7th and the dark Neapolitan 6th are the first of the chromatic chords that make late-Romantic harmony so rich.",
          what: "<p>The <b>diminished 7th</b> stacks minor 3rds and is highly unstable. The <b>Neapolitan 6th</b> is a major triad on the <i>flattened</i> supertonic (♭II), almost always in first inversion, used to approach the dominant. Plus secondary (non-dominant) 7th chords.</p>",
          questions: (rng) => chromaticChordQuestion(rng),
        },
        {
          id: "g7-figured-bass", title: "Suspensions in figured bass",
          why: "Reading the figures for suspensions (4-3, 7-6, 9-8) lets you follow - and realise - the expressive clashes that drive Baroque and Classical part-writing.",
          what: "<p>A suspension is figured by the dissonance resolving to the consonance: <b>4-3</b>, <b>7-6</b>, <b>9-8</b>. The first figure is the held, clashing note; the second is its stepwise resolution.</p>",
          questions: (rng) => figuredBassQuestion(rng),
        },
        {
          id: "g7-composition", title: "Figured bass & melody writing",
          why: "Realising a figured bass in four parts and composing/continuing a melody are the substantial written tasks of Grade 7 - open-ended craft, not single-answer drills.",
          what: "<p>These are writing tasks: realise a more complex figured bass in four-part harmony, and compose or continue a melodic line with stylistic awareness. The chord-recognition and figured-bass drills here build the toolkit; guided writing practice is coming next.</p>",
          questions: null,
          tags: ["comingNext"],
        },
      ],
    },
    {
      grade: 8, title: "Grade 8", role: "practice",
      topics: [
        {
          id: "g8-aug-sixth", title: "Augmented 6th chords",
          why: "The Italian, French and German augmented 6ths are the signature chromatic chords of Grade 8 - three flavours of the same striking interval, each resolving outward to the dominant.",
          what: "<p>All three share an <b>augmented 6th</b> above the bass. The <b>Italian</b> adds a major 3rd; the <b>French</b> adds a major 3rd and an augmented 4th; the <b>German</b> adds a major 3rd and a perfect 5th (and sounds like a dominant 7th).</p>",
          questions: (rng) => augmentedSixthQuestion(rng),
        },
        {
          id: "g8-secondary-dominant", title: "Secondary dominants",
          why: "Borrowing the dominant of a chord other than the tonic (V/V, V/ii...) tonicises it briefly and is the workhorse of chromatic harmony from Bach to jazz.",
          what: "<p>A <b>secondary dominant</b> is the dominant 7th (or triad) of a chord other than I, written V/x. V/V resolves to V, V/ii to ii, and so on - a momentary 'mini-key' within the prevailing key.</p>",
          questions: (rng) => secondaryDominantQuestion(rng),
        },
        {
          id: "g8-composition", title: "Stylistic composition & analysis",
          why: "The top grade is largely a composition-and-analysis paper - stylistic pastiche and detailed score commentary - which is craft and prose, not single-answer drilling.",
          what: "<p>These are extended written tasks: compose in a defined style (often Baroque), and analyse a substantial score for harmony, modulation, texture and form. The chromatic-chord drills here sharpen the analytical eye; guided composition and analysis practice is coming next.</p>",
          questions: null,
          tags: ["comingNext"],
        },
      ],
    },
  ];

  const explainers = [
    { id: "monochord", title: "A string over a box", blurb: "Where pitch and the intervals come from." },
    { id: "harmonic-series", title: "The harmonic series", blurb: "One string, many notes at once." },
    { id: "circle-of-fifths", title: "The circle of fifths", blurb: "Where key signatures come from." },
    { id: "temperament", title: "Why pianos are slightly out of tune", blurb: "Equal temperament vs just intonation." },
    { id: "three-minors", title: "Why minor has three forms", blurb: "Natural, harmonic, melodic - and the awkward gap." },
    { id: "modes", title: "Modes beyond major & minor", blurb: "Dorian, Phrygian and friends." },
    { id: "keyboard", title: "Semitones on a keyboard", blurb: "Count the keys, name the interval." },
    { id: "four-clefs", title: "The four clefs", blurb: "Same note, four different positions - middle C as your anchor." },
    { id: "note-values", title: "Note values and duration", blurb: "The subdivision hierarchy from semibreve to semiquaver." },
  ];

  // Link topics to a relevant "Why" explainer so the answer reveal can offer a
  // "dig deeper" thread into the science behind the question.
  const EXPLAINER_FOR = {
    "g1-keys": "circle-of-fifths", "g2-keys": "circle-of-fifths",
    "g4-key-signatures": "circle-of-fifths", "g5-key-id": "circle-of-fifths",
    "g3-melodic": "three-minors",
    "g2-intervals": "monochord",
    "g3-quality": "harmonic-series", "g4-intervals": "harmonic-series", "g5-intervals": "harmonic-series",
  };
  grades.forEach((g) => g.topics.forEach((t) => {
    if (EXPLAINER_FOR[t.id]) t.explainer = EXPLAINER_FOR[t.id];
  }));

  // === Reference (look-up) tables ========================================
  // A static, searchable reference built from the same data the drills use, so
  // learners can find a fact directly instead of only meeting it in practice.

  function keySignatureRows() {
    const glyph = (sig) => sig.accidentals.map((l) => l + (sig.type === "sharp" ? "♯" : "♭")).join(" ");
    return Object.keys(M.MAJOR_SIGNATURES).map((key) => {
      const sig = M.keySignature(key, "major");
      const n = Math.abs(sig.count);
      const count = n === 0 ? "none" : `${n} ${sig.type}${n > 1 ? "s" : ""}`;
      return [key + " major", count, n === 0 ? "-" : glyph(sig), M.relativeMinorOf(key) + " minor"];
    });
  }

  const INTERVAL_REF = [
    ["Perfect unison", "0", "C - C"], ["Minor 2nd", "1", "C - D♭"], ["Major 2nd", "2", "C - D"],
    ["Minor 3rd", "3", "C - E♭"], ["Major 3rd", "4", "C - E"], ["Perfect 4th", "5", "C - F"],
    ["Aug 4th / dim 5th (tritone)", "6", "C - F♯ / C - G♭"], ["Perfect 5th", "7", "C - G"],
    ["Minor 6th", "8", "C - A♭"], ["Major 6th", "9", "C - A"], ["Minor 7th", "10", "C - B♭"],
    ["Major 7th", "11", "C - B"], ["Perfect octave", "12", "C - C"],
  ];

  const DEGREE_REF = [
    ["1", "Tonic", "the home note the key is named after"],
    ["2", "Supertonic", "one step above the tonic"],
    ["3", "Mediant", "midway between tonic and dominant"],
    ["4", "Subdominant", "a 5th below the tonic"],
    ["5", "Dominant", "a 5th above the tonic - the strongest pull home"],
    ["6", "Submediant", "midway between tonic and subdominant going down"],
    ["7", "Leading note", "a semitone below the tonic, leaning up into it"],
  ];

  const VALUE_REF = [
    ["Semibreve (whole note)", "4 beats", "= 2 minims = 4 crotchets"],
    ["Minim (half note)", "2 beats", "= 2 crotchets"],
    ["Crotchet (quarter note)", "1 beat", "= 2 quavers"],
    ["Quaver (eighth note)", "½ beat", "= 2 semiquavers"],
    ["Semiquaver (sixteenth)", "¼ beat", "= 2 demisemiquavers"],
    ["Dotted note", "1½ × its value", "a dot adds half the note's value again"],
  ];

  const CLEF_REF = [
    ["Treble (G)", "2nd line up = G4", "violin, flute, oboe, right-hand piano, high voices"],
    ["Bass (F)", "2nd line down = F3", "cello, bassoon, tuba, left-hand piano, low voices"],
    ["Alto (C)", "middle line = middle C", "viola"],
    ["Tenor (C)", "4th line up = middle C", "high cello, bassoon & trombone passages"],
  ];

  const scalePat = (type) => M.SCALE_STEPS[type].map((s) => (s === 1 ? "S" : s === 2 ? "T" : "T½")).join(" ");
  const SCALE_REF = [
    ["major", "Major", "bright, resolved"],
    ["naturalMinor", "Natural minor", "uses the key signature as-is"],
    ["harmonicMinor", "Harmonic minor", "raised 7th - an exotic augmented 2nd"],
    ["melodicMinorAsc", "Melodic minor (ascending)", "raised 6th and 7th on the way up"],
    ["dorian", "Dorian", "minor with a raised 6th"],
    ["phrygian", "Phrygian", "minor with a flat 2nd"],
    ["lydian", "Lydian", "major with a sharp 4th"],
    ["mixolydian", "Mixolydian", "major with a flat 7th"],
    ["aeolian", "Aeolian", "the natural minor scale"],
    ["locrian", "Locrian", "diminished and unstable"],
  ].map(([type, name, ch]) => [name, scalePat(type), ch]);

  const CHORD_TYPE_REF = [
    { term: "Major triad", def: "root + major 3rd + perfect 5th (C-E-G)" },
    { term: "Minor triad", def: "root + minor 3rd + perfect 5th (C-E♭-G)" },
    { term: "Diminished triad", def: "root + minor 3rd + diminished 5th (C-E♭-G♭)" },
    { term: "Augmented triad", def: "root + major 3rd + augmented 5th (C-E-G♯)" },
    { term: "Dominant 7th", def: "major triad + a minor 7th (G-B-D-F) - pulls to the tonic" },
    { term: "Major 7th", def: "major triad + a major 7th (C-E-G-B)" },
    { term: "Minor 7th", def: "minor triad + a minor 7th (C-E♭-G-B♭)" },
    { term: "Diminished 7th", def: "four notes stacked in minor 3rds (B-D-F-A♭) - very tense" },
    { term: "Half-diminished 7th", def: "diminished triad + a minor 7th (B-D-F-A)" },
  ];

  const TUPLET_REF = [
    { term: "Triplet", def: "3 equal notes in the time of 2" },
    { term: "Duplet", def: "2 equal notes in the time of 3 (in compound time)" },
    { term: "Quadruplet", def: "4 equal notes in the time of 3" },
    { term: "Quintuplet", def: "5 equal notes in the time of 4 (or 3)" },
    { term: "Sextuplet", def: "6 equal notes in the time of 4" },
  ];

  const ORDER_REF = [
    { term: "Order of sharps", def: "F♯ C♯ G♯ D♯ A♯ E♯ B♯ - each new sharp key adds the next one" },
    { term: "Order of flats", def: "B♭ E♭ A♭ D♭ G♭ C♭ F♭ - the order of sharps reversed" },
  ];

  const termsBy = (cat) => TERMS.filter((t) => t.cat === cat).map((t) => ({ term: t.term, def: t.meaning }));

  const reference = [
    // Pitch & keys
    { id: "keys", group: "Pitch & keys", title: "Key signatures", type: "table", columns: ["Key", "Signature", "Accidentals", "Relative minor"], rows: keySignatureRows() },
    { id: "clefs", group: "Pitch & keys", title: "Clefs", type: "table", columns: ["Clef", "Reference point", "Used by"], rows: CLEF_REF },
    { id: "order", group: "Pitch & keys", title: "Order of sharps & flats", type: "glossary", items: ORDER_REF },
    { id: "intervals", group: "Pitch & keys", title: "Intervals", type: "table", columns: ["Interval", "Semitones", "Example"], rows: INTERVAL_REF },
    { id: "enharmonics", group: "Pitch & keys", title: "Enharmonic equivalents", type: "table", columns: ["Note", "Same pitch as"], rows: ENHARM.map((e) => [e.a, e.b]) },
    { id: "scales", group: "Pitch & keys", title: "Scales & modes", type: "table", columns: ["Scale", "Pattern (T/S)", "Character"], rows: SCALE_REF },
    { id: "degrees", group: "Pitch & keys", title: "Scale-degree names", type: "table", columns: ["Degree", "Name", "Role"], rows: DEGREE_REF },
    // Chords & harmony
    { id: "chordtypes", group: "Chords & harmony", title: "Chord types", type: "glossary", items: CHORD_TYPE_REF },
    { id: "cadences", group: "Chords & harmony", title: "Cadences", type: "glossary", items: CADENCES.map((c) => ({ term: c.name + " cadence", def: c.why })) },
    { id: "figured", group: "Chords & harmony", title: "Figured bass", type: "glossary", items: FIGURED.map((f) => ({ term: f.fig, def: f.inv })) },
    { id: "chromatic", group: "Chords & harmony", title: "Chromatic chords", type: "glossary", items: CHROMATIC_CHORDS.concat(AUG_SIXTHS).map((c) => ({ term: c.name, def: c.desc })) },
    // Rhythm & metre
    { id: "values", group: "Rhythm & metre", title: "Note values", type: "table", columns: ["Note", "Worth (in 4/4)", "Divides into"], rows: VALUE_REF },
    { id: "time", group: "Rhythm & metre", title: "Time signatures", type: "table", columns: ["Signature", "Type", "Feel"], rows: TIMES.map((t) => [t.sig, t.cat, t.why]) },
    { id: "tuplets", group: "Rhythm & metre", title: "Tuplets", type: "glossary", items: TUPLET_REF },
    // Tempo, dynamics & expression
    { id: "tempo", group: "Tempo & expression", title: "Tempo", type: "glossary", items: termsBy("tempo") },
    { id: "tempochange", group: "Tempo & expression", title: "Changing the tempo", type: "glossary", items: termsBy("tempochange") },
    { id: "dynamics", group: "Tempo & expression", title: "Dynamics", type: "glossary", items: termsBy("dynamics") },
    { id: "articulation", group: "Tempo & expression", title: "Articulation & touch", type: "glossary", items: termsBy("articulation") },
    { id: "expression", group: "Tempo & expression", title: "Expression & mood", type: "glossary", items: termsBy("expression") },
    { id: "navigation", group: "Tempo & expression", title: "Navigation & signs", type: "glossary", items: termsBy("navigation") },
    { id: "ornaments", group: "Tempo & expression", title: "Ornaments", type: "glossary", items: ORNAMENTS.map((o) => ({ term: o.name, def: o.desc })) },
    // French & German
    { id: "french", group: "French & German", title: "French terms", type: "glossary", items: termsBy("french") },
    { id: "german", group: "French & German", title: "German terms", type: "glossary", items: termsBy("german") },
    // Instruments & voices
    { id: "instruments", group: "Instruments & voices", title: "Instruments & families", type: "table", columns: ["Instrument", "Family"], rows: INSTRUMENTS.map((i) => [i.name, i.family]) },
    { id: "voices", group: "Instruments & voices", title: "Voices (SATB)", type: "glossary", items: VOICES.map((v) => ({ term: v.name, def: v.note })) },
    { id: "transposing", group: "Instruments & voices", title: "Transposing instruments", type: "table", columns: ["Instrument", "Sounds", "Written part"], rows: TRANSPOSERS.map((t) => [t.name, t.blurb, `a ${t.quality} ${M.ordinal(t.number)} higher than concert pitch`]) },
  ];

  const api = {
    grades, explainers, reference,
    helpers: { choices, pick, staffBlock },
  };

  global.MTT = global.MTT || {};
  global.MTT.content = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
