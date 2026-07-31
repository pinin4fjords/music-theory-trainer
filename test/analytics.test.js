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

// Build an SRS map that masters every objective up to and including `upto`.
function masterUpTo(upto) {
  const map = {};
  analytics.objectiveUnits(topics).forEach((objective) => {
    if (objective.grade <= upto) map[objective.id] = masteredCard();
  });
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
    const topic = topics.find((candidate) => candidate.grade === 3);
    topic.objectives.forEach((objective) => { map[objective.id] = shakyCard(); });
    const est = analytics.estimatedLevel(map, topics);
    expect(est.level).toBe(2);
    expect(est.detail).toMatch(/working on Grade 3/);
  });

  it("does not promote past a grade that isn't really mastered", () => {
    // Master grade 1, but only shakily touch grade 2.
    const map = masterUpTo(1);
    analytics.objectiveUnits(topics).filter((objective) => objective.grade === 2)
      .forEach((objective) => { map[objective.id] = shakyCard(); });
    const est = analytics.estimatedLevel(map, topics);
    expect(est.level).toBe(1);
  });

  it("a little weak practice reads as 'Starting out', not a grade", () => {
    const map = {};
    const topic = topics.find((candidate) => candidate.grade === 1);
    topic.objectives.forEach((objective) => { map[objective.id] = shakyCard(); });
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

  it("does not count an objective as covered after one observation", () => {
    const grade1 = fiveTopics(1);
    const map = {};
    grade1.forEach((t) => { map[t.id] = srs.update(srs.defaultCard(), { correct: true, now: 0 }); });
    const mastery = analytics.gradeMastery(map, grade1)[1];
    expect(mastery.attempted).toBe(5);
    expect(mastery.seen).toBe(0);
    expect(analytics.estimatedLevel(map, grade1).level).toBe(0);
  });
});

describe("analytics - objective-level weak areas", () => {
  it("surfaces a weak subskill without labelling its whole topic weak", () => {
    const topic = topics.find((candidate) => candidate.id === "g5-chords");
    const weakId = "harmony.cadence.choose-chords";
    const map = {};
    topic.objectives.forEach((objective) => { map[objective.id] = masteredCard(); });
    map[weakId] = srs.update(srs.defaultCard(), { correct: false, now: 0 });

    const weak = analytics.weakAreas(map, [topic], 5);
    expect(weak.map((objective) => objective.id)).toEqual([weakId]);
    expect(weak[0].topicId).toBe("g5-chords");
    expect(weak[0].title).toMatch(/cadence points/i);
  });
});

describe("analytics - confidence-weighted accuracy", () => {
  it("gives self-reported answers less weight in aggregate accuracy", () => {
    const measuredMiss = srs.update(srs.defaultCard(), { correct: false, now: 0 });
    const selfReportedSuccess = srs.update(srs.defaultCard(), {
      correct: true, confidence: 0.5, now: 1,
    });
    const map = { measured: measuredMiss, reported: selfReportedSuccess };

    expect(analytics.overall(map).accuracy).toBeCloseTo(1 / 3);
    expect(analytics.byGrade(map, [
      { id: "measured", title: "Measured", grade: 1 },
      { id: "reported", title: "Reported", grade: 1 },
    ])[1].accuracy).toBeCloseTo(1 / 3);
  });
});
