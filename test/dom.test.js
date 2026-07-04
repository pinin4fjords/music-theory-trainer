// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

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

// A returning learner (grade already chosen) so the normal home renders rather
// than the first-run onboarding picker.
const RETURNING = { stateVersion: 2, srs: {}, settings: { grade: 4, gradeChosen: true, sound: true, mode: "daily", theme: "system" } };

const NOW = 1700000000000;

let instance;
beforeEach(() => {
  window.location.hash = ""; // start each test from a clean URL
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

  it("ignores clicks on the already-active top-level tab", () => {
    document.querySelector('[data-tab="learn"]').click();
    const firstCard = document.querySelector("#main .grid button");
    document.querySelector('[data-tab="learn"]').click();
    expect(document.querySelector("#main .grid button")).toBe(firstCard);
  });

  it("the home screen has a quick link into Aural training", () => {
    const cards = [...document.querySelectorAll("#home-cards button")];
    const auralCard = cards.find((c) => /Aural/.test(c.textContent));
    expect(auralCard).toBeTruthy();
    auralCard.click();
    expect(document.querySelector("#main h1").textContent).toMatch(/Aural/);
  });

  it("shows the current grade first on the Aural tab", () => {
    instance.router.navigate("aural");
    const headings = [...document.querySelectorAll("#main h2")]
      .map((h) => h.textContent.replace(/\s+/g, " ").trim());
    expect(headings[0]).toMatch(new RegExp(`^Grade ${RETURNING.settings.grade}`));
  });

  it("shows per-topic aural accuracy chips from SRS data", () => {
    const auralSeeded = {
      stateVersion: 2,
      totalAnswered: 4,
      settings: { grade: 4, gradeChosen: true, sound: true, mode: "daily", theme: "system" },
      srs: {
        // 3 correct answers from 4 attempts => 75% accuracy chip for this topic.
        "g4-aural-time": { box: 3, seen: 4, correct: 3, streak: 1, lapses: 1, avgMs: 1200, lastSeen: 0, dueAt: 0 },
      },
    };
    scaffold();
    const inst = app.boot({ document, storage: fakeStore(auralSeeded), now: () => NOW, seed: "aural-chip" });
    inst.router.navigate("aural");
    const chips = [...document.querySelectorAll("#main .aural-acc-chip")].map((c) => c.textContent.trim());
    const timeSigCard = [...document.querySelectorAll("#main .card.topic")]
      .find((c) => /time signature & rhythm/i.test(c.textContent));
    expect(chips).toContain("75%");
    expect(chips).toContain("New");
    expect(timeSigCard).toBeTruthy();
    expect(timeSigCard.querySelector(".aural-acc-chip").textContent.trim()).toBe("75%");
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

  it("cancels in-flight question audio before replaying it", () => {
    const baseTopic = instance.ctx.content.grades[0].topics[0];
    const events = [];
    const fixedTopic = Object.assign({}, baseTopic, {
      questions: () => ({
        prompt: "Listen",
        choices: ["A", "B"],
        answer: "A",
        audio: () => { events.push("play"); },
      }),
    });
    const realCancel = instance.ctx.audio.cancel;
    instance.ctx.audio.cancel = () => { events.push("cancel"); };

    try {
      instance.router.navigate("quiz", { single: fixedTopic });
      expect(events.slice(-2)).toEqual(["cancel", "play"]);
      document.querySelector(".audio-btn").click();
      expect(events.slice(-2)).toEqual(["cancel", "play"]);
    } finally {
      instance.ctx.audio.cancel = realCancel;
    }
  });

  it("falls back to the Learn page when no explainer is available", () => {
    const lessonTopic = instance.ctx.content.grades[0].topics.find((t) => t.id === "g1-triad");
    instance.router.navigate("quiz", { single: lessonTopic });
    document.querySelector(".choice").click();
    const dig = document.querySelector(".dig-deeper");
    expect(dig).toBeTruthy();
    dig.click();
    expect(instance.router.getCurrent()).toBe("learn");
    expect(document.querySelector("#main h1").textContent).toMatch(/tonic triad/i);
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

  it("changing session length persists and changes the built session size", () => {
    const sel = document.getElementById("session-length-select");
    sel.value = "20";
    sel.dispatchEvent(new window.Event("change"));
    expect(instance.store.settings().sessionLength).toBe(20);
    instance.router.navigate("quiz");
    expect(document.querySelector(".progress-count").textContent).toBe("1 / 20");
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
    // Picking a grade navigates to the home dashboard, ready to start practice.
    expect(document.querySelector(".grade-pick")).toBeFalsy(); // onboarding picker gone
    expect(document.querySelector("button")).toBeTruthy(); // home view rendered (has Start button)
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

describe("DOM - progress view", () => {
  const card = (box, seen, correct) => ({ box, seen, correct, streak: correct, lapses: seen - correct, avgMs: 1500, lastSeen: 0, dueAt: 0 });
  const SEEDED = {
    stateVersion: 2,
    totalAnswered: 30,
    streak: 3,
    settings: { grade: 4, gradeChosen: true, sound: true, mode: "daily", theme: "system" },
    srs: {
      "g1-notes": card(5, 8, 8),
      "g1-rhythm": card(5, 8, 8),
      "g1-keys": card(4, 8, 7),
      "g4-key-signatures": card(0, 6, 1), // weak
    },
  };

  it("renders per-grade mastery bars, an estimated level, and weak areas", () => {
    scaffold();
    const inst = app.boot({ document, storage: fakeStore(SEEDED), now: () => NOW, seed: "p" });
    inst.router.navigate("progress");
    const text = document.querySelector("#main").textContent;
    expect(document.querySelector("#main h1").textContent).toMatch(/Your progress/);
    expect(text).toMatch(/By grade/);
    expect(text).toMatch(/Grade 1/);
    expect(document.querySelectorAll(".grade-row").length).toBeGreaterThanOrEqual(4); // grades 1-4
    expect(document.querySelector(".bar-fill")).toBeTruthy();
    expect(text).toMatch(/Focus areas/);
  });

  it("the level chip opens the progress view", () => {
    scaffold();
    const inst = app.boot({ document, storage: fakeStore(SEEDED), now: () => NOW, seed: "p2" });
    document.getElementById("level").click();
    expect(inst.router.getCurrent()).toBe("progress");
  });

  it("surfaces aural practice in its own mastery section, separate from theory", () => {
    scaffold();
    const auralSeeded = Object.assign({}, SEEDED, {
      srs: Object.assign({}, SEEDED.srs, { "g1-aural-time": card(3, 5, 4) }),
    });
    const inst = app.boot({ document, storage: fakeStore(auralSeeded), now: () => NOW, seed: "p4" });
    inst.router.navigate("progress");
    const text = document.querySelector("#main").textContent;
    expect(text).toMatch(/Aural, by grade/);
  });

  it("shows an empty state before any practice", () => {
    scaffold();
    const inst = app.boot({ document, storage: fakeStore(RETURNING), now: () => NOW, seed: "p3" });
    inst.router.navigate("progress");
    expect(document.querySelector("#main").textContent).toMatch(/No data yet/);
  });
});

describe("DOM - reference", () => {
  it("renders a grouped menu and shows the first section by default", () => {
    instance.router.navigate("reference");
    expect(document.querySelector("#main h1").textContent).toMatch(/Reference/);
    expect(document.querySelector("#ref-search")).toBeTruthy();
    // Menu lists many sections, grouped.
    expect(document.querySelectorAll(".ref-menu-item").length).toBeGreaterThan(10);
    expect(document.querySelector(".ref-menu-group")).toBeTruthy();
    // The first section (key signatures) is shown in the content pane.
    const content = document.getElementById("ref-content").textContent;
    expect(content).toMatch(/Relative minor/);
    expect(document.querySelector("#ref-content .ref-table")).toBeTruthy();
  });

  it("selecting a menu item swaps the content pane", () => {
    instance.router.navigate("reference");
    const tempo = [...document.querySelectorAll(".ref-menu-item")].find((b) => b.textContent === "Tempo");
    expect(tempo).toBeTruthy();
    tempo.click(); // navigates + re-renders
    const content = document.getElementById("ref-content").textContent;
    expect(content).toMatch(/Allegro/);
    expect(content).not.toMatch(/Relative minor/); // key-sig section no longer shown
    // The re-rendered menu marks the chosen section active.
    expect(document.querySelector(".ref-menu-item.active").textContent).toBe("Tempo");
  });

  it("search filters across all sections", () => {
    instance.router.navigate("reference");
    const input = document.getElementById("ref-search");
    input.value = "dolce";
    input.dispatchEvent(new window.Event("input"));
    const content = document.getElementById("ref-content").textContent;
    expect(content).toMatch(/Dolce/);
    expect(content).not.toMatch(/Allegro/); // unrelated entries filtered out
    expect(content).not.toMatch(/Relative minor/);
  });

  it("the content pane is not itself a live region (search would otherwise re-announce whole tables on every keystroke)", () => {
    instance.router.navigate("reference");
    expect(document.getElementById("ref-content").hasAttribute("aria-live")).toBe(false);
  });
});

describe("DOM - linkable pages (hash routing)", () => {
  it("navigating updates the URL hash, including the section id", () => {
    instance.router.navigate("reference", "scales");
    expect(window.location.hash).toBe("#reference/scales");
    instance.router.navigate("play");
    expect(window.location.hash).toBe("#play");
  });

  it("booting with a hash opens that page directly", () => {
    window.location.hash = "#explore/harmonic-series";
    scaffold();
    const inst = app.boot({ document, storage: fakeStore(RETURNING), now: () => NOW, seed: "h" });
    expect(inst.router.getCurrent()).toBe("explore");
    // The explainer page itself is shown, not the list.
    expect(document.querySelector("#main h1").textContent).toMatch(/harmonic series/i);
    window.location.hash = "";
  });

  it("a deep link to a lesson opens that topic", () => {
    window.location.hash = "#learn/g4-key-signatures";
    scaffold();
    const inst = app.boot({ document, storage: fakeStore(RETURNING), now: () => NOW, seed: "h2" });
    expect(inst.router.getCurrent()).toBe("learn");
    expect(document.querySelector("#main h1").textContent).toMatch(/Keys up to 5 sharps/);
    window.location.hash = "";
  });
});

describe("DOM - session resume", () => {
  beforeEach(() => {
    // Ensure each test starts with a clean sessionStorage.
    window.sessionStorage.clear();
  });
  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("saves progress to sessionStorage when a session starts", () => {
    instance.router.navigate("quiz");
    const saved = JSON.parse(window.sessionStorage.getItem("mtt.session"));
    expect(saved).toBeTruthy();
    expect(typeof saved.seed).toBe("number");
    expect(saved.idx).toBe(0);
    expect(saved.score).toBe(0);
    expect(saved.grade).toBe(4);
  });

  it("updates sessionStorage idx and score after answering questions", () => {
    instance.router.navigate("quiz");

    // Answer two questions.
    document.querySelector(".choice").click();
    [...document.querySelectorAll("#main .btn")].pop().click(); // Next
    document.querySelector(".choice").click();
    [...document.querySelectorAll("#main .btn")].pop().click(); // Next

    const saved = JSON.parse(window.sessionStorage.getItem("mtt.session"));
    expect(saved.idx).toBe(2);
  });

  it("offers a resume prompt after navigating away mid-session", () => {
    instance.router.navigate("quiz");
    // Answer one question to advance idx.
    document.querySelector(".choice").click();
    [...document.querySelectorAll("#main .btn")].pop().click(); // Next

    // Navigate away, then back to quiz.
    instance.router.navigate("home");
    instance.router.navigate("quiz");

    expect(document.querySelector("#main h1").textContent).toMatch(/Resume session/i);
    expect(document.querySelector("#main").textContent).toMatch(/question 2 of/i);
  });

  it("resuming continues from the saved question index", () => {
    instance.router.navigate("quiz");
    // Answer one question.
    document.querySelector(".choice").click();
    [...document.querySelectorAll("#main .btn")].pop().click(); // Next

    // Navigate away, then return and resume.
    instance.router.navigate("home");
    instance.router.navigate("quiz");
    const continueBtn = [...document.querySelectorAll("#main button")]
      .find((b) => /continue/i.test(b.textContent));
    expect(continueBtn).toBeTruthy();
    continueBtn.click();

    // The progress counter should show we are on question 2.
    const counter = document.querySelector(".progress-count");
    expect(counter.textContent).toMatch(/^2\s*\/\s*/);
  });

  it("'Start fresh' clears sessionStorage and begins a new session", () => {
    instance.router.navigate("quiz");
    document.querySelector(".choice").click();
    [...document.querySelectorAll("#main .btn")].pop().click();

    instance.router.navigate("home");
    instance.router.navigate("quiz");

    const freshBtn = [...document.querySelectorAll("#main button")]
      .find((b) => /start fresh/i.test(b.textContent));
    expect(freshBtn).toBeTruthy();
    freshBtn.click();

    // A new session starts from question 1.
    expect(document.querySelector(".progress-count").textContent).toMatch(/^1\s*\/\s*/);
    expect(JSON.parse(window.sessionStorage.getItem("mtt.session")).idx).toBe(0);
  });

  it("completing a session clears the resume state", () => {
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
    expect(document.querySelector("#main").textContent).toMatch(/Nice work/);
    expect(window.sessionStorage.getItem("mtt.session")).toBeNull();
  });

  it("does not offer resume for single-topic sessions", () => {
    // Seed a fake resume entry for grade 4.
    window.sessionStorage.setItem("mtt.session", JSON.stringify({
      seed: 42, snapshotSrs: {}, snapshotNow: NOW,
      grade: 4, mode: "daily", sessionLength: 10, idx: 3, score: 2,
    }));

    // Single-topic sessions bypass the resume logic entirely.
    const topic = instance.ctx.content.grades[0].topics[0];
    instance.router.navigate("quiz", { single: topic });
    expect(document.querySelector(".quiz-prompt")).toBeTruthy();
    expect(document.querySelector("#main h1")).toBeFalsy();
  });
});

describe("DOM - aural echo-sing feedback on a mismatched attempt", () => {

  it("shows the actual note/interval score, not the self-report sentinel as 'the answer'", async () => {
    const ai = globalThis.MTT.audioInput;
    const realIsAvailable = ai.isAvailable;
    const realStart = ai.startPitchDetection;

    // Fix the generated question so the test knows exactly how many notes to
    // "sing" per phrase. The echo task now generates three phrases.
    const topic = instance.ctx.content.auralGrades[0].topics.find((t) => t.id === "g1-aural-sing");
    const fixedQuestion = topic.questions(globalThis.MTT.rng.create("fixed-echo"));
    // Multi-echo: each phrase descriptor lives in micTask.phrases[i].
    const targetCount = fixedQuestion.micTask.phrases[0].targets.length;
    const fixedTopic = Object.assign({}, topic, { questions: () => fixedQuestion });

    let capturedCallback = null;
    ai.isAvailable = () => true;
    ai.startPitchDetection = async (cb) => { capturedCallback = cb; return () => {}; };

    // Simulate singing one wrong phrase: click start, advance the auto-play
    // delay, feed wrong notes then trailing silence, then click "Score it".
    // Returns the per-phrase score button text so the caller can advance.
    async function singPhrase() {
      vi.useFakeTimers();
      document.querySelector(".mic-start-btn").click();
      await vi.advanceTimersByTimeAsync(5000); // past auto-play-then-open-mic delay
      vi.useRealTimers();

      expect(capturedCallback).toBeTruthy();
      // F#4 (pitch class 6) — G1 phrases only ever use C/D/E (0/2/4), all
      // more than a semitone away, so every note is a guaranteed mismatch.
      for (let i = 0; i < targetCount + 3; i++) capturedCallback({ midi: 66, cents: 0, clarity: 0.9 });
      // Trailing silence past the ~1.2 s window ends the take.
      for (let i = 0; i < 18; i++) capturedCallback({ midi: null, cents: 0, clarity: 0 });

      // Click the phrase-level "Score it" button.
      const phraseScoreBtn = [...document.querySelectorAll(".seq-btn-row button")]
        .find((b) => /Score it/.test(b.textContent));
      expect(phraseScoreBtn).toBeTruthy();
      phraseScoreBtn.click();
    }

    try {
      instance.router.navigate("quiz", { single: fixedTopic });

      // Phrase 1 — sing wrong, score, then advance to phrase 2.
      await singPhrase();
      const toPhrase2 = [...document.querySelectorAll(".seq-btn-row button")]
        .find((b) => /Phrase 2/.test(b.textContent));
      expect(toPhrase2).toBeTruthy();
      toPhrase2.click();

      // Phrase 2 — sing wrong, score, then advance to phrase 3.
      await singPhrase();
      const toPhrase3 = [...document.querySelectorAll(".seq-btn-row button")]
        .find((b) => /Phrase 3/.test(b.textContent));
      expect(toPhrase3).toBeTruthy();
      toPhrase3.click();

      // Phrase 3 — sing wrong, score, then click the final "Score it".
      await singPhrase();
      const finalScoreBtn = [...document.querySelectorAll(".seq-btn-row button")]
        .find((b) => /Score it/.test(b.textContent));
      expect(finalScoreBtn).toBeTruthy();
      finalScoreBtn.click();

      const revealText = document.querySelector(".reveal").textContent;
      expect(revealText).toMatch(/Not quite/);
      // The score detail string includes per-phrase note counts; check that the
      // self-report sentinel answer never leaks into the reveal feedback.
      expect(revealText).not.toMatch(/I sang all three phrases/);
    } finally {
      ai.isAvailable = realIsAvailable;
      ai.startPitchDetection = realStart;
    }
  });
});
