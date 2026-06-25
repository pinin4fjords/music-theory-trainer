import { describe, it, expect } from "vitest";

const { persist } = globalThis.MTT;

function fakeIdb() {
  const m = new Map();
  return {
    _m: m,
    available: () => true,
    get: (k) => Promise.resolve(m.has(k) ? m.get(k) : null),
    set: (k, v) => { m.set(k, v); return Promise.resolve(true); },
    del: (k) => { m.delete(k); return Promise.resolve(true); },
  };
}

function fakeFile() {
  let content = null, linked = false, perm = "granted", name = null;
  return {
    supported: () => true,
    setPerm: (p) => { perm = p; },
    getHandle: () => Promise.resolve(linked ? { name } : null),
    link: async (text) => { linked = true; name = "progress.json"; content = text; return { name }; },
    unlink: async () => { linked = false; content = null; name = null; },
    read: async (request) => {
      if (!linked) return { state: null, linked: false };
      if (perm !== "granted" && !request) return { state: null, linked: true, name, needsPermission: true };
      if (request) perm = "granted";
      return { state: content ? JSON.parse(content) : null, linked: true, name };
    },
    write: async (text) => { if (!linked) return false; content = text; return true; },
  };
}

function make(over) {
  return persist.create(Object.assign({ now: () => 100, persistFn: async () => true }, over));
}

describe("persist - newest-wins reconciliation", () => {
  it("pickNewest chooses the highest savedAt", () => {
    expect(persist.pickNewest([{ savedAt: 1 }, { savedAt: 9 }, { savedAt: 3 }])).toEqual({ savedAt: 9 });
    expect(persist.pickNewest([null, undefined])).toBeNull();
    expect(persist.pickNewest([{ x: 1 }, { savedAt: 2 }])).toEqual({ savedAt: 2 });
  });

  it("returns a newer IndexedDB copy over a stale local one", async () => {
    const idb = fakeIdb();
    await idb.set("state", { savedAt: 9, who: "idb" });
    const p = make({ idb, file: fakeFile() });
    const best = await p.readBest({ savedAt: 1, who: "local" });
    expect(best).toEqual({ savedAt: 9, who: "idb" });
  });

  it("returns null when the local copy is the newest", async () => {
    const idb = fakeIdb();
    await idb.set("state", { savedAt: 2 });
    const p = make({ idb, file: fakeFile() });
    expect(await p.readBest({ savedAt: 5 })).toBeNull();
  });

  it("prefers the linked file when it is newest", async () => {
    const idb = fakeIdb();
    const file = fakeFile();
    await file.link(JSON.stringify({ savedAt: 20, who: "file" }));
    const p = make({ idb, file });
    const best = await p.readBest({ savedAt: 5 });
    expect(best).toEqual({ savedAt: 20, who: "file" });
  });
});

describe("persist - mirroring & linking", () => {
  it("mirror writes through to IndexedDB and the linked file", async () => {
    const idb = fakeIdb();
    const file = fakeFile();
    await file.link("{}");
    const p = make({ idb, file });
    await p.mirror({ savedAt: 100, n: 7 });
    expect(await idb.get("state")).toEqual({ savedAt: 100, n: 7 });
    const fromFile = await file.read(false);
    expect(fromFile.state.n).toBe(7);
  });

  it("init reports capabilities and link state", async () => {
    const file = fakeFile();
    const p = make({ idb: fakeIdb(), file });
    let status = await p.init();
    expect(status.persisted).toBe(true);
    expect(status.fileSupported).toBe(true);
    expect(status.fileLinked).toBe(false);
    await p.linkFile({ savedAt: 100 });
    status = await p.init();
    expect(status.fileLinked).toBe(true);
    expect(status.fileName).toBe("progress.json");
  });

  it("reconnectFile re-grants permission and reads", async () => {
    const file = fakeFile();
    await file.link(JSON.stringify({ savedAt: 30 }));
    file.setPerm("prompt");
    const p = make({ idb: fakeIdb(), file });
    const status = await p.init();
    expect(status.needsPermission).toBe(true);
    const r = await p.reconnectFile();
    expect(r.state).toEqual({ savedAt: 30 });
  });

  it("degrades to no-ops when no backends are available", async () => {
    const none = { available: () => false, get: async () => null, set: async () => false, del: async () => false };
    const noFile = { supported: () => false, read: async () => ({ state: null, linked: false }), write: async () => false, link: async () => ({}), unlink: async () => {}, getHandle: async () => null };
    const p = make({ idb: none, file: noFile });
    await expect(p.mirror({ savedAt: 1 })).resolves.toBeUndefined();
    expect(await p.readBest({ savedAt: 1 })).toBeNull();
  });
});
