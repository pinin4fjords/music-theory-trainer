import { describe, it, expect } from "vitest";

const { diagnose } = globalThis.MTT;

describe("diagnose - diagnostic feedback", () => {
  it("explains a same-number, wrong-quality interval mistake", () => {
    const q = { answer: "major 6th", meta: { type: "interval", number: 6, quality: "major" } };
    const fb = diagnose.feedback(q, "minor 6th");
    expect(fb).toMatch(/quality/i);
    expect(fb).toMatch(/major 6th/);
  });

  it("explains a wrong-number, right-quality interval mistake", () => {
    const q = { answer: "major 6th", meta: { type: "interval", number: 6, quality: "major" } };
    const fb = diagnose.feedback(q, "major 3rd");
    expect(fb).toMatch(/number|size/i);
  });

  it("explains a key-signature sharp/flat direction confusion", () => {
    const q = { answer: "2 sharps", meta: { type: "keysig" } };
    const fb = diagnose.feedback(q, "2 flats");
    expect(fb).toMatch(/direction|circle of fifths/i);
  });

  it("gives inversion guidance for the bass note", () => {
    const q = { answer: "first inversion", meta: { type: "inversion" } };
    expect(diagnose.feedback(q, "root position")).toMatch(/bass/i);
  });

  it("returns null when nothing specific can be inferred", () => {
    expect(diagnose.feedback({ answer: "x" }, "y")).toBeNull();
    expect(diagnose.feedback({ answer: "x", meta: { type: "interval", number: 6, quality: "major" } }, "x")).toBeNull();
  });

  it("parses interval names including octave/unison", () => {
    expect(diagnose.parseIntervalName("octave")).toEqual({ quality: "perfect", number: 8 });
    expect(diagnose.parseIntervalName("minor 6th")).toEqual({ quality: "minor", number: 6 });
  });
});
