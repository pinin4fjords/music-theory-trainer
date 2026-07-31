// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";

const { app, content } = globalThis.MTT;

function scaffold() {
  document.body.innerHTML = `
    <header class="appbar"><nav class="tabs">
      <button type="button" data-tab="learn">Learn</button>
      <button type="button" data-tab="explore">Explainers</button>
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
  const data = new Map();
  if (seed) data.set("mtt.v1", JSON.stringify(seed));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

const RETURNING = {
  stateVersion: 3,
  srs: {},
  labNotes: {},
  settings: { grade: 5, gradeChosen: true, sound: false, mode: "daily", theme: "system" },
};

let instance;
beforeEach(() => {
  window.location.hash = "";
  scaffold();
  instance = app.boot({ document, storage: fakeStore(RETURNING), now: () => 1700000000000, seed: "lab-dom" });
});

describe("DOM - shared music labs", () => {
  it("renders all five labs through the same four-stage component", () => {
    const explainers = ["cents", "consonance", "timbre", "monochord", "metre"];
    explainers.forEach((explainer) => {
      instance.router.navigate("explore", explainer);
      const lab = document.querySelector(".music-lab");
      expect(lab).toBeTruthy();
      expect(document.querySelectorAll(".view > .card")).toHaveLength(1);
      expect(lab.querySelectorAll(".lab-step")).toHaveLength(4);
      expect(lab.querySelector(".lab-diagram").getAttribute("aria-label").length).toBeGreaterThan(20);
      expect(lab.querySelector(".lab-manipulate .lab-audio .audio-btn")).toBeTruthy();
      expect(lab.querySelector(".lab-step-body .lab-audio")).toBeNull();
      expect(lab.querySelectorAll(".lab-explanation")).toHaveLength(2);
      expect(lab.querySelector(".lab-explanation summary").textContent).toBe("How it works");
      expect([...lab.querySelectorAll(".lab-explanation")].every((section) => section.open)).toBe(true);
      expect(lab.querySelector(".lab-predict .lab-practice").textContent).toMatch(/Try this/);
      expect([...lab.querySelectorAll(".lab-explanation summary")].map((summary) => summary.textContent)).not.toContain("Practice");
      expect(lab.querySelector(".lab-observe-evidence").textContent).toMatch(/What this result shows/);
      expect(lab.querySelectorAll(".lab-explanation-limit")).toHaveLength(2);
      expect(lab.textContent).toMatch(/Where this explanation has limits/);
      expect(lab.textContent).toMatch(/What musicians and traditions decide/);
      expect(lab.querySelector(".lab-text-alternative").textContent.length).toBeGreaterThan(20);
    });
  });

  it("uses labelled native controls and updates a deterministic text result", () => {
    instance.router.navigate("explore", "consonance");
    const offset = document.querySelector('[data-lab-control="offset"]');
    expect(offset.tagName).toBe("INPUT");
    expect(offset.closest("label")).toBeTruthy();
    offset.value = "7";
    offset.dispatchEvent(new Event("input", { bubbles: true }));
    expect(document.querySelector(".lab-result-headline").textContent).toBe("7 beats per second");
    expect(document.querySelector(".lab-text-alternative").textContent).toMatch(/7 loudness peaks each second/);
    expect(document.querySelector(".lab-beat-diagram").getAttribute("aria-label")).toMatch(/7 amplitude beats/);
  });

  it("integrates the monochord graphic and fraction controls into the shared lab", () => {
    instance.router.navigate("explore", "monochord");
    expect(document.querySelectorAll(".view > .card")).toHaveLength(1);
    expect(document.querySelector(".lab-string")).toBeTruthy();
    const twoThirds = [...document.querySelectorAll(".lab-preset")].find((button) => button.textContent.includes("Two-thirds"));
    twoThirds.click();
    expect(Number(document.querySelector('[data-lab-control="length"]').value)).toBe(80);
    expect(document.querySelector(".lab-visual-caption").textContent).toMatch(/66.7 percent/);
    expect(document.querySelector(".lab-result-headline").textContent).toBe("Fundamental ≈ 79.06 Hz");
  });

  it("autosaves one optional note on its lab without changing mastery", () => {
    instance.router.navigate("explore", "consonance");
    const prediction = document.querySelector("[data-lab-prediction]");
    const observation = document.querySelector("[data-lab-observation]");
    prediction.value = "Four pulses";
    prediction.dispatchEvent(new Event("change", { bubbles: true }));
    observation.value = "A regular wobble";
    observation.dispatchEvent(new Event("change", { bubbles: true }));
    expect(instance.store.get().labNotes.beating.prediction).toBe("Four pulses");
    expect(instance.store.get().labNotes.beating.observation).toBe("A regular wobble");
    expect(instance.store.get().totalAnswered).toBe(0);
    expect(instance.store.srsMap()).toEqual({});
    expect(document.querySelector(".lab-note-status").textContent).toMatch(/Saved automatically/);

    instance.router.navigate("explore");
    expect(document.querySelector(".lab-note")).toBeNull();
    instance.router.navigate("explore", "consonance");
    expect(document.querySelector(".lab-note summary").textContent).toBe("Edit saved note");
    expect(document.querySelector("[data-lab-prediction]").value).toBe("Four pulses");
    expect(document.querySelector("[data-lab-observation]").value).toBe("A regular wobble");
  });

  it("links a lesson directly to its relevant lab in the explainer modal", () => {
    instance.router.navigate("learn", "g3-quality");
    const button = document.querySelector(".dig-deeper");
    expect(button.textContent).toMatch(/Try lab: Tune by listening for beats/);
    button.click();
    expect(document.querySelector(".explainer-modal-panel .music-lab")).toBeTruthy();
    expect(document.querySelector(".explainer-modal-panel .music-lab").textContent).toMatch(/Tune by listening for beats/);
    expect(document.querySelector(".explainer-modal-body > .card:not(.music-lab)")).toBeNull();
  });

  it("links answer feedback to a lab without awarding lab mastery", () => {
    const topic = content.grades.flatMap((grade) => grade.topics).find((item) => item.id === "g3-quality");
    instance.router.navigate("quiz", { single: topic });
    document.querySelector(".choice").click();
    const button = document.querySelector(".reveal .dig-deeper");
    expect(button).toBeTruthy();
    expect(button.textContent).toMatch(/Try lab: Tune by listening for beats/);
    expect(instance.store.get().labNotes).toEqual({});
  });
});
