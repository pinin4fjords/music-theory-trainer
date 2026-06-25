// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";

const { app } = globalThis.MTT;

function scaffold() {
  document.body.innerHTML = `
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="appbar">
      <nav class="tabs">
        <button type="button" data-tab="home" class="active">Home</button>
        <button type="button" data-tab="learn">Learn</button>
        <button type="button" data-tab="explore">Why</button>
        <button type="button" data-tab="play">Playground</button>
      </nav>
      <select id="grade-select"></select>
      <span id="level">·</span>
      <span id="streak">🔥 0</span>
      <input type="checkbox" id="sound-toggle" checked>
      <button id="theme-toggle" type="button">🌗</button>
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

// A returning learner (grade already chosen) so the normal home renders rather
// than the first-run onboarding picker.
const RETURNING = { stateVersion: 2, srs: {}, settings: { grade: 4, gradeChosen: true, sound: true, mode: "daily", theme: "system" } };

const NOW = 1700000000000;

let instance;
beforeEach(() => {
  scaffold();
  instance = app.boot({ document, storage: fakeStore(RETURNING), now: () => NOW, seed: "dom-seed" });
});

describe("DOM - boot & navigation", () => {
  it("renders the home view and populates the grade selector", () => {
    const h1 = document.querySelector("#main h1");
    expect(h1).toBeTruthy();
    expect(h1.textContent).toMatch(/few minutes of theory/i);
    expect(document.querySelectorAll("#grade-select option").length).toBe(8);
  });

  it("navigates between tabs", () => {
    document.querySelector('[data-tab="play"]').click();
    expect(document.querySelector("#main h1").textContent).toMatch(/Playground/);
    document.querySelector('[data-tab="learn"]').click();
    expect(document.querySelector("#main h1").textContent).toMatch(/Learn/);
  });
});

describe("DOM - quiz flow & feedback", () => {
  it("renders a question with choices and reveals feedback on an answer", () => {
    instance.router.navigate("quiz");
    expect(document.querySelector(".quiz-prompt")).toBeTruthy();
    const choices = [...document.querySelectorAll(".choice")];
    expect(choices.length).toBeGreaterThanOrEqual(2);
    expect(choices.every((c) => c.tagName === "BUTTON")).toBe(true);

    const before = instance.store.get().totalAnswered;
    choices[0].click();

    const reveal = document.querySelector(".reveal");
    expect(reveal).toBeTruthy();
    // The correct choice is always highlighted after answering.
    expect(document.querySelector(".choice.correct")).toBeTruthy();
    // The answer was recorded.
    expect(instance.store.get().totalAnswered).toBe(before + 1);
    // A Next/Finish control appears and receives focus.
    const next = [...document.querySelectorAll("#main .btn")].pop();
    expect(next.textContent).toMatch(/Next|Finish/);
  });

  it("plays through a whole session and records the day's streak", () => {
    instance.router.navigate("quiz");
    let guard = 0;
    while (guard++ < 40) {
      const choice = document.querySelector(".choice:not(:disabled)");
      if (choice) {
        choice.click();
        const next = [...document.querySelectorAll("#main .btn")].pop();
        next.click();
      }
      if (/Nice work/.test(document.querySelector("#main").textContent)) break;
    }
    const finishText = document.querySelector("#main").textContent;
    expect(finishText).toMatch(/Nice work/);
    expect(finishText).toMatch(/By topic/); // per-topic breakdown closes the loop
    expect(instance.store.get().totalAnswered).toBe(10);
    expect(instance.store.get().streak).toBe(1); // first session today
    expect(document.getElementById("streak").textContent).toBe("🔥 1");
  });
});

describe("DOM - settings", () => {
  it("changing grade persists and re-renders", () => {
    const sel = document.getElementById("grade-select");
    sel.value = "2";
    sel.dispatchEvent(new window.Event("change"));
    expect(instance.store.settings().grade).toBe(2);
  });

  it("toggling sound updates state", () => {
    const t = document.getElementById("sound-toggle");
    t.checked = false;
    t.dispatchEvent(new window.Event("change"));
    expect(instance.store.settings().sound).toBe(false);
  });

  it("the theme toggle cycles and persists the theme + sets data-theme", () => {
    const t = document.getElementById("theme-toggle");
    t.click(); // system -> light
    expect(instance.store.settings().theme).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    t.click(); // light -> dark
    expect(instance.store.settings().theme).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("the estimated-level badge updates after practice", () => {
    const level = document.getElementById("level");
    expect(level.textContent).toBe("New");
    instance.router.navigate("quiz");
    document.querySelector(".choice").click();
    expect(level.textContent).not.toBe("New"); // reflects that some practice happened
  });
});

describe("DOM - first-run onboarding", () => {
  it("shows a grade picker when no grade has been chosen, and proceeds on pick", () => {
    scaffold();
    const inst = app.boot({ document, storage: fakeStore(), now: () => NOW, seed: "ob" });
    expect(document.querySelector("#main").textContent).toMatch(/What grade are you working towards/);
    const picks = [...document.querySelectorAll(".grade-pick")];
    expect(picks.length).toBe(8);
    picks[2].click(); // Grade 3
    expect(inst.store.settings().grade).toBe(3);
    expect(inst.store.settings().gradeChosen).toBe(true);
    // Picking a grade starts practice.
    expect(document.querySelector(".quiz-prompt")).toBeTruthy();
  });
});

describe("DOM - reset", () => {
  it("clears progress back to defaults (keeping preferences)", () => {
    // Do some practice first.
    instance.router.navigate("quiz");
    document.querySelector(".choice").click();
    expect(instance.store.get().totalAnswered).toBe(1);

    const origConfirm = window.confirm;
    window.confirm = () => true;
    try {
      instance.router.navigate("home");
      document.getElementById("reset").click();
    } finally {
      window.confirm = origConfirm;
    }
    expect(instance.store.get().totalAnswered).toBe(0);
    expect(Object.keys(instance.store.srsMap()).length).toBe(0);
    expect(instance.store.settings().grade).toBe(4); // preference kept
  });
});
