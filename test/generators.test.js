import { describe, it, expect } from "vitest";

const { content, session, validate, rng } = globalThis.MTT;
const music = globalThis.MTT.music;

const topics = session.quizableTopics(content);

// Aural topics live outside content.grades so they need separate coverage.
const auralTopics = (content.auralGrades || []).flatMap(function (ag) {
  return ag.topics.filter(function (t) { return typeof t.questions === "function"; })
    .map(function (t) { return Object.assign({}, t, { grade: ag.grade }); });
});

describe("content generators - property/smoke tests", () => {
  it("there are generators across all eight grades", () => {
    const grades = new Set(topics.map((t) => t.grade));
    for (let g = 1; g <= 8; g++) expect(grades.has(g)).toBe(true);
  });

  // Every generator must produce 50+ valid, schema-conformant questions under a
  // fixed seed (invalid content fails the suite).
  it.each(topics.map((t) => [t.id, t]))("%s: 60 generated questions are all valid", (id, topic) => {
    const r = rng.create("gen-" + id);
    for (let i = 0; i < 60; i++) {
      const q = topic.questions(r);
      const result = validate.validateQuestion(q);
      if (!result.ok) {
        throw new Error(`${id} #${i}: ${result.errors.join("; ")}\n${JSON.stringify(q)}`);
      }
    }
  });

  it("generators are deterministic: same seed => identical questions", () => {
    for (const topic of topics) {
      const a = rng.create("det-" + topic.id);
      const b = rng.create("det-" + topic.id);
      for (let i = 0; i < 10; i++) {
        const qa = topic.questions(a);
        const qb = topic.questions(b);
        expect(qb.prompt).toBe(qa.prompt);
        expect(qb.answer).toBe(qa.answer);
        expect(qb.choices).toEqual(qa.choices);
      }
    }
  });

  it.each(auralTopics.map((t) => [t.id, t]))("aural %s: 60 generated questions are all valid", (id, topic) => {
    const r = rng.create("gen-" + id);
    for (let i = 0; i < 60; i++) {
      const q = topic.questions(r);
      const result = validate.validateQuestion(q);
      if (!result.ok) {
        throw new Error(`${id} #${i}: ${result.errors.join("; ")}\n${JSON.stringify(q)}`);
      }
    }
  });

  it("aural cadence/chord/modulation questions are transposed across several keys, not just C", () => {
    const ids = ["g7-aural-cadence", "g7-aural-chords", "g7-aural-modulation"];
    for (const id of ids) {
      const topic = auralTopics.find((t) => t.id === id);
      expect(topic).toBeTruthy();
      const r = rng.create("keys-" + id);
      const keysSeen = new Set();
      for (let i = 0; i < 40; i++) {
        const q = topic.questions(r);
        // Cadence questions may be in a major or minor key; chord/modulation
        // questions are always major.  Accept both "<b>X major</b>" and
        // "<b>X minor</b>" as valid key labels.
        const m = q.prompt.match(/<b>([A-G][a-z#♭]* (?:major|minor))<\/b>/);
        expect(m).toBeTruthy();
        keysSeen.add(m[1]);
      }
      expect(keysSeen.size).toBeGreaterThan(1);
    }
  });

  it("modulation accidental notes are musically correct across keys", () => {
    const topic = auralTopics.find((t) => t.id === "g7-aural-modulation");
    // dominant -> raised 4th, subdominant -> lowered 7th, relative minor -> raised 5th + its name.
    const expected = {
      C: { "Modulates to the dominant": "F♯", "Modulates to the subdominant": "B♭", "Modulates to the relative minor": "G♯ (leading note of A minor)" },
      G: { "Modulates to the dominant": "C♯", "Modulates to the subdominant": "F", "Modulates to the relative minor": "D♯ (leading note of E minor)" },
      F: { "Modulates to the dominant": "B", "Modulates to the subdominant": "E♭", "Modulates to the relative minor": "C♯ (leading note of D minor)" },
      D: { "Modulates to the dominant": "G♯", "Modulates to the subdominant": "C", "Modulates to the relative minor": "A♯ (leading note of B minor)" },
    };
    const r = rng.create("mod-accidentals");
    const seenByKey = {};
    for (let i = 0; i < 200 && Object.keys(seenByKey).length < 4; i++) {
      const q = topic.questions(r);
      const key = q.prompt.match(/starts in <b>(\w+) major/)[1];
      const note = q.explanation.match(/listen for <b>([^<]+)<\/b>/)[1];
      seenByKey[key] = seenByKey[key] || {};
      seenByKey[key][q.answer] = note;
    }
    for (const key of Object.keys(expected)) {
      for (const answer of Object.keys(expected[key])) {
        if (seenByKey[key] && seenByKey[key][answer]) {
          expect(seenByKey[key][answer]).toBe(expected[key][answer]);
        }
      }
    }
  });

  it("melodic minor descending is quizzed as equivalent to natural minor", () => {
    const topic = topics.find((t) => t.id === "g3-melodic");
    const r = rng.create("mm-desc");
    let found = false;
    for (let i = 0; i < 60; i++) {
      const q = topic.questions(r);
      if (/descending/i.test(q.prompt)) {
        found = true;
        expect(q.answer).toMatch(/Natural minor/);
      }
    }
    expect(found).toBe(true);
  });

  it("g8 cadence chords may appear in inversion but the cadence label never changes", () => {
    const topic = auralTopics.find((t) => t.id === "g8-aural-cadence");
    const majorLabels = [
      "Perfect cadence (V-I)",
      "Imperfect cadence (ending on V)",
      "Interrupted cadence (V-vi)",
      "Plagal cadence (IV-I)",
    ];
    const minorLabels = [
      "Perfect cadence (V-i)",
      "Imperfect cadence (ending on V)",
      "Interrupted cadence (V-VI)",
      "Plagal cadence (iv-i)",
    ];
    const r = rng.create("g8-cadence-inversions");
    for (let i = 0; i < 100; i++) {
      const q = topic.questions(r);
      const sortedChoices = q.choices.slice().sort();
      const isMajorPool = sortedChoices.every((c) => majorLabels.includes(c));
      const pool = isMajorPool ? majorLabels : minorLabels;
      expect(pool).toContain(q.answer);
      expect(sortedChoices).toEqual(pool.slice().sort());
    }
  });

  it("g8 chord-naming answers include a position letter for every chord, and only I/V/ii ever vary from root position", () => {
    const topic = auralTopics.find((t) => t.id === "g8-aural-chords");
    const r = rng.create("g8-chord-positions");
    const seenNonRoot = new Set();
    for (let i = 0; i < 100; i++) {
      const q = topic.questions(r);
      const chordTokens = q.answer.split(" - ");
      expect(chordTokens.length).toBe(3);
      for (const token of chordTokens) {
        const m = token.match(/^(ii|IV|V7|vi|I|V)([abc])\s\(([^,]+), (root position|first inversion|second inversion)\)$/);
        expect(m, `unexpected chord token: "${token}"`).toBeTruthy();
        const [, roman, letter] = m;
        if (letter !== "a") {
          expect(["I", "ii", "V"]).toContain(roman);
          seenNonRoot.add(roman + letter);
        } else {
          expect(m[4]).toBe("root position");
        }
      }
    }
    // Every documented non-root position for I, ii and V should show up over 100 draws.
    for (const combo of ["Ib", "Ic", "iib", "Vb", "Vc"]) {
      expect(seenNonRoot.has(combo), `never saw ${combo}`).toBe(true);
    }
  });

  it("g2-time drills 2/2, 3/2, 4/2 and 3/8 plus triplets, and never duplets", () => {
    const topic = topics.find((t) => t.id === "g2-time");
    expect(topic).toBeTruthy();
    const r = rng.create("g2-time");
    const sigsSeen = new Set();
    let sawTriplet = false;
    for (let i = 0; i < 300; i++) {
      const q = topic.questions(r);
      expect(q.prompt.toLowerCase()).not.toContain("duplet");
      const m = q.prompt.match(/<b>(\d+\/\d+)<\/b>/);
      if (m) sigsSeen.add(m[1]);
      if (/triplet/i.test(q.prompt)) {
        sawTriplet = true;
        expect(q.answer).toBe("3 notes in the time of 2");
      }
    }
    for (const sig of ["2/2", "3/2", "4/2", "3/8"]) expect(sigsSeen.has(sig), `never saw ${sig}`).toBe(true);
    expect(sawTriplet).toBe(true);
  });

  it("g3-keys drills majors and minors, never exceeding 4 sharps or flats", () => {
    const topic = topics.find((t) => t.id === "g3-keys");
    expect(topic).toBeTruthy();
    const r = rng.create("g3-keys");
    const modesSeen = new Set();
    for (let i = 0; i < 200; i++) {
      const q = topic.questions(r);
      const mode = q.prompt.match(/\b(major|minor)\b/);
      expect(mode).toBeTruthy();
      modesSeen.add(mode[1]);
      const count = q.answer.match(/^(\d+)/);
      if (count) expect(Number(count[1])).toBeLessThanOrEqual(4);
    }
    expect(modesSeen.has("major")).toBe(true);
    expect(modesSeen.has("minor")).toBe(true);
  });

  it("g4-key-signatures drills minor keys as well as majors, up to 5 accidentals", () => {
    const topic = topics.find((t) => t.id === "g4-key-signatures");
    expect(topic).toBeTruthy();
    const r = rng.create("g4-keys");
    const modesSeen = new Set();
    let sawFive = false;
    for (let i = 0; i < 300; i++) {
      const q = topic.questions(r);
      const mode = q.prompt.match(/\b(major|minor)\b/);
      expect(mode).toBeTruthy();
      modesSeen.add(mode[1]);
      const count = q.answer.match(/^(\d+)/);
      if (count) {
        expect(Number(count[1])).toBeLessThanOrEqual(5);
        if (Number(count[1]) === 5) sawFive = true;
      }
    }
    expect(modesSeen.has("major")).toBe(true);
    expect(modesSeen.has("minor")).toBe(true);
    expect(sawFive).toBe(true);
  });

  it("g5-chords cadence-harmony: the answer harmonises both melody notes, every distractor fails", () => {
    const topic = topics.find((t) => t.id === "g5-chords");
    const romanToDegree = { I: 1, ii: 2, IV: 4, V: 5 };
    const pcOfNote = (name) => music.spelledToMidi(music.parseSpelled(name)) % 12;
    const triadPcs = (key, degree) =>
      music.triad(key, "major", degree, 0).map((n) => music.spelledToMidi(n) % 12);
    const chordHasNote = (key, roman, pc) => triadPcs(key, romanToDegree[roman]).includes(pc);
    const r = rng.create("g5-cadence-harmony");
    let sawCadenceHarmony = false;
    for (let i = 0; i < 400; i++) {
      const q = topic.questions(r);
      if (!/best harmonises the cadence/.test(q.prompt)) continue;
      sawCadenceHarmony = true;
      const key = q.prompt.match(/<b>([A-G][#b]?) major<\/b>/)[1];
      const [m1, m2] = q.a11yText.match(/major: ([A-G][#b]?) then ([A-G][#b]?)\./).slice(1);
      const pc1 = pcOfNote(m1);
      const pc2 = pcOfNote(m2);
      const consistent = q.choices.filter((choice) => {
        const [c1, c2] = choice.split(" - ");
        return chordHasNote(key, c1, pc1) && chordHasNote(key, c2, pc2);
      });
      expect(consistent).toEqual([q.answer]);
    }
    expect(sawCadenceHarmony).toBe(true);
  });

  it("g5-ornaments: every answer is a multi-note ornament, and all four appear", () => {
    const topic = content.grades.find((g) => g.grade === 5).topics.find((t) => t.id === "g5-ornaments");
    expect(topic).toBeTruthy();
    const realised = new Set(["trill", "upper mordent", "lower mordent", "turn"]);
    const seen = new Set();
    const r = rng.create("g5-ornaments");
    for (let i = 0; i < 80; i++) {
      const q = topic.questions(r);
      expect(q.prompt).toContain("written out in full");
      expect(realised.has(q.answer)).toBe(true);
      seen.add(q.answer);
    }
    expect(seen).toEqual(realised);
  });

  it("g6-chords: supertonic 7th is only ever root position (7) or first inversion (6/5)", () => {
    const topic = topics.find((t) => t.id === "g6-chords");
    const allowed = new Set(["ii7 (root position)", "ii7b (first inversion)", "7", "6/5"]);
    const r = rng.create("g6-supertonic");
    let sawSupertonic = false;
    let sawDominant = false;
    for (let i = 0; i < 300; i++) {
      const q = topic.questions(r);
      if (/supertonic 7th/.test(q.prompt)) {
        sawSupertonic = true;
        expect(allowed.has(q.answer), `unexpected ii7 answer: ${q.answer}`).toBe(true);
        expect(q.prompt).not.toMatch(/second inversion|third inversion/);
      } else if (/dominant 7th/.test(q.prompt)) {
        sawDominant = true;
      }
    }
    expect(sawSupertonic).toBe(true);
    expect(sawDominant).toBe(true);
  });

  it("g6-modulation: the tell-tale accidental and pivot function match the target key", () => {
    const topic = content.grades.find((g) => g.grade === 6).topics.find((t) => t.id === "g6-modulation");
    expect(topic).toBeTruthy();
    const r = rng.create("g6-modulation");
    let sawAccidental = false;
    let sawPivot = false;
    for (let i = 0; i < 400; i++) {
      const q = topic.questions(r);
      const home = q.prompt.match(/in <b>([A-G][#b]?) major<\/b>|from <b>([A-G][#b]?) major<\/b>/);
      if (/introduces the note <b>/.test(q.prompt)) {
        sawAccidental = true;
        const key = home[1];
        const sc = music.scale(key, "major");
        const dom = music.spelledName(sc[4]) + " major";
        const sub = music.spelledName(sc[3]) + " major";
        const rel = music.relativeMinorOf(key) + " minor";
        const acc = q.prompt.match(/introduces the note <b>([^<]+)<\/b>/)[1];
        const shift = (n, by) => music.spelledName(music.spelled(n.letter, n.accidental + by, n.octave));
        const expected =
          q.answer === dom ? shift(sc[3], +1) :
          q.answer === sub ? shift(sc[6], -1) :
          q.answer === rel ? shift(sc[4], +1) : null;
        expect(q.answer === dom || q.answer === sub || q.answer === rel).toBe(true);
        expect(acc).toBe(expected);
      } else if (/as the pivot/.test(q.prompt)) {
        sawPivot = true;
        const key = home[2];
        const sc = music.scale(key, "major");
        const dom = music.spelledName(sc[4]) + " major";
        const sub = music.spelledName(sc[3]) + " major";
        const rel = music.relativeMinorOf(key) + " minor";
        const target = q.prompt.match(/to <b>([^<]+)<\/b> \(/)[1];
        const expected =
          target === dom ? "IV (subdominant)" :
          target === sub ? "V (dominant)" :
          target === rel ? "III (mediant)" : null;
        expect(q.answer).toBe(expected);
      }
    }
    expect(sawAccidental).toBe(true);
    expect(sawPivot).toBe(true);
  });

  it("g7-secondary-sevenths: qualities match first-principles, and V7 is never the answer", () => {
    const topic = content.grades.find((g) => g.grade === 7).topics.find((t) => t.id === "g7-secondary-sevenths");
    expect(topic).toBeTruthy();
    const degreeOf = { tonic: 1, supertonic: 2, mediant: 3, subdominant: 4, dominant: 5, submediant: 6, "leading note": 7 };
    const seventhQuality = (degree) => {
      const sc = music.scale("C", "major");
      const at = (k) => ({ letter: sc[k % 7].letter, accidental: sc[k % 7].accidental, octave: sc[k % 7].octave + Math.floor(k / 7) });
      const idx = degree - 1;
      const t = music.interval(at(idx), at(idx + 2)).quality;
      const f = music.interval(at(idx), at(idx + 4)).quality;
      const s = music.interval(at(idx), at(idx + 6)).quality;
      if (t === "major" && f === "perfect" && s === "major") return "major 7th";
      if (t === "major" && f === "perfect" && s === "minor") return "dominant 7th";
      if (t === "minor" && f === "perfect" && s === "minor") return "minor 7th";
      if (t === "minor" && f === "diminished" && s === "minor") return "half-diminished 7th";
      return "?";
    };
    const r = rng.create("g7-secondary");
    let sawQuality = false;
    let sawLabel = false;
    for (let i = 0; i < 300; i++) {
      const q = topic.questions(r);
      const qm = q.prompt.match(/on the <b>([a-z ]+)<\/b> \(<b>/);
      if (qm) {
        sawQuality = true;
        expect(q.answer).toBe(seventhQuality(degreeOf[qm[1]]));
      }
      if (/name this diatonic 7th chord by Roman numeral/.test(q.prompt)) {
        sawLabel = true;
        expect(q.answer).not.toBe("V7");
      }
    }
    expect(sawQuality).toBe(true);
    expect(sawLabel).toBe(true);
  });

  it("g7-figured-bass: suspension figures 4-3, 7-6 and 9-8 are all asked", () => {
    const topic = topics.find((t) => t.id === "g7-figured-bass");
    const r = rng.create("g7-suspensions");
    const figuresSeen = new Set();
    const suspFigures = ["4-3", "7-6", "9-8"];
    for (let i = 0; i < 300; i++) {
      const q = topic.questions(r);
      if (/suspension/.test(q.prompt) && suspFigures.includes(q.answer)) figuresSeen.add(q.answer);
    }
    for (const fig of suspFigures) expect(figuresSeen.has(fig), `never saw ${fig} as answer`).toBe(true);
  });

  it("interval-quality topics always carry diagnostic meta", () => {
    // Topics that name interval *quality* (not just number) drive the diagnostic
    // feedback, so every question they emit must carry interval meta.
    const qualityTopics = ["g3-quality", "g4-intervals", "g5-intervals"]
      .map((id) => topics.find((t) => t.id === id))
      .filter(Boolean);
    expect(qualityTopics.length).toBe(3);
    for (const t of qualityTopics) {
      const r = rng.create("meta-" + t.id);
      for (let i = 0; i < 30; i++) {
        const q = t.questions(r);
        expect(q.meta && q.meta.type).toBe("interval");
      }
    }
  });
});
