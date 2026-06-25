/* ui/app.js - the application orchestrator.
 *
 * Wires everything together: creates the state store and a session RNG, builds
 * the shared `ctx` the views receive, registers views with the router, and wires
 * the header controls (tabs, grade selector, sound toggle). It also handles
 * cross-cutting concerns: unlocking audio on the first user gesture, reflecting
 * reduced-motion preferences, and keeping the streak chip in sync with state.
 *
 * `boot(opts)` returns the live app object, so DOM tests can drive it with an
 * injected document, storage and seed.
 *
 * Public surface: global `MTT.app`.
 */
(function (global) {
  "use strict";

  function boot(opts) {
    opts = opts || {};
    const doc = opts.document || global.document;
    const components = global.MTT.ui.components;

    const store = global.MTT.state.create({ storage: opts.storage || null, now: opts.now });
    global.MTT.audio.setEnabled(store.settings().sound);

    // Create the ARIA-live announcement region up front so it is always present.
    components.ensureLiveRegion();

    const main = doc.getElementById("main");
    const navButtons = [...doc.querySelectorAll("nav.tabs button")];

    const router = global.MTT.ui.router.create({ mainEl: main, navButtons });

    const ctx = {
      store,
      content: global.MTT.content,
      music: global.MTT.music,
      notation: global.MTT.notation,
      audio: global.MTT.audio,
      session: global.MTT.session,
      diagnose: global.MTT.diagnose,
      analytics: global.MTT.analytics,
      storage: global.MTT.storage,
      rng: global.MTT.rng,
      router,
      C: components,
      now: opts.now || (() => Date.now()),
      seed: opts.seed, // fixed seed in tests; undefined => time-seeded in production
      syncHeader,
    };
    router.setContext(ctx);

    router.register("home", global.MTT.ui.views.home.render);
    router.register("learn", global.MTT.ui.views.learn.render);
    router.register("explore", global.MTT.ui.views.explainer.render);
    router.register("play", global.MTT.ui.views.playground.render);
    router.register("quiz", global.MTT.ui.views.quiz.render);

    navButtons.forEach((b) => b.addEventListener("click", () => router.navigate(b.dataset.tab)));

    // Grade selector.
    const gradeSelect = doc.getElementById("grade-select");
    if (gradeSelect && !gradeSelect.options.length) {
      global.MTT.content.grades.forEach((g) => {
        const o = doc.createElement("option");
        o.value = String(g.grade);
        o.textContent = String(g.grade);
        gradeSelect.appendChild(o);
      });
    }
    if (gradeSelect) {
      gradeSelect.value = String(store.settings().grade);
      gradeSelect.addEventListener("change", () => {
        store.setSetting("grade", parseInt(gradeSelect.value, 10));
        router.refresh();
      });
    }

    // Sound toggle.
    const soundToggle = doc.getElementById("sound-toggle");
    if (soundToggle) {
      soundToggle.checked = store.settings().sound;
      soundToggle.addEventListener("change", () => {
        store.setSetting("sound", soundToggle.checked);
        global.MTT.audio.setEnabled(soundToggle.checked);
      });
    }

    // Keep the streak chip current whenever state changes.
    const streakChip = doc.getElementById("streak");
    store.subscribe(() => {
      if (streakChip) streakChip.textContent = "🔥 " + store.get().streak;
    });

    function syncHeader() {
      if (gradeSelect) gradeSelect.value = String(store.settings().grade);
      if (soundToggle) soundToggle.checked = store.settings().sound;
      if (streakChip) streakChip.textContent = "🔥 " + store.get().streak;
    }

    // Unlock audio on the first user gesture (autoplay policy).
    const unlock = () => global.MTT.audio.unlock();
    doc.addEventListener("pointerdown", unlock, { once: true });
    doc.addEventListener("keydown", unlock, { once: true });

    applyReducedMotion();
    function applyReducedMotion() {
      let reduce = !!store.settings().reducedMotion;
      try {
        if (global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches) reduce = true;
      } catch { /* matchMedia may be absent */ }
      if (doc.body) doc.body.classList.toggle("reduce-motion", reduce);
    }

    syncHeader();
    router.navigate("home");

    return { router, store, ctx };
  }

  const api = { boot };

  global.MTT = global.MTT || {};
  global.MTT.app = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
