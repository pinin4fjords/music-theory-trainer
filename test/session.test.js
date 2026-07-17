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

  it("daily and learning-path modes assemble genuinely different sessions", () => {
    const opts = (mode) => ({
      content, settings: { grade: 5, mode }, srsMap: {}, rng: rng.create("mode-diff"), now: 0,
    });
    const daily = session.build(opts("daily"));
    const path = session.build(opts("path"));
    const sig = (s) => s.map((x) => session.qSig(x.q));
    expect(sig(daily)).not.toEqual(sig(path));
    // Path leads harder with the current grade, so it carries strictly more
    // current-grade questions than the daily mix from the same seed and state.
    const atGrade = (s) => s.filter((x) => x.topic.grade === 5).length;
    expect(atGrade(path)).toBeGreaterThan(atGrade(daily));
  });

  it("learning-path mode walks the current grade in curriculum order, daily by urgency", () => {
    // Two current-grade topics seen with differing strength: daily should lead
    // with the weaker one (SRS urgency), path should keep syllabus order.
    const current = session.gradeTopics(content, 5).filter((t) => t.grade === 5);
    expect(current.length).toBeGreaterThanOrEqual(2);
    const first = current[0].id, second = current[1].id;
    const now = 100 * srs.DAY;
    const srsMap = {};
    // The syllabus-later topic is the weaker/more-overdue one.
    srsMap[first] = Object.assign(srs.defaultCard(), { seen: 6, correct: 5, box: 4, dueAt: now });
    srsMap[second] = Object.assign(srs.defaultCard(), { seen: 6, correct: 1, box: 1, dueAt: now - 5 * srs.DAY });
    const dailyOrder = session.orderPool(current, srsMap, now, 5, "daily").map((t) => t.id);
    const pathOrder = session.progressionOrder(current, srsMap).map((t) => t.id);
    expect(dailyOrder.indexOf(second)).toBeLessThan(dailyOrder.indexOf(first)); // weaker first
    expect(pathOrder.indexOf(first)).toBeLessThan(pathOrder.indexOf(second)); // syllabus order
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

describe("session - domain tagging", () => {
  it("every quizable topic carries a known domain, defaulting to Theory", () => {
    const topics = session.quizableTopics(content);
    expect(topics.length).toBeGreaterThan(0);
    expect(topics.every((t) => session.DOMAINS.includes(t.domain))).toBe(true);
    const untagged = topics.find((t) => t.id === "g1-notes");
    expect(untagged.domain).toBe("Theory");
  });

  it("hand-tagged Physics/History topics keep their explicit domain", () => {
    const topics = session.quizableTopics(content);
    const byId = (id) => topics.find((t) => t.id === id);
    expect(byId("g3-quality").domain).toBe("Physics");
    expect(byId("g4-alto-clef").domain).toBe("History");
    expect(byId("g5-clefs").domain).toBe("History");
    expect(byId("g6-figured-bass").domain).toBe("History");
  });

  it("every aural topic defaults to the Aural domain", () => {
    const aural = session.auralTopics(content);
    expect(aural.length).toBeGreaterThan(0);
    expect(aural.every((t) => t.domain === "Aural")).toBe(true);
  });
});

describe("session - domain recipes", () => {
  it("honors a recipe's per-domain quotas when every domain has topics available", () => {
    const recipe = { Theory: 1, Aural: 1, Physics: 1, History: 1 };
    const s = session.build({
      content, settings: { grade: 8, mode: "daily" }, srsMap: {}, rng: rng.create("recipe"), now: 0,
      length: 4, recipe,
    });
    expect(s.length).toBe(4);
    const counts = {};
    s.forEach((x) => { counts[x.topic.domain] = (counts[x.topic.domain] || 0) + 1; });
    expect(counts.Theory).toBe(1);
    expect(counts.Aural).toBe(1);
    expect(counts.Physics).toBe(1);
    expect(counts.History).toBe(1);
  });

  it("backfills from the whole pool when a domain's quota can't be met", () => {
    // Grade 1 has no Physics/History-tagged topics at all (they start at G3+),
    // so those slots must be backfilled rather than left empty.
    const recipe = { Theory: 1, Physics: 5, History: 4 };
    const s = session.build({
      content, settings: { grade: 1, mode: "daily" }, srsMap: {}, rng: rng.create("thin"), now: 0,
      length: 10, recipe,
    });
    expect(s.length).toBe(10);
    expect(s.every((x) => x.topic.grade === 1)).toBe(true);
  });

  it("`recipe: true` uses DEFAULT_RECIPE", () => {
    const s = session.build({
      content, settings: { grade: 8, mode: "daily" }, srsMap: {}, rng: rng.create("default-recipe"), now: 0,
      recipe: true,
    });
    expect(s.length).toBe(session.SESSION_LEN);
  });

  it("is deterministic for a fixed seed + state + now", () => {
    const opts = () => ({
      content, settings: { grade: 6, mode: "daily" }, srsMap: {}, rng: rng.create("recipe-fixed"), now: 500,
      recipe: { Theory: 2, Aural: 2, Physics: 1, History: 1 },
    });
    const a = session.build(opts()).map((x) => session.qSig(x.q));
    const b = session.build(opts()).map((x) => session.qSig(x.q));
    expect(a).toEqual(b);
  });

  it("fills the Aural quota due-first, honouring the schedule over raw weakness", () => {
    // Every aural topic in the eligible range is seen and not yet due except one
    // deliberately-due topic, so due-ness (not box weakness) must pick it. The
    // due topic is made stronger by box than a not-due decoy, so plain priority
    // ordering (which would rank the weaker decoy first) can't produce it.
    const now = 20 * srs.DAY;
    const eligible = session.auralTopics(content).filter((t) => t.grade > 0 && t.grade <= 4);
    expect(eligible.length).toBeGreaterThanOrEqual(2);
    const srsMap = {};
    eligible.forEach((t) => {
      srsMap[t.id] = Object.assign(srs.defaultCard(), { seen: 5, correct: 4, box: 3, dueAt: now + 3 * srs.DAY });
    });
    const g4 = eligible.filter((t) => t.grade === 4);
    expect(g4.length).toBeGreaterThanOrEqual(2);
    const decoyNotDue = g4[0].id, dueTopic = g4[1].id;
    srsMap[decoyNotDue] = Object.assign(srs.defaultCard(), { seen: 6, correct: 1, box: 1, dueAt: now + srs.DAY });
    srsMap[dueTopic] = Object.assign(srs.defaultCard(), { seen: 8, correct: 7, box: 4, dueAt: now - srs.DAY });
    const s = session.build({
      content, settings: { grade: 4, mode: "daily" }, srsMap, rng: rng.create("aural-due"), now,
      length: 1, recipe: { Aural: 1 },
    });
    expect(s.length).toBe(1);
    expect(s[0].topic.domain).toBe("Aural");
    expect(s[0].topic.id).toBe(dueTopic);
  });
});

describe("session - cognitive-load balancing", () => {
  it("isHighEffort is true only at/above the threshold", () => {
    const topic = { id: "t" };
    expect(session.isHighEffort(topic, { t: { avgMs: session.HIGH_EFFORT_MS } })).toBe(true);
    expect(session.isHighEffort(topic, { t: { avgMs: session.HIGH_EFFORT_MS - 1 } })).toBe(false);
    expect(session.isHighEffort(topic, { t: { avgMs: null } })).toBe(false);
    expect(session.isHighEffort(topic, {})).toBe(false);
  });

  it("separates two high-effort picks by swapping in the nearest low-effort one", () => {
    const mk = (id) => ({ topic: { id }, q: { prompt: id, choices: ["a", "b"], answer: "a" } });
    const picks = [mk("a"), mk("b"), mk("c"), mk("d")];
    const srsMap = {
      a: { avgMs: 30000 }, b: { avgMs: 25000 }, c: { avgMs: 2000 }, d: { avgMs: 1000 },
    };
    const out = session.loadBalance(picks, srsMap);
    expect(out.map((x) => x.topic.id)).toEqual(["a", "c", "b", "d"]);
  });

  it("leaves order untouched when no two high-effort picks are adjacent", () => {
    const mk = (id) => ({ topic: { id }, q: {} });
    const picks = [mk("a"), mk("b"), mk("c")];
    const srsMap = { a: { avgMs: 30000 }, b: { avgMs: 1000 }, c: { avgMs: 30000 } };
    const out = session.loadBalance(picks, srsMap);
    expect(out.map((x) => x.topic.id)).toEqual(["a", "b", "c"]);
  });

  it("build() separates two naturally-adjacent high-effort topics via load balancing", () => {
    // With no other SRS signal, unseen topics tie on priority and the pool
    // keeps its declared order, so a Theory-only recipe of 4 draws the first
    // four Grade 1 theory topics in order: g1-notes, g1-rhythm, g1-keys, g1-time.
    // Marking the first two high-effort puts them adjacent before balancing.
    const srsMap = {
      "g1-notes": { avgMs: 30000 },
      "g1-rhythm": { avgMs: 25000 },
      "g1-keys": { avgMs: 1000 },
    };
    const s = session.build({
      content, settings: { grade: 1, mode: "daily" }, srsMap, rng: rng.create("load-domain"), now: 0,
      length: 4, recipe: { Theory: 4 },
    });
    const ids = s.map((x) => x.topic.id);
    expect(Math.abs(ids.indexOf("g1-notes") - ids.indexOf("g1-rhythm"))).toBeGreaterThan(1);
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
