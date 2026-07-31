import { describe, it, expect } from "vitest";

const { labs, content } = globalThis.MTT;

describe("music lab models", () => {
  it("provides five shared lab definitions with complete evidence boundaries", () => {
    expect(labs.definitions).toHaveLength(5);
    labs.definitions.forEach((lab) => {
      expect(lab.controls.length).toBeGreaterThan(0);
      expect(lab.lenses.mechanism).toBeTruthy();
      expect(lab.lenses.history).toBeTruthy();
      expect(lab.lenses.practice).toBeTruthy();
      expect(lab.boundaries.measured).toBeTruthy();
      expect(lab.boundaries.inferred).toBeTruthy();
      expect(lab.boundaries.convention).toBeTruthy();
      expect(lab.sources.length).toBeGreaterThan(0);
    });
  });

  it("calculates ratios, cents and beat rates deterministically", () => {
    expect(labs.centsBetween(220, 440)).toBeCloseTo(1200, 10);
    expect(labs.centsBetween(440, 550)).toBeCloseTo(386.3137, 4);
    expect(labs.beatFrequency(440, 443)).toBe(3);

    const result = labs.byId("frequency-cents").calculate({ base: "220", ratio: "1.5" });
    expect(result.headline).toBe("220 Hz → 330 Hz");
    expect(result.values[1][1]).toBe("701.96 cents");
    expect(result.visual).toMatchObject({ kind: "pitch-ratio", lower: 220, upper: 330 });

    const beats = labs.byId("beating").calculate({ base: "440", offset: "3" });
    expect(beats.visual).toEqual({ kind: "beats", first: 440, second: 443, beats: 3 });
  });

  it("uses the ideal-string equation with SI units", () => {
    expect(labs.stringFrequency(0.5, 100, 0.01)).toBeCloseTo(100, 10);
    const result = labs.byId("string-pitch").calculate({ length: "50", tension: "100", density: "10" });
    expect(result.headline).toBe("Fundamental ≈ 100 Hz");
    expect(result.visual).toEqual({
      kind: "string",
      fraction: 0.5 / 1.2,
      label: "41.7 percent of the full string is vibrating.",
    });
  });

  it("describes an absent fundamental without adding it to the spectrum", () => {
    const result = labs.byId("harmonic-spectrum").calculate({ fundamental: "110", spectrum: "missing" });
    expect(result.audio.frequencies).toEqual([220, 330, 440, 550, 660]);
    expect(result.headline).toMatch(/absent but implied/);
    expect(result.text).toMatch(/110 hertz itself is missing/);
    expect(result.visual).toEqual({ kind: "spectrum", fundamental: 110, partialNumbers: [2, 3, 4, 5, 6] });
  });

  it("keeps metre groupings and playback values deterministic", () => {
    const result = labs.byId("metric-entrainment").calculate({ metre: "7/8", pulseMs: "300" });
    expect(result.headline).toBe("7/8: 2+2+3");
    expect(result.audio.kind).toBe("note-sequence");
    expect(result.audio.notes).toEqual(["A4", "A4", "A4", "A4", "A4", "A4", "A4"]);
    expect(result.audio.velocities).toEqual([1, 0.45, 1, 0.45, 1, 0.45, 0.45]);
    expect(result.values[2][1]).toBe("2.1 seconds");
    expect(result.visual).toEqual({ kind: "metre", metre: "7/8", groups: [2, 2, 3], pulseMs: 300 });
  });

  it("links curriculum topics to labs through their matching explainers", () => {
    const topics = content.grades.flatMap((grade) => grade.topics);
    const linked = topics.filter((topic) => topic.lab);
    expect(linked.length).toBeGreaterThanOrEqual(9);
    linked.forEach((topic) => {
      const lab = labs.byId(topic.lab);
      expect(lab).toBeTruthy();
      expect(topic.explainer).toBe(lab.explainer);
    });
  });
});
