import { describe, it, expect, afterEach } from "vitest";

const { content, session, rng, srs } = globalThis.MTT;

afterEach(() => session.setWarn(() => {})); // reset the warn sink between tests

describe("session - grade filtering & foundational review", () => {
  it("gradeTopics includes the chosen grade and everything below it, never above", () => {
    const g3 = session.gradeTopics(content, 3);
    expect(g3.every((t) => t.grade <= 3)).toBe(true);
    expect(g3.some((t) => t.grade === 3)).toBe(true);
    expect(g3.some((t) => t.grade < 3)).toBe(true); // foundation review present
    expect(g3.some((t) => t.grade > 3)).toBe(false);
  });

  it("a Grade 1 session never draws on higher grades", () => {
    const s = session.build({
      content, settings: { grade: 1, mode: "daily" }, srsMap: {}, rng: rng.create(1), now: 0,
    });
    expect(s.length).toBeGreaterThan(0);
    expect(s.every((x) => x.topic.grade === 1)).toBe(true);
  });

  it("auralTopics surfaces every aural grade's quizable topics with a grade field", () => {
    const aural = session.auralTopics(content);
    expect(aural.length).toBeGreaterThan(0);
    expect(aural.every((t) => typeof t.questions === "function")).toBe(true);
    expect(aural.every((t) => Number.isInteger(t.grade))).toBe(true);
    const grades = new Set(aural.map((t) => t.grade));
    for (let g = 1; g <= 8; g++) expect(grades.has(g)).toBe(true);
  });
});

describe("session - assembly", () => {
  it("builds a full session of distinct questions", () => {
    const s = session.build({
      content, settings: { grade: 5, mode: "daily" }, srsMap: {}, rng: rng.create("sess"), now: 0,
    });
    expect(s.length).toBe(session.SESSION_LEN);
    const sigs = s.map((x) => session.qSig(x.q));
    expect(new Set(sigs).size).toBe(sigs.length); // all distinct
  });

  it("honors a custom session length", () => {
    const s = session.build({
      content, settings: { grade: 5, mode: "daily" }, srsMap: {}, rng: rng.create("sess-len"), now: 0, length: 20,
    });
    expect(s.length).toBe(20);
  });

  it("is deterministic for a fixed seed + state + now", () => {
    const opts = () => ({ content, settings: { grade: 4, mode: "daily" }, srsMap: {}, rng: rng.create("fixed"), now: 1000 });
    const a = session.build(opts()).map((x) => session.qSig(x.q));
    const b = session.build(opts()).map((x) => session.qSig(x.q));
    expect(a).toEqual(b);
  });

  it("learning-path mode leads with the current grade's topics", () => {
    const s = session.build({
      content, settings: { grade: 5, mode: "path" }, srsMap: {}, rng: rng.create("path"), now: 0,
    });
    expect(s[0].topic.grade).toBe(5);
  });

  it("a higher-grade session interleaves lower-grade diagnostic questions", () => {
    for (const mode of ["daily", "path"]) {
      const s = session.build({
        content, settings: { grade: 5, mode }, srsMap: {}, rng: rng.create("mix-" + mode), now: 0,
      });
      const lower = s.filter((x) => x.topic.grade < 5).length;
      const atGrade = s.filter((x) => x.topic.grade === 5).length;
      expect(lower).toBeGreaterThanOrEqual(2); // guaranteed diagnostic slice
      expect(atGrade).toBeGreaterThanOrEqual(1); // still mostly grade-level
      expect(s.length).toBe(session.SESSION_LEN);
    }
  });

  it("orders weak/overdue topics first (SRS priority)", () => {
    // Make one grade-1 topic look very weak and overdue.
    const all = session.gradeTopics(content, 2);
    const weakId = all[0].id;
    const srsMap = {};
    let card = srs.defaultCard();
    card = srs.update(card, { correct: false, now: 0 });
    card.dueAt = 0; // overdue at now=BIG
    srsMap[weakId] = card;
    // All other topics are unseen (priority 1e12) - so to test the weak one comes
    // before *seen-strong* ones, seed the rest as strong.
    all.slice(1).forEach((t) => {
      let c = srs.defaultCard();
      for (let i = 0; i < 5; i++) c = srs.update(c, { correct: true, now: i });
      srsMap[t.id] = c;
    });
    const ordered = session.orderPool(all, srsMap, 100 * srs.DAY, 2, "daily");
    expect(ordered[0].id).toBe(weakId);
  });
});

describe("session - resilience to invalid generators", () => {
  it("skips invalid questions, logs a structured warning, and never crashes", () => {
    const warnings = [];
    session.setWarn((info) => warnings.push(info));
    const badTopic = { id: "bad", grade: 1, title: "Bad", questions: () => ({ prompt: "x", choices: ["a", "a"], answer: "a" }) };
    const out = session.assemble([badTopic], 5, rng.create(1));
    expect(out).toEqual([]); // nothing valid to include
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0].topicId).toBe("bad");
  });

  it("a throwing generator is contained", () => {
    const warnings = [];
    session.setWarn((info) => warnings.push(info));
    const boom = { id: "boom", grade: 1, title: "Boom", questions: () => { throw new Error("kaboom"); } };
    const good = { id: "ok", grade: 1, title: "OK", questions: (r) => ({ prompt: "p" + r.int(0, 1e6), choices: ["a", "b"], answer: "a" }) };
    const out = session.assemble([boom, good], 3, rng.create(2));
    expect(out.length).toBe(3); // the good topic still fills the session
    expect(out.every((x) => x.topic.id === "ok")).toBe(true);
    expect(warnings.some((w) => w.topicId === "boom")).toBe(true);
  });

  it("returns an empty session for an empty pool", () => {
    expect(session.assemble([], 5, rng.create(1))).toEqual([]);
  });
});
