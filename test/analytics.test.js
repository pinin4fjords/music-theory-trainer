import { describe, it, expect } from "vitest";

const { analytics, session, content, srs } = globalThis.MTT;

const topics = session.quizableTopics(content);

function masteredCard() {
  let c = srs.defaultCard();
  for (let i = 0; i < 6; i++) c = srs.update(c, { correct: true, now: i });
  return c; // box 5, 100% accuracy
}
function shakyCard() {
  let c = srs.defaultCard();
  for (let i = 0; i < 6; i++) c = srs.update(c, { correct: i % 2 === 0, now: i });
  return c;
}

// Build an SRS map that masters every topic up to and including `upto`.
function masterUpTo(upto) {
  const map = {};
  topics.forEach((t) => { if (t.grade <= upto) map[t.id] = masteredCard(); });
  return map;
}

describe("analytics - estimated level", () => {
  it("reports 'New' with no data", () => {
    const est = analytics.estimatedLevel({}, topics);
    expect(est.level).toBeNull();
    expect(est.label).toBe("New");
  });

  it("estimates the highest fully-demonstrated grade", () => {
    const est = analytics.estimatedLevel(masterUpTo(3), topics);
    expect(est.level).toBe(3);
    expect(est.label).toBe("Grade 3");
  });

  it("notes the grade currently being worked on", () => {
    const map = masterUpTo(2);
    // Start (shakily) on grade 3 without mastering it.
    topics.filter((t) => t.grade === 3).slice(0, 1).forEach((t) => { map[t.id] = shakyCard(); });
    const est = analytics.estimatedLevel(map, topics);
    expect(est.level).toBe(2);
    expect(est.detail).toMatch(/working on Grade 3/);
  });

  it("does not promote past a grade that isn't really mastered", () => {
    // Master grade 1, but only shakily touch grade 2.
    const map = masterUpTo(1);
    topics.filter((t) => t.grade === 2).forEach((t) => { map[t.id] = shakyCard(); });
    const est = analytics.estimatedLevel(map, topics);
    expect(est.level).toBe(1);
  });

  it("a little weak practice reads as 'Starting out', not a grade", () => {
    const map = {};
    topics.filter((t) => t.grade === 1).slice(0, 1).forEach((t) => { map[t.id] = shakyCard(); });
    const est = analytics.estimatedLevel(map, topics);
    expect(est.level).toBe(0);
    expect(est.label).toBe("Starting out");
  });
});

describe("analytics - grade coverage threshold (issue #54)", () => {
  // Five synthetic topics in one grade so coverage fractions land on clean
  // percentages (60% vs 80%), independent of how many real topics a grade has.
  function fiveTopics(grade) {
    return ["a", "b", "c", "d", "e"].map((id) => ({ id: `t-${id}`, title: id, grade }));
  }

  it("does not certify a grade at 60% coverage even with perfect mastery on what was seen", () => {
    const grade1 = fiveTopics(1);
    const map = {};
    grade1.slice(0, 3).forEach((t) => { map[t.id] = masteredCard(); }); // 3/5 = 60%
    const est = analytics.estimatedLevel(map, grade1);
    expect(est.level).toBe(0);
  });

  it("certifies a grade at 80% coverage with strong mastery", () => {
    const grade1 = fiveTopics(1);
    const map = {};
    grade1.slice(0, 4).forEach((t) => { map[t.id] = masteredCard(); }); // 4/5 = 80%
    const est = analytics.estimatedLevel(map, grade1);
    expect(est.level).toBe(1);
  });
});
