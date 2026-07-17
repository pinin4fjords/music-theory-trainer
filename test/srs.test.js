import { describe, it, expect } from "vitest";

const { srs } = globalThis.MTT;
const DAY = srs.DAY;

describe("srs - Leitner promotion/demotion", () => {
  it("a correct answer promotes one box and schedules further out", () => {
    const c0 = srs.defaultCard();
    const c1 = srs.update(c0, { correct: true, now: 0 });
    expect(c1.box).toBe(1);
    expect(c1.seen).toBe(1);
    expect(c1.correct).toBe(1);
    expect(c1.streak).toBe(1);
    expect(c1.dueAt).toBe(srs.intervalMs(1));
  });

  it("promotion caps at MAX_BOX", () => {
    let c = srs.defaultCard();
    for (let i = 0; i < 10; i++) c = srs.update(c, { correct: true, now: i });
    expect(c.box).toBe(srs.MAX_BOX);
  });

  it("a miss demotes and resets the streak", () => {
    let c = srs.defaultCard();
    c = srs.update(c, { correct: true, now: 0 });
    c = srs.update(c, { correct: true, now: 1 }); // box 2
    expect(c.box).toBe(2);
    c = srs.update(c, { correct: false, now: 2 });
    expect(c.box).toBe(1);
    expect(c.streak).toBe(0);
    expect(c.lapses).toBe(1);
  });

  it("a miss from a low box drops straight to 0 (re-enters rotation now)", () => {
    let c = srs.update(srs.defaultCard(), { correct: true, now: 0 }); // box 1
    c = srs.update(c, { correct: false, now: 1 });
    expect(c.box).toBe(0);
    expect(c.dueAt).toBe(1 + srs.intervalMs(0)); // due immediately
  });

  it("update does not mutate the input card", () => {
    const c0 = srs.defaultCard();
    const snapshot = JSON.stringify(c0);
    srs.update(c0, { correct: true, now: 0 });
    expect(JSON.stringify(c0)).toBe(snapshot);
  });
});

describe("srs - guess guard on brand-new cards (issue #50)", () => {
  it("a sub-second correct on a new card does not graduate it on its own", () => {
    const c = srs.update(srs.defaultCard(), { correct: true, responseMs: 300, now: 0 });
    expect(c.box).toBe(0); // held: too fast to trust as knowledge
    expect(c.correct).toBe(1); // still recorded as a correct
    expect(c.streak).toBe(1);
  });

  it("two consecutive corrects leave box 0 even when both are fast", () => {
    let c = srs.update(srs.defaultCard(), { correct: true, responseMs: 300, now: 0 });
    c = srs.update(c, { correct: true, responseMs: 300, now: 1 });
    expect(c.box).toBe(1);
    expect(c.streak).toBe(2);
  });

  it("a correct on a two-choice question needs confirming before it promotes", () => {
    let c = srs.update(srs.defaultCard(), { correct: true, choices: 2, now: 0 });
    expect(c.box).toBe(0); // a coin-flip could have landed it
    c = srs.update(c, { correct: true, choices: 2, now: 1 });
    expect(c.box).toBe(1);
  });

  it("a correct on a many-choice question promotes on the first try", () => {
    const c = srs.update(srs.defaultCard(), { correct: true, choices: 5, now: 0 });
    expect(c.box).toBe(1);
  });

  it("a plain correct with no guess signals still promotes immediately", () => {
    const c = srs.update(srs.defaultCard(), { correct: true, now: 0 });
    expect(c.box).toBe(1);
  });

  it("the guard only applies at box 0 - a fast correct higher up promotes", () => {
    let c = srs.update(srs.defaultCard(), { correct: true, now: 0 }); // box 1
    c = srs.update(c, { correct: true, responseMs: 200, choices: 2, now: 1 });
    expect(c.box).toBe(2);
  });
});

