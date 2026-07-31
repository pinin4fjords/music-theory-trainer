import { describe, it, expect } from "vitest";

const { storage, srs } = globalThis.MTT;

function fakeStore() {
  const m = new Map();
  return {
    _m: m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

const legacyV1 = {
  boxes: { "g1-notes": 3, "g4-triads": 1 },
  lastSeen: { "g1-notes": 500 },
  streak: 5, bestStreak: 7, daysPracticed: 9, totalAnswered: 42,
  settings: { sound: false, grade: 2 },
};

describe("storage - legacy migration (no progress lost)", () => {
  it("preserves totals and settings", () => {
    const s = storage.migrate(legacyV1);
    expect(s.stateVersion).toBe(storage.CURRENT_VERSION);
    expect(s.streak).toBe(5);
    expect(s.bestStreak).toBe(7);
    expect(s.daysPracticed).toBe(9);
    expect(s.totalAnswered).toBe(42);
    expect(s.settings.grade).toBe(2);
    expect(s.settings.sound).toBe(false);
    expect(s.settings.mode).toBe("daily"); // new default added
  });

  it("archives topic cards and distributes their evidence conservatively", () => {
    const s = storage.migrate(legacyV1);
    expect(s.legacyTopicSrs["g1-notes"].box).toBe(3);
    expect(s.legacyTopicSrs["g1-notes"].lastSeen).toBe(500);
    expect(s.legacyTopicSrs["g1-notes"].dueAt).toBe(500 + srs.intervalMs(3));
    expect(s.srs["notation.note.read"].box).toBe(0);
    expect(s.srs["notation.note.construct"].box).toBe(0);
    expect(srs.evidence(s.srs["notation.note.read"])).toBe(0.5);
    expect(srs.isConfirmed(s.srs["notation.note.read"])).toBe(false);
    expect(s.srs["harmony.primary-triads.function"].box).toBe(1);
    expect(s.srs["harmony.primary-triads.function"].dueAt).toBe(null);
    expect(s.boxes).toBeUndefined(); // legacy shape gone
  });

  it("is idempotent on already-current state", () => {
    const once = storage.migrate(legacyV1);
    const twice = storage.migrate(once);
    expect(twice.stateVersion).toBe(storage.CURRENT_VERSION);
    expect(twice.srs["notation.note.read"].evidence).toBe(0.5);
    expect(twice.legacyTopicSrs["g1-notes"].box).toBe(3);
  });
});

describe("storage - load / save / corruption", () => {
  it("round-trips through a store", () => {
    const store = fakeStore();
    const s = storage.migrate(legacyV1);
    expect(storage.save(s, store)).toBe(true);
    const loaded = storage.load(store);
    expect(loaded.srs["notation.note.read"].evidence).toBe(0.5);
    expect(loaded.streak).toBe(5);
  });

  it("loads + migrates legacy raw data found under the key", () => {
    const store = fakeStore();
    store.setItem(storage.KEY, JSON.stringify(legacyV1));
    const loaded = storage.load(store);
    expect(loaded.stateVersion).toBe(storage.CURRENT_VERSION);
    expect(loaded.legacyTopicSrs["g1-notes"].box).toBe(3);
  });

  it("falls back to defaults on corrupt JSON", () => {
    const store = fakeStore();
    store.setItem(storage.KEY, "{not valid json");
    const loaded = storage.load(store);
    expect(loaded.stateVersion).toBe(storage.CURRENT_VERSION);
    expect(loaded.streak).toBe(0);
  });

  it("returns defaults when no storage is available", () => {
    const s = storage.load({ getItem: () => { throw new Error("nope"); } });
    expect(s.streak).toBe(0);
  });

  it("probe reports whether a store works", () => {
    expect(storage.probe(fakeStore())).toBe(true);
    expect(storage.probe({ setItem: () => { throw new Error("blocked"); } })).toBe(false);
  });
});

describe("storage - backup / restore", () => {
  it("exports and re-imports state", () => {
    const s = storage.migrate(legacyV1);
    const json = storage.exportJSON(s);
    const result = storage.importJSON(json);
    expect(result.ok).toBe(true);
    expect(result.state.srs["notation.note.read"].evidence).toBe(0.5);
    expect(result.state.legacyTopicSrs["g1-notes"].box).toBe(3);
  });

  it("imports + migrates a legacy backup file", () => {
    const result = storage.importJSON(JSON.stringify(legacyV1));
    expect(result.ok).toBe(true);
    expect(result.state.stateVersion).toBe(storage.CURRENT_VERSION);
  });

  it("adds empty per-lab notes to current state", () => {
    const migrated = storage.migrate({ stateVersion: 2, srs: {} });
    expect(migrated.labNotes).toEqual({});
  });

  it("rejects invalid JSON with a clear message", () => {
    const result = storage.importJSON("not json at all");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/JSON/);
  });

  it("rejects a JSON file that isn't saved progress", () => {
    const result = storage.importJSON(JSON.stringify({ hello: "world" }));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/saved progress/);
  });

  it("normalize repairs out-of-range settings", () => {
    const s = storage.normalize({ settings: { grade: 99, mode: "weird" } });
    expect(s.settings.grade).toBe(4);
    expect(s.settings.mode).toBe("daily");
  });
});
