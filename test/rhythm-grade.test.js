import { describe, it, expect } from "vitest";

const { rhythmGrade } = globalThis.MTT;
const { detectOnsets, gradeClap, gradeTaps, scoreAccents, toIOIs } = rhythmGrade;

// Build a synthetic energy envelope: a flat noise floor with sharp triangular
// spikes at the given onset times (ms), spaced hopMs apart.
function envelopeWithOnsets(onsetMs, opts) {
  opts = opts || {};
  const hopMs = opts.hopMs || 16;
  const durationMs = opts.durationMs || (Math.max.apply(null, onsetMs) + 300);
  const noise = opts.noise != null ? opts.noise : 0.004;
  const peak = opts.peak != null ? opts.peak : 1.0;
  const spikeFrames = opts.spikeFrames != null ? opts.spikeFrames : 3;
  const n = Math.ceil(durationMs / hopMs);
  const frames = new Array(n).fill(noise);
  for (const t of onsetMs) {
    const c = Math.round(t / hopMs);
    for (let d = -spikeFrames; d <= spikeFrames; d++) {
      const i = c + d;
      if (i < 0 || i >= n) continue;
      const v = peak * (1 - Math.abs(d) / (spikeFrames + 1));
      if (v > frames[i]) frames[i] = v;
    }
  }
  return { frames, hopMs };
}

describe("toIOIs", () => {
  it("returns successive differences", () => {
    expect(toIOIs([0, 100, 250, 400])).toEqual([100, 150, 150]);
  });
  it("empty for fewer than two timestamps", () => {
    expect(toIOIs([5])).toEqual([]);
    expect(toIOIs([])).toEqual([]);
  });
});

describe("detectOnsets", () => {
  it("finds one onset per spike, near the true time", () => {
    const truth = [100, 500, 900, 1300];
    const { frames, hopMs } = envelopeWithOnsets(truth);
    const onsets = detectOnsets(frames, { hopMs });
    expect(onsets.length).toBe(truth.length);
    onsets.forEach((o, i) => expect(Math.abs(o - truth[i])).toBeLessThanOrEqual(hopMs * 2));
  });

  it("returns nothing for pure silence", () => {
    const frames = new Array(120).fill(0.003);
    expect(detectOnsets(frames, { hopMs: 16 })).toEqual([]);
  });

  it("empty input yields empty output", () => {
    expect(detectOnsets([], {})).toEqual([]);
  });

  it("refractory period suppresses a decay ripple", () => {
    // A single clap with a small secondary bump 30ms later (below refractory).
    const { frames, hopMs } = envelopeWithOnsets([200]);
    const rippleFrame = Math.round(230 / hopMs);
    frames[rippleFrame] = Math.max(frames[rippleFrame], 0.5);
    const onsets = detectOnsets(frames, { hopMs, refractoryMs: 90 });
    expect(onsets.length).toBe(1);
  });

  it("resolves well-separated claps even when close to the refractory gap", () => {
    const truth = [200, 400, 600];
    const { frames, hopMs } = envelopeWithOnsets(truth);
    const onsets = detectOnsets(frames, { hopMs, refractoryMs: 120 });
    expect(onsets.length).toBe(3);
  });
});

describe("gradeClap", () => {
  it("passes an exact rhythm reproduction", () => {
    const target = [500, 500, 500]; // four even claps
    const onsets = [0, 500, 1000, 1500];
    const r = gradeClap(target, onsets);
    expect(r.countOk).toBe(true);
    expect(r.score).toBe(1);
    expect(r.pass).toBe(true);
  });

  it("is tempo-independent: same rhythm clapped faster still passes", () => {
    const target = [500, 250, 250]; // long-short-short
    const onsets = [0, 400, 600, 800]; // same ratios, faster
    const r = gradeClap(target, onsets);
    expect(r.pass).toBe(true);
  });

  it("fails a wrong rhythm (even claps against long-short-short)", () => {
    const target = [500, 250, 250];
    const onsets = [0, 400, 800, 1200]; // all equal gaps
    const r = gradeClap(target, onsets);
    expect(r.pass).toBe(false);
    expect(r.score).toBeLessThan(0.75);
  });

  it("penalises an extra clap and never passes on wrong count", () => {
    const target = [500, 500, 500];
    const onsets = [0, 500, 1000, 1500, 2000]; // one clap too many
    const r = gradeClap(target, onsets);
    expect(r.countOk).toBe(false);
    expect(r.pass).toBe(false);
    expect(r.feedback).toMatch(/too many/i);
  });

  it("reports no claps detected", () => {
    const r = gradeClap([500, 500], []);
    expect(r.detectedOnsets).toBe(0);
    expect(r.feedback).toMatch(/no claps/i);
    expect(r.pass).toBe(false);
  });

  it("end-to-end: detect then grade a synthetic clap-back", () => {
    const target = [600, 300, 300]; // crotchet, two quavers (ms)
    const { frames, hopMs } = envelopeWithOnsets([120, 720, 1020, 1320]);
    const onsets = detectOnsets(frames, { hopMs });
    const r = gradeClap(target, onsets);
    expect(r.pass).toBe(true);
  });
});

