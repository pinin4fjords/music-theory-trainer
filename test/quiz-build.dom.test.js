// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";

const { app } = globalThis.MTT;
const M = globalThis.MTT.music;

const note = (letter, accidental, octave) => ({ letter, accidental, octave });

function scaffold() {
  document.body.innerHTML = `
    <header class="appbar"><nav class="tabs"></nav>
      <select id="grade-select"></select>
      <span id="level">·</span><span id="streak">🔥 0</span>
      <input type="checkbox" id="sound-toggle" checked>
      <button id="theme-toggle" type="button">🌗</button>
      <select id="session-length-select"><option value="5">5</option><option value="10">10</option></select>
    </header>
    <main id="main" tabindex="-1"></main>`;
}

function fakeStore(seed) {
  const m = new Map();
  if (seed) m.set("mtt.v1", JSON.stringify(seed));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

const RETURNING = { stateVersion: 2, srs: {}, settings: { grade: 1, gradeChosen: true, sound: false, mode: "daily", theme: "system" } };

// A single-topic session whose every question is the given build task.
function buildTopic(buildTask) {
  return {
    id: "build-test",
    grade: 1,
    title: "Build test",
    questions: () => ({ prompt: "Build the note.", choices: ["Correct", "Not yet"], answer: "Correct", buildTask }),
  };
}

function renderBuild(instance, buildTask) {
  const main = document.getElementById("main");
  globalThis.MTT.ui.views.quiz.render(main, instance.ctx, { single: buildTopic(buildTask) });
  return main;
}

const checkBtn = (main) => [...main.querySelectorAll("button")].find((b) => b.textContent.includes("Check answer"));

let instance;
beforeEach(() => {
  window.location.hash = "";
  sessionStorage.clear();
  scaffold();
  instance = app.boot({ document, storage: fakeStore(RETURNING), now: () => 1700000000000, seed: "build-seed" });
});

describe("DOM - build-task quiz questions (issue #21)", () => {
  const base = { clef: "treble", editableCols: [0], spelling: "exact", ignoreOctave: true, range: { minMidi: M.noteToMidi("C4"), maxMidi: M.noteToMidi("C6") } };

  it("renders an interactive staff editor and a Check button instead of choices", () => {
    const main = renderBuild(instance, Object.assign({ columns: [[note("C", 0, 4)]], target: [note("C", 0, 4)] }, base));
    expect(main.querySelector(".staff-editor")).toBeTruthy();
    expect(main.querySelector(".note-slot")).toBeTruthy();
    expect(checkBtn(main)).toBeTruthy();
    expect(main.querySelector(".choice")).toBeNull();
  });

  it("marks a matching build correct", () => {
    const main = renderBuild(instance, Object.assign({ columns: [[note("C", 0, 4)]], target: [note("C", 0, 4)] }, base));
    checkBtn(main).click();
    const reveal = main.querySelector(".reveal");
    expect(reveal.classList.contains("good")).toBe(true);
    expect(reveal.textContent).toMatch(/Correct/);
  });

  it("marks a non-matching build wrong", () => {
    const main = renderBuild(instance, Object.assign({ columns: [[note("C", 0, 4)]], target: [note("G", 0, 4)] }, base));
    checkBtn(main).click();
    const reveal = main.querySelector(".reveal");
    expect(reveal.classList.contains("bad")).toBe(true);
    expect(reveal.textContent).toMatch(/Not quite/);
  });

  it("passes once the learner nudges the note to the target", () => {
    const main = renderBuild(instance, Object.assign({ columns: [[note("C", 0, 4)]], target: [note("D", 0, 4)] }, base));
    const slot = main.querySelector(".note-slot");
    slot.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })); // C4 -> D4
    checkBtn(main).click();
    expect(main.querySelector(".reveal").classList.contains("good")).toBe(true);
  });

  it("reveals the answer when the learner gives up", () => {
    const main = renderBuild(instance, Object.assign({ columns: [[note("C", 0, 4)]], target: [note("G", 0, 4)] }, base));
    [...main.querySelectorAll("button")].find((b) => /don't know/.test(b.textContent)).click();
    expect(main.querySelector(".reveal.idk")).toBeTruthy();
  });
});
