import { describe, it, expect } from "vitest";

const { state } = globalThis.MTT;

function fakeStore() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

const DAY = 86400000;

describe("state - store", () => {
  it("records answers into SRS cards and totals, and persists", () => {
    const store = state.create({ storage: fakeStore(), now: () => 0 });
    store.recordAnswer("g1-notes", { correct: true, responseMs: 1200, now: 0 });
    expect(store.get().totalAnswered).toBe(1);
    expect(store.cardFor("g1-notes").box).toBe(1);
    expect(store.cardFor("g1-notes").avgMs).toBe(1200);
  });

  it("advances the streak across consecutive days only once per day", () => {
    const store = state.create({ storage: fakeStore() });
    expect(store.recordSessionDay(0)).toBe(true);
    expect(store.get().streak).toBe(1);
    expect(store.recordSessionDay(1000)).toBe(false); // same day
    expect(store.get().streak).toBe(1);
    expect(store.recordSessionDay(DAY)).toBe(true); // next day
    expect(store.get().streak).toBe(2);
    expect(store.recordSessionDay(DAY * 3)).toBe(true); // gap -> reset
    expect(store.get().streak).toBe(1);
    expect(store.get().bestStreak).toBe(2);
  });

  it("notifies subscribers on change", () => {
    const store = state.create({ storage: fakeStore(), now: () => 0 });
    let calls = 0;
    store.subscribe(() => calls++);
    store.recordAnswer("x", { correct: true, now: 0 });
    expect(calls).toBe(1);
  });

  it("restore replaces state and normalizes it", () => {
    const store = state.create({ storage: fakeStore() });
    store.restore({ streak: 9, settings: { grade: 3 }, srs: {} });
    expect(store.get().streak).toBe(9);
    expect(store.settings().grade).toBe(3);
    expect(store.get().stateVersion).toBeDefined();
  });

  it("persisted state survives a reload through the same store", () => {
    const shared = fakeStore();
    const a = state.create({ storage: shared, now: () => 0 });
    a.recordAnswer("g1-notes", { correct: true, now: 0 });
    a.recordSessionDay(0);
    const b = state.create({ storage: shared, now: () => 0 });
    expect(b.get().totalAnswered).toBe(1);
    expect(b.get().streak).toBe(1);
    expect(b.cardFor("g1-notes").box).toBe(1);
  });
});
