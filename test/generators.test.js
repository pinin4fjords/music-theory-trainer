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
