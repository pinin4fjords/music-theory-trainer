// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";

const { app, session, content } = globalThis.MTT;

function scaffold() {
  document.body.innerHTML = `
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="appbar">
      <nav class="tabs">
        <button type="button" data-tab="home" class="active">Home</button>
        <button type="button" data-tab="learn">Learn</button>
        <button type="button" data-tab="aural">Aural</button>
        <button type="button" data-tab="explore">Why</button>
        <button type="button" data-tab="play">Playground</button>
      </nav>
      <select id="grade-select"></select>
      <span id="level">·</span>
      <span id="streak">🔥 0</span>
      <input type="checkbox" id="sound-toggle" checked>
      <button id="theme-toggle" type="button">🌗</button>
      <select id="session-length-select">
        <option value="5">5</option>
        <option value="10">10</option>
        <option value="20">20</option>
      </select>
    </header>
    <main id="main" tabindex="-1"></main>`;
}

function fakeStore(seedState) {
  const m = new Map();
  if (seedState) m.set("mtt.v1", JSON.stringify(seedState));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

const NOW = 1700000000000;

// The syllabus-last grade-4 aural topic, seeded overdue - so any "due-first"
// reordering has to visibly move it, and it isn't already first by declaration.
const g4Aural = session.auralTopics(content).filter((t) => t.grade === 4);
const dueTopicId = g4Aural[g4Aural.length - 1].id;

function seededState() {
  const srs = {};
  srs[dueTopicId] = { box: 3, seen: 6, correct: 5, streak: 2, lapses: 1, avgMs: 1500, lastSeen: 0, dueAt: NOW - 86400000 };
  return {
    stateVersion: 2,
    totalAnswered: 6,
    settings: { grade: 4, gradeChosen: true, sound: true, mode: "daily", theme: "system" },
    srs,
  };
}

beforeEach(() => {
  window.location.hash = "";
  scaffold();
});

describe("aural SRS scheduling - due badge & sort", () => {
  it("badges a due aural topic and floats it to the front of its grade", () => {
    expect(g4Aural.length).toBeGreaterThanOrEqual(2);
    const inst = app.boot({ document, storage: fakeStore(seededState()), now: () => NOW, seed: "aural-due-dom" });
    inst.router.navigate("aural");

    const badges = [...document.querySelectorAll("#main .aural-due-chip")];
    expect(badges.length).toBe(1);
    expect(badges[0].textContent.trim()).toMatch(/due for review/i);

    // Current grade (4) renders first, so the first grid is the grade-4 grid;
    // the due topic should now lead it.
    const firstGrid = document.querySelector("#main .grid");
    const firstCard = firstGrid.querySelector(".card.topic");
    expect(firstCard.querySelector(".aural-due-chip")).toBeTruthy();
  });

  it("shows no due badge when nothing is due", () => {
    const clean = { stateVersion: 2, srs: {}, settings: { grade: 4, gradeChosen: true, sound: true, mode: "daily", theme: "system" } };
    const inst = app.boot({ document, storage: fakeStore(clean), now: () => NOW, seed: "aural-clean-dom" });
    inst.router.navigate("aural");
    expect(document.querySelectorAll("#main .aural-due-chip").length).toBe(0);
  });
});

describe("aural SRS scheduling - home nudge", () => {
  it("nudges when aural topics are due and links to the Aural tab", () => {
    const inst = app.boot({ document, storage: fakeStore(seededState()), now: () => NOW, seed: "home-nudge-dom" });
    const nudge = document.querySelector("#aural-nudge-area .aural-nudge");
    expect(nudge).toBeTruthy();
    expect(nudge.textContent).toMatch(/aural topic .* due for review/i);
    nudge.querySelector("button").click();
    expect(document.querySelector("#main h1").textContent).toMatch(/Aural/);
    expect(inst.router.getCurrent()).toBe("aural");
  });

  it("omits the nudge when no aural topics are due", () => {
    const clean = { stateVersion: 2, srs: {}, settings: { grade: 4, gradeChosen: true, sound: true, mode: "daily", theme: "system" } };
    app.boot({ document, storage: fakeStore(clean), now: () => NOW, seed: "home-clean-dom" });
    expect(document.querySelector("#aural-nudge-area .aural-nudge")).toBeNull();
  });
});
