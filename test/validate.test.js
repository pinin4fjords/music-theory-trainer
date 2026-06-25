import { describe, it, expect } from "vitest";

const { validate, content } = globalThis.MTT;

const good = () => ({
  prompt: "What is 2 + 2?",
  choices: ["3", "4", "5"],
  answer: "4",
  explanation: "Basic arithmetic.",
});

describe("validate - question schema", () => {
  it("accepts a well-formed question", () => {
    expect(validate.validateQuestion(good()).ok).toBe(true);
  });

  it("rejects an answer not among the choices", () => {
    const q = good();
    q.answer = "9";
    const r = validate.validateQuestion(q);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/not among choices/);
  });

  it("rejects duplicate choices", () => {
    const q = good();
    q.choices = ["4", "4", "5"];
    expect(validate.validateQuestion(q).ok).toBe(false);
  });

  it("rejects empty / missing fields", () => {
    expect(validate.validateQuestion({}).ok).toBe(false);
    expect(validate.validateQuestion({ prompt: "", choices: ["a", "b"], answer: "a" }).ok).toBe(false);
    expect(validate.validateQuestion({ prompt: "x", choices: ["a"], answer: "a" }).ok).toBe(false);
  });

  it("rejects a non-function audio or non-string explanation", () => {
    expect(validate.validateQuestion(Object.assign(good(), { audio: 5 })).ok).toBe(false);
    expect(validate.validateQuestion(Object.assign(good(), { explanation: 5 })).ok).toBe(false);
  });

  it("warns when a notation prompt lacks a text alternative", () => {
    const q = Object.assign(good(), { prompt: 'see this <svg class="staff"></svg>' });
    const r = validate.validateQuestion(q);
    expect(r.ok).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/a11yText/);
  });
});

describe("validate - curriculum", () => {
  it("the whole curriculum is structurally valid", () => {
    const r = validate.validateContent(content);
    if (!r.ok) console.error(r.errors);
    expect(r.ok).toBe(true);
  });

  it("topic ids are unique", () => {
    const ids = content.grades.flatMap((g) => g.topics.map((t) => t.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("detects a malformed curriculum", () => {
    const bad = { grades: [{ grade: 1, topics: [{ id: "x", title: "", questions: 5 }] }] };
    expect(validate.validateContent(bad).ok).toBe(false);
  });
});
