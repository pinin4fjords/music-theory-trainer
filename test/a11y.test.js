// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";

const { app, content, notation, music } = globalThis.MTT;

function scaffold() {
  document.body.innerHTML = `
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="appbar">
      <nav class="tabs" aria-label="Sections">
        <button type="button" data-tab="home" class="active">Home</button>
        <button type="button" data-tab="learn">Learn</button>
        <button type="button" data-tab="explore">Why</button>
        <button type="button" data-tab="play">Playground</button>
      </nav>
      <select id="grade-select" aria-label="grade"></select>
      <span id="streak">🔥 0</span>
      <input type="checkbox" id="sound-toggle" checked>
    </header>
    <main id="main" tabindex="-1"></main>`;
}
function fakeStore() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

// The reading-notes topic always renders a staff, so it's a good a11y probe.
const notesTopic = content.grades[0].topics.find((t) => t.id === "g1-notes");

let instance;
beforeEach(() => {
  scaffold();
  instance = app.boot({ document, storage: fakeStore(), now: () => 1700000000000, seed: "a11y" });
});

describe("notation - text alternative", () => {
  it("every staff carries a non-empty aria-label describing it", () => {
    const html = notation.staffHTML({ clef: "treble", notes: [music.spelled("C", 0, 4), music.spelled("E", 0, 4)] });
    expect(html).toMatch(/role="img"/);
    expect(html).toMatch(/aria-label="[^"]+"/);
    expect(notation.describe({ clef: "treble", notes: [music.spelled("C", 0, 4)] })).toMatch(/Treble clef/);
  });
});

describe("a11y - live region & landmarks", () => {
  it("an ARIA-live region exists for announcements", () => {
    instance.router.navigate("quiz");
    const live = document.getElementById("a11y-live");
    expect(live).toBeTruthy();
    expect(live.getAttribute("aria-live")).toBe("polite");
  });

  it("a skip link is present", () => {
    expect(document.querySelector(".skip-link")).toBeTruthy();
  });
});

describe("a11y - quiz interactivity", () => {
  it("a notation prompt has a text alternative and choices are real buttons", () => {
    instance.router.navigate("quiz", { single: notesTopic });
    const svg = document.querySelector("#main svg.staff");
    expect(svg).toBeTruthy();
    expect(svg.getAttribute("aria-label")).toBeTruthy();
    const prompt = document.querySelector(".quiz-prompt");
    expect(prompt.getAttribute("aria-label")).toBeTruthy();
    expect([...document.querySelectorAll(".choice")].every((c) => c.tagName === "BUTTON")).toBe(true);
  });

  it("number keys select a choice even when focus is not on the view", () => {
    instance.router.navigate("quiz", { single: notesTopic });
    // Dispatch on document (not the view): the listener must live there, since
    // focus is rarely on the view element itself between questions.
    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "1", bubbles: true }));
    expect(document.querySelector(".reveal")).toBeTruthy();
  });

  it("focus moves to the question prompt on each question", () => {
    instance.router.navigate("quiz", { single: notesTopic });
    const prompt = document.querySelector(".quiz-prompt");
    expect(prompt.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(prompt);
  });

  it("the reveal carries role=status and focus moves to the Next control", () => {
    instance.router.navigate("quiz", { single: notesTopic });
    document.querySelector(".choice").click();
    const reveal = document.querySelector(".reveal");
    expect(reveal.getAttribute("role")).toBe("status");
    const next = [...document.querySelectorAll("#main .btn")].pop();
    expect(document.activeElement).toBe(next);
  });
});
