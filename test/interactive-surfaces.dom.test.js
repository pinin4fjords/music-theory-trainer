// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";

const { app } = globalThis.MTT;

function scaffold() {
  document.body.innerHTML = `
    <header class="appbar"><nav class="tabs">
      <button type="button" data-tab="explore">Explainers</button>
      <button type="button" data-tab="play">Playground</button>
    </nav>
      <select id="grade-select"></select>
      <span id="level">·</span><span id="streak">🔥 0</span>
      <input type="checkbox" id="sound-toggle" checked>
      <button id="theme-toggle" type="button">🌗</button>
      <select id="session-length-select"><option value="10">10</option></select>
    </header>
    <main id="main" tabindex="-1"></main>`;
}

function fakeStore(seed) {
  const m = new Map();
  if (seed) m.set("mtt.v1", JSON.stringify(seed));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

const RETURNING = { stateVersion: 2, srs: {}, settings: { grade: 5, gradeChosen: true, sound: false, mode: "daily", theme: "system" } };

let instance;
beforeEach(() => {
  window.location.hash = "";
  scaffold();
  instance = app.boot({ document, storage: fakeStore(RETURNING), now: () => 1700000000000, seed: "surf" });
});

function up(slot) { slot.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })); }

describe("DOM - interactive editors in explainers", () => {
  it("build-triads explainer renders an editor and names the triad as it changes", () => {
    instance.router.navigate("explore", "build-triads");
    const main = document.getElementById("main");
    const editor = main.querySelector(".staff-editor");
    expect(editor).toBeTruthy();
    expect(main.textContent).toMatch(/major triad/i); // default C E G is major
    // Lower the third (middle note) and the caption updates.
    const before = main.querySelector(".iv-display, .deg-row") ? main.querySelector(".iv-display, .deg-row").textContent : main.textContent;
    up(editor.querySelector(".note-slot"));
    expect(main.querySelector(".staff-editor")).toBeTruthy();
    expect(main.textContent).not.toBe(before);
  });

  it("the keyboard (intervals) explainer includes a staff builder", () => {
    instance.router.navigate("explore", "keyboard");
    const main = document.getElementById("main");
    expect(main.querySelector(".staff-editor")).toBeTruthy();
    expect(main.textContent).toMatch(/build it on the staff/i);
  });

  it("the three-minors explainer lets you raise the 7th", () => {
    instance.router.navigate("explore", "three-minors");
    const main = document.getElementById("main");
    expect(main.querySelector(".staff-editor")).toBeTruthy();
    expect(main.textContent).toMatch(/Raise the 7th yourself/i);
  });
});

describe("DOM - Playground build mode", () => {
  it("switches to a free-compose staff and updates as notes move", () => {
    instance.router.navigate("play");
    const main = document.getElementById("main");
    const buildSeg = [...main.querySelectorAll(".seg button")].find((b) => b.textContent === "Build");
    expect(buildSeg).toBeTruthy();
    buildSeg.click();
    const editor = document.getElementById("main").querySelector(".staff-editor");
    expect(editor).toBeTruthy();
    // Moving a note re-renders without error and keeps the keyboard in sync.
    up(editor.querySelector(".note-slot"));
    expect(document.getElementById("main").querySelector("#pg-kb .pg-key.active")).toBeTruthy();
  });
});