describe("srs - graded quality (issue #47)", () => {
  it("a near-perfect take promotes like a clean correct", () => {
    const c = srs.update(srs.defaultCard(), { quality: 0.8, now: 0 });
    expect(c.box).toBe(1);
    expect(c.correct).toBe(1);
    expect(c.streak).toBe(1);
  });

  it("a near miss holds the box without counting as a lapse", () => {
    let c = srs.defaultCard();
    for (let i = 0; i < 2; i++) c = srs.update(c, { correct: true, now: i }); // box 2
    const held = srs.update(c, { quality: 0.6, now: 3 });
    expect(held.box).toBe(2); // unchanged
    expect(held.lapses).toBe(0);
    expect(held.correct).toBe(c.correct); // not credited as a clean success
    expect(held.streak).toBe(0);
  });

  it("a poor take demotes like an outright miss", () => {
    let c = srs.defaultCard();
    for (let i = 0; i < 2; i++) c = srs.update(c, { correct: true, now: i }); // box 2
    const missed = srs.update(c, { quality: 0.2, now: 3 });
    expect(missed.box).toBe(1);
    expect(missed.lapses).toBe(1);
    expect(missed.streak).toBe(0);
  });

  it("a graded 4-of-5 take records differently from an empty take", () => {
    const good = srs.update(srs.defaultCard(), { quality: 0.8, responseMs: 4000, now: 0 });
    const empty = srs.update(srs.defaultCard(), { quality: 0, responseMs: 4000, now: 0 });
    expect(good.box).toBeGreaterThan(empty.box);
    expect(good.correct).toBe(1);
    expect(empty.correct).toBe(0);
    expect(empty.lapses).toBe(1);
  });
});

describe("srs - due logic", () => {
  it("an unscheduled card is always due", () => {
    expect(srs.isDue(srs.defaultCard(), 0)).toBe(true);
    expect(srs.isDue(null, 12345)).toBe(true);
  });

  it("a scheduled card is due only once its interval has elapsed", () => {
    const c = srs.update(srs.defaultCard(), { correct: true, now: 1000 }); // box 1, +1 day
    expect(srs.isDue(c, 1000 + DAY - 1)).toBe(false);
    expect(srs.isDue(c, 1000 + DAY)).toBe(true);
  });

  it("response time is tracked as a rolling average and clamped", () => {
    let c = srs.update(srs.defaultCard(), { correct: true, responseMs: 2000, now: 0 });
    expect(c.avgMs).toBe(2000);
    c = srs.update(c, { correct: true, responseMs: 4000, now: 1 });
    expect(c.avgMs).toBeGreaterThan(2000);
    expect(c.avgMs).toBeLessThan(4000);
    const walked = srs.update(srs.defaultCard(), { correct: true, responseMs: 10 * 60 * 1000, now: 0 });
    expect(walked.avgMs).toBeLessThanOrEqual(60000);
  });
});

describe("srs - priority & weakness ordering", () => {
  it("unseen topics outrank seen ones", () => {
    const unseen = srs.priority(srs.defaultCard(), 1e6);
    const seen = srs.priority(srs.update(srs.defaultCard(), { correct: true, now: 0 }), 1e6);
    expect(unseen).toBeGreaterThan(seen);
  });

  it("a lower box (weaker) outranks a higher box when both are seen", () => {
    const now = 100 * DAY;
    let weak = srs.update(srs.defaultCard(), { correct: true, now: 0 });
    weak = srs.update(weak, { correct: false, now: 1 }); // box 0
    let strong = srs.defaultCard();
    for (let i = 0; i < 4; i++) strong = srs.update(strong, { correct: true, now: i }); // box 4
    expect(srs.priority(weak, now)).toBeGreaterThan(srs.priority(strong, now));
  });

  it("weakness is higher for low accuracy / low box", () => {
    let good = srs.defaultCard();
    for (let i = 0; i < 4; i++) good = srs.update(good, { correct: true, now: i });
    let bad = srs.defaultCard();
    for (let i = 0; i < 4; i++) bad = srs.update(bad, { correct: i % 2 === 0, now: i });
    expect(srs.weakness(bad)).toBeGreaterThan(srs.weakness(good));
  });
});
