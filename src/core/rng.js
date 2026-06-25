/* core/rng.js - deterministic, seedable pseudo-random number generator.
 *
 * Question generation, card ordering and any other "random" choice in the app
 * thread through an instance of this RNG. Production seeds from the clock, so
 * sessions vary; tests pass a fixed seed, so a generator's output is exactly
 * reproducible and can be asserted on.
 *
 * The algorithm is Mulberry32: a tiny, fast, well-distributed 32-bit generator.
 * It is NOT cryptographically secure - it doesn't need to be.
 *
 * Public surface: global `MTT.rng`.
 *   MTT.rng.create(seed?)  -> an Rng instance
 *   MTT.rng.fromString(s)  -> a 32-bit seed hashed from a string
 *   MTT.rng.default        -> a shared instance seeded once at load
 *
 * An Rng instance exposes: next(), int(min,max), float(min,max), pick(array),
 * pickWeighted(items, weightFn), shuffle(array), bool(p), seed (read-only),
 * and clone().
 */
(function (global) {
  "use strict";

  // Hash an arbitrary string to a 32-bit unsigned integer (xfnv1a), so seeds can
  // be human-readable ("interval-q-1") yet deterministic.
  function fromString(str) {
    let h = 2166136261 >>> 0;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function normalizeSeed(seed) {
    if (seed === undefined || seed === null) {
      // Time-based default. Bitwise OR coerces to 32-bit int.
      return (Date.now() ^ (Math.floor(Math.random() * 0xffffffff))) >>> 0;
    }
    if (typeof seed === "number" && Number.isFinite(seed)) return seed >>> 0;
    return fromString(seed);
  }

  function Rng(seed) {
    this.seed = normalizeSeed(seed);
    this._state = this.seed;
  }

  // Mulberry32 core: advance state, return a float in [0, 1).
  Rng.prototype.next = function () {
    this._state = (this._state + 0x6d2b79f5) >>> 0;
    let t = this._state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // Float in [min, max).
  Rng.prototype.float = function (min, max) {
    return min + this.next() * (max - min);
  };

  // Integer in [min, max] inclusive.
  Rng.prototype.int = function (min, max) {
    if (max === undefined) {
      max = min;
      min = 0;
    }
    return Math.floor(this.next() * (max - min + 1)) + min;
  };

  // true with probability p (default 0.5).
  Rng.prototype.bool = function (p = 0.5) {
    return this.next() < p;
  };

  // Uniformly choose one element of a non-empty array.
  Rng.prototype.pick = function (arr) {
    if (!arr || !arr.length) throw new Error("rng.pick: empty array");
    return arr[this.int(0, arr.length - 1)];
  };

  // Choose one element with probability proportional to weightFn(item). Falls
  // back to a uniform pick when all weights are zero or invalid.
  Rng.prototype.pickWeighted = function (items, weightFn) {
    if (!items || !items.length) throw new Error("rng.pickWeighted: empty array");
    const weights = items.map((it) => {
      const w = weightFn(it);
      return Number.isFinite(w) && w > 0 ? w : 0;
    });
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return this.pick(items);
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r < 0) return items[i];
    }
    return items[items.length - 1];
  };

  // Return a shuffled copy (Fisher-Yates); does not mutate the input.
  Rng.prototype.shuffle = function (arr) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  };

  // A new generator at the same point in the stream (for parallel sub-streams).
  Rng.prototype.clone = function () {
    const r = new Rng(this.seed);
    r._state = this._state;
    return r;
  };

  function create(seed) {
    return new Rng(seed);
  }

  const api = { create, fromString, Rng, default: create() };

  global.MTT = global.MTT || {};
  global.MTT.rng = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
