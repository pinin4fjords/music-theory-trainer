import { describe, it, expect } from "vitest";

const { content, validate, rng, music, notation } = globalThis.MTT;

const allTopics = content.auralGrades.flatMap((ag) =>
  ag.topics.map((t) => ({ grade: ag.grade, gradeTitle: ag.title, topic: t })));

describe("aural content - every generator passes the Question schema", () => {
  for (const { topic } of allTopics) {
    it(`${topic.id}: 80 generated questions are valid`, () => {
      const r = rng.create("aural-" + topic.id);
      for (let i = 0; i < 80; i++) {
        const q = topic.questions(r);
        const res = validate.validateQuestion(q);
        expect(res.ok, `${topic.id} #${i}: ${res.errors.join("; ")}`).toBe(true);
      }
    });
  }
});

describe("Initial Grade registration", () => {
  const initial = content.auralGrades.find((ag) => ag.grade === 0);

  it("exists with the four Initial-Grade tests", () => {
    expect(initial).toBeTruthy();
    expect(initial.title).toBe("Initial Grade");
    expect(initial.topics.map((t) => t.id).sort()).toEqual([
      "g0-aural-clap", "g0-aural-feature", "g0-aural-pulse", "g0-aural-sing",
    ]);
  });

  it("pulse and clap tasks carry the right micTask shape", () => {
    const byId = (id) => initial.topics.find((t) => t.id === id);
    const pulse = byId("g0-aural-pulse").questions(rng.create("p"));
    expect(pulse.micTask.type).toBe("pulse");
    expect(pulse.micTask.beatMs).toBeGreaterThan(0);
    expect(pulse.micTask.totalBeats).toBeGreaterThan(0);
    expect(typeof pulse.micTask.playFn).toBe("function");

    const clap = byId("g0-aural-clap").questions(rng.create("c"));
    expect(clap.micTask.type).toBe("clap");
    expect(Array.isArray(clap.micTask.targetIOIs)).toBe(true);
    expect(clap.micTask.targetIOIs.length).toBeGreaterThan(0);
    expect(clap.micTask.autoPlayAndRespondMs).toBeGreaterThan(0);
    // The clap keeps its match-the-notation fallback choices.
    expect(clap.choices.length).toBeGreaterThanOrEqual(2);
    expect(clap.choices).toContain(clap.answer);
    // A top-level audio thunk lets the mic-unavailable fallback still hear it.
    expect(typeof clap.audio).toBe("function");
  });
});

describe("tap-the-pulse appears in Grade 1A", () => {
  const g1time = content.auralGrades
    .find((ag) => ag.grade === 1).topics.find((t) => t.id === "g1-aural-time");

  it("produces pulse-tap questions across a run of seeds", () => {
    let sawPulse = false;
    const r = rng.create("g1-time-mix");
    for (let i = 0; i < 60 && !sawPulse; i++) {
      if (g1time.questions(r).micTask && g1time.questions(r).micTask.type === "pulse") sawPulse = true;
    }
    // Regenerate deterministically to assert at least one pulse task is reachable.
    const r2 = rng.create("g1-time-mix-2");
    let pulses = 0;
    for (let i = 0; i < 200; i++) {
      const q = g1time.questions(r2);
      if (q.micTask && q.micTask.type === "pulse") pulses++;
    }
    expect(pulses).toBeGreaterThan(0);
  });
});

describe("Grade 4 clap-back gains onset grading with notation fallback", () => {
  const g4 = content.auralGrades
    .find((ag) => ag.grade === 4).topics.find((t) => t.id === "g4-aural-time");

  it("every question carries both a clap micTask and notation choices", () => {
    const r = rng.create("g4-clap");
    for (let i = 0; i < 60; i++) {
      const q = g4.questions(r);
      expect(q.micTask.type).toBe("clap");
      expect(q.micTask.targetIOIs.length).toBeGreaterThan(0);
      expect(q.choices).toContain(q.answer);
      expect(typeof q.audio).toBe("function");
    }
  });
});

describe("Grades 6-8 sight-singing matches the practical-test constraints", () => {
  for (const grade of [6, 7, 8]) {
    it(`Grade ${grade} reaches both modes and supplies equivalent treble and bass notation`, () => {
      const topic = content.auralGrades
        .find((ag) => ag.grade === grade).topics.find((t) => t.id === `g${grade}-aural-sight-sing`);
      const r = rng.create(`upper-sight-content-${grade}`);
      const modes = new Set();
      let sawFlatSpelling = false;
      let sawSharpSpelling = false;

      for (let i = 0; i < 500; i++) {
        const q = topic.questions(r);
        const task = q.micTask;
        const spec = task.notation;
        const mode = /\bminor\b/.test(q.prompt) ? "minor" : "major";
        modes.add(mode);

        expect(spec.clefs).toEqual(["treble", "bass"]);
        expect(Math.abs(spec.keySignature.count)).toBeLessThanOrEqual(grade === 6 ? 3 : 4);
        expect(spec.notes.map(music.spelledToMidi)).toEqual(task.targets.map((target) => target.midi));

        for (const clef of spec.clefs) {
          const html = notation.staffHTML({
            clef,
            keySignature: spec.keySignature,
            notes: spec.notes,
          });
          expect(html).toContain(`${clef.charAt(0).toUpperCase() + clef.slice(1)} clef`);
        }

        const names = task.targets.map((target) => target.name).join(" ");
        if (spec.keySignature.type === "flat" && spec.keySignature.count < 0) {
          expect(names).not.toContain("♯");
          sawFlatSpelling ||= names.includes("♭");
        }
        if (spec.keySignature.type === "sharp" && spec.keySignature.count > 0) {
          expect(names).not.toContain("♭");
          sawSharpSpelling ||= names.includes("♯");
        }
      }

      expect(modes).toEqual(new Set(["major", "minor"]));
      expect(sawFlatSpelling).toBe(true);
      expect(sawSharpSpelling).toBe(true);
    });
  }
});
