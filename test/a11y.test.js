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
      <div class="settings">
        <button type="button" class="icon-btn" id="settings-toggle" aria-haspopup="true" aria-expanded="false" aria-controls="settings-menu" aria-label="Settings">⚙</button>
        <div class="settings-menu" id="settings-menu" role="group" aria-label="Settings" hidden>
          <button type="button" class="menu-row menu-link" id="progress-menu-link">📈 Progress</button>
          <label class="menu-row sound-label">
            <span>Sound</span>
            <input type="checkbox" id="sound-toggle" checked>
          </label>
          <div class="menu-row">
            <span>Theme</span>
            <button type="button" class="theme-toggle" id="theme-toggle" aria-label="Switch colour theme">🌗</button>
          </div>
        </div>
      </div>
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

describe("a11y - settings menu focus management", () => {
  it("opening the menu moves focus to its first control", () => {
    document.getElementById("settings-toggle").click();
    expect(document.getElementById("settings-menu").hidden).toBe(false);
    expect(document.activeElement).toBe(document.getElementById("progress-menu-link"));
  });

  it("Escape closes the menu and returns focus to the toggle", () => {
    const toggle = document.getElementById("settings-toggle");
    toggle.click();
    expect(document.getElementById("settings-menu").hidden).toBe(false);
    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.getElementById("settings-menu").hidden).toBe(true);
    expect(document.activeElement).toBe(toggle);
  });

  it("the Progress link in the menu navigates to the progress view and closes the menu", () => {
    document.getElementById("settings-toggle").click();
    document.getElementById("progress-menu-link").click();
    expect(document.getElementById("settings-menu").hidden).toBe(true);
    expect(instance.router.getCurrent()).toBe("progress");
  });
});

describe("a11y - explainer modal focus trap", () => {
  it("Tab wraps from the last focusable element back to the first", () => {
    instance.router.navigate("learn", "g1-notes");
    document.querySelector(".dig-deeper").click();
    const panel = document.querySelector(".explainer-modal-panel");
    expect(panel).toBeTruthy();
    const focusable = [...panel.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
    expect(focusable.length).toBeGreaterThan(1);
    const first = focusable[0], last = focusable[focusable.length - 1];
    last.focus();
    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(first);
  });

  it("Shift+Tab wraps from the first focusable element back to the last", () => {
    instance.router.navigate("learn", "g1-notes");
    document.querySelector(".dig-deeper").click();
    const panel = document.querySelector(".explainer-modal-panel");
    const focusable = [...panel.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
    const first = focusable[0], last = focusable[focusable.length - 1];
    first.focus();
    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(last);
  });

  it("focus opens inside the panel and Escape restores it to the opener even when focus has drifted out", () => {
    instance.router.navigate("learn", "g1-notes");
    const dig = document.querySelector(".dig-deeper");
    dig.click();
    expect(document.querySelector(".explainer-modal-panel").contains(document.activeElement)).toBe(true);
    document.body.focus(); // simulate focus escaping the dialog
    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.querySelector(".explainer-modal-overlay")).toBeFalsy();
    expect(document.activeElement).toBe(dig);
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

describe("a11y - playground keyboard", () => {
  it("keys are labelled with note names, not raw MIDI numbers", () => {
    instance.router.navigate("play");
    const keys = [...document.querySelectorAll(".pg-key")];
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((k) => !/MIDI note/.test(k.getAttribute("aria-label")))).toBe(true);
    expect(keys.some((k) => /^C4$/.test(k.getAttribute("aria-label")))).toBe(true);
  });

  it("keys that are part of the built structure expose aria-pressed, not just a colour class", () => {
    instance.router.navigate("play");
    const active = document.querySelectorAll(".pg-key.active");
    const inactive = document.querySelectorAll(".pg-key:not(.active)");
    expect(active.length).toBeGreaterThan(0);
    expect(inactive.length).toBeGreaterThan(0);
    expect([...active].every((k) => k.getAttribute("aria-pressed") === "true")).toBe(true);
    expect([...inactive].every((k) => k.getAttribute("aria-pressed") === "false")).toBe(true);
  });
});
