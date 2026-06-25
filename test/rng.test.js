import { describe, it, expect } from "vitest";

const { rng } = globalThis.MTT;

describe("rng - deterministic PRNG", () => {
  it("is reproducible: same seed => same sequence", () => {
    const a = rng.create(12345);
    const b = rng.create(12345);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("string seeds are hashed deterministically and differ from one another", () => {
    const a = rng.create("interval-q");
    const b = rng.create("interval-q");
    expect(a.next()).toBe(b.next());
    expect(rng.fromString("interval-q")).not.toBe(rng.fromString("interval-r"));
  });

  it("next() stays in [0, 1)", () => {
    const r = rng.create(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("int(min,max) is inclusive and within range", () => {
    const r = rng.create(99);
    const seen = new Set();
    for (let i = 0; i < 2000; i++) {
      const v = r.int(1, 6);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      expect(Number.isInteger(v)).toBe(true);
      seen.add(v);
    }
    // Over 2000 dice rolls we should see every face.
    expect(seen.size).toBe(6);
  });

  it("pick chooses an element of the array", () => {
    const r = rng.create(3);
    const arr = ["a", "b", "c"];
    for (let i = 0; i < 50; i++) expect(arr).toContain(r.pick(arr));
  });

  it("shuffle is a permutation and does not mutate the input", () => {
    const r = rng.create(42);
    const arr = [1, 2, 3, 4, 5, 6, 7, 8];
    const copy = arr.slice();
    const out = r.shuffle(arr);
    expect(arr).toEqual(copy); // unchanged
    expect(out.slice().sort()).toEqual(copy.slice().sort()); // same multiset
  });

  it("pickWeighted favours higher weights", () => {
    const r = rng.create(5);
    const items = ["rare", "common"];
    let common = 0;
    for (let i = 0; i < 2000; i++) {
      if (r.pickWeighted(items, (x) => (x === "common" ? 9 : 1)) === "common") common++;
    }
    expect(common).toBeGreaterThan(1500); // ~90%
  });

  it("clone resumes the same stream", () => {
    const r = rng.create(123);
    r.next(); r.next();
    const c = r.clone();
    expect(c.next()).toBe(r.next());
  });
});
