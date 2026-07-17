import { describe, it, expect } from "vitest";

const { content, rng } = globalThis.MTT;

// Aural topics live outside content.grades; look them up by id.
const auralTopics = (content.auralGrades || []).flatMap(function (ag) {
  return ag.topics.map(function (t) { return Object.assign({}, t, { grade: ag.grade }); });
});
function topicById(id) {
  const t = auralTopics.find((x) => x.id === id);
  expect(t, "topic " + id + " must be registered").toBeTruthy();
  return t;
}

function sample(id, n) {
  const topic = topicById(id);
  const r = rng.create("stim-" + id);
  const out = [];
  for (let i = 0; i < n; i++) out.push(topic.questions(r));
  return out;
}

describe("aural stimulus quality (issue #6) - character / structure / describe-features", () => {
  it("is deterministic: same seed => identical questions", () => {
    for (const id of ["g4-aural-character", "g6-aural-structure", "g8-aural-features"]) {
      const topic = topicById(id);
      const a = rng.create("det-" + id);
      const b = rng.create("det-" + id);
      for (let i = 0; i < 20; i++) {
        const qa = topic.questions(a);
        const qb = topic.questions(b);
        expect(qb.prompt).toBe(qa.prompt);
        expect(qb.answer).toBe(qa.answer);
        expect(qb.choices).toEqual(qa.choices);
      }
    }
  });

  it("character: answer is a known character word and all four appear over many seeds", () => {
    const NAMES = ["march-like", "playful", "songful", "solemn"];
    const seen = new Set();
    for (const q of sample("g4-aural-character", 200)) {
      expect(NAMES).toContain(q.answer);
      expect(q.choices).toHaveLength(4);
      expect(new Set(q.choices)).toEqual(new Set(NAMES));
      expect(typeof q.audio).toBe("function");
      seen.add(q.answer);
    }
    expect(seen).toEqual(new Set(NAMES));
  });

  it("structure: answer names a micro-form and AB / ABA / AABA all appear", () => {
    const FORMS = ["AB (binary)", "ABA (ternary)", "AABA (song form)"];
    const seen = new Set();
    for (const q of sample("g6-aural-structure", 200)) {
      expect(FORMS).toContain(q.answer);
      expect(q.choices).toHaveLength(3);
      seen.add(q.answer);
    }
    expect(seen).toEqual(new Set(FORMS));
  });

  it("describe-features: answer is a full three-feature description, distractors differ, both modes appear", () => {
    const shape = /^(Major|Minor) key, (slow|moderate|fast) tempo, \S.+$/;
    const modesSeen = new Set();
    for (const q of sample("g8-aural-features", 200)) {
      expect(q.answer).toMatch(shape);
      expect(q.choices).toHaveLength(4);
      expect(new Set(q.choices).size).toBe(4);
      for (const c of q.choices) expect(c).toMatch(shape);
      modesSeen.add(q.answer.split(" ")[0]);
    }
    expect(modesSeen).toEqual(new Set(["Major", "Minor"]));
  });
});

describe("aural style question (issue #7) - reframed to describe, never claims a period", () => {
  // The question, its choices and its answer must not label the passage with a
  // historical period: a few notes cannot identify one, and the old version
  // taught that false association. Era names may appear only in the caveated
  // explanation, never in what the learner is asked to decide.
  const PERIOD_WORDS = /baroque|classical|romantic|20th|twentieth|\bperiod\b/i;

  it("no period label leaks into the prompt, choices or answer", () => {
    const topic = topicById("g5-aural-style");
    const r = rng.create("style-honesty");
    for (let i = 0; i < 200; i++) {
      const q = topic.questions(r);
      expect(q.prompt).not.toMatch(PERIOD_WORDS);
      expect(q.answer).not.toMatch(PERIOD_WORDS);
      for (const c of q.choices) expect(c).not.toMatch(PERIOD_WORDS);
      // The task is to describe what is heard.
      expect(q.prompt.toLowerCase()).toContain("description");
      // The chosen description is genuinely one of the audible options.
      expect(q.choices).toContain(q.answer);
    }
  });

  it("plays a real, audibly distinct device for each description", () => {
    const topic = topicById("g5-aural-style");
    const r = rng.create("style-devices");
    const answers = new Set();
    for (let i = 0; i < 100; i++) {
      const q = topic.questions(r);
      expect(typeof q.audio).toBe("function");
      answers.add(q.answer);
    }
    expect(answers.size).toBe(4);
  });
});