describe("scoreAccents", () => {
  it("scores 1 when accents fall exactly on every downbeat", () => {
    // beatsPerBar 2, accent on taps 0,2,4,...
    const accents = [true, false, true, false, true, false];
    expect(scoreAccents(accents, 2)).toBe(1);
  });
  it("tolerates a phase offset (accent starting on the second tap)", () => {
    const accents = [false, true, false, true, false, true];
    expect(scoreAccents(accents, 2)).toBe(1);
  });
  it("returns 0 when nothing was accented", () => {
    expect(scoreAccents([false, false, false, false], 2)).toBe(0);
  });
  it("scores poorly for random accents", () => {
    const accents = [true, true, false, true, true, false];
    expect(scoreAccents(accents, 3)).toBeLessThan(1);
  });
});

describe("gradeTaps", () => {
  function evenTaps(period, count, accentEvery) {
    const taps = [];
    const accents = [];
    for (let i = 0; i < count; i++) {
      taps.push(i * period);
      accents.push(accentEvery ? i % accentEvery === 0 : false);
    }
    return { taps, accents };
  }

  it("passes a steady, on-tempo, correctly-accented pulse", () => {
    const { taps, accents } = evenTaps(600, 8, 2);
    const r = gradeTaps({ taps, accents, targetBeatMs: 600, beatsPerBar: 2 });
    expect(r.tempoStability).toBeGreaterThan(0.9);
    expect(r.tempoAccuracy).toBeGreaterThan(0.9);
    expect(r.accent).toBe(1);
    expect(r.pass).toBe(true);
    expect(Math.round(r.bpm)).toBe(100);
  });

  it("fails an erratic pulse on tempo stability", () => {
    const taps = [0, 600, 700, 1500, 1550, 2400];
    const r = gradeTaps({ taps, targetBeatMs: 600 });
    expect(r.tempoStability).toBeLessThan(0.5);
    expect(r.pass).toBe(false);
    expect(r.feedback).toMatch(/uneven/i);
  });

  it("marks tempo inaccurate when tapping a different speed", () => {
    const { taps } = evenTaps(300, 8); // twice as fast as target
    const r = gradeTaps({ taps, targetBeatMs: 600 });
    expect(r.tempoStability).toBeGreaterThan(0.9); // steady, just wrong speed
    expect(r.tempoAccuracy).toBe(0);
    expect(r.pass).toBe(false);
  });

  it("requires enough taps", () => {
    const r = gradeTaps({ taps: [0, 600] });
    expect(r.pass).toBe(false);
    expect(r.feedback).toMatch(/not enough/i);
  });

  it("grades stability alone when no target or accents are given", () => {
    const { taps } = evenTaps(500, 6);
    const r = gradeTaps({ taps });
    expect(r.tempoAccuracy).toBeNull();
    expect(r.accent).toBeNull();
    expect(r.pass).toBe(true);
  });

  it("fails when the strong beat is never accented but graded", () => {
    const { taps, accents } = evenTaps(600, 8, 0); // accentEvery 0 -> no accents
    const r = gradeTaps({ taps, accents, targetBeatMs: 600, beatsPerBar: 2 });
    expect(r.accent).toBe(0);
    expect(r.pass).toBe(false);
  });
});
