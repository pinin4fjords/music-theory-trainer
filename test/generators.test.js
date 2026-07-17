import { describe, it, expect } from "vitest";

const { content, session, validate, rng } = globalThis.MTT;

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
