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

    // Durable persistence: mirrors every save to IndexedDB + an optional linked
    // file, and reconciles the newest copy on load. Injectable for tests.
    const persist = opts.persist || global.MTT.persist.create({
      now: opts.now,
      serialize: (s) => global.MTT.storage.exportJSON(s),
    });

    const store = global.MTT.state.create({
      storage: opts.storage || null,
      now: opts.now,
      onPersist: (s) => persist.mirror(s),
    });
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
      persist,
      rng: global.MTT.rng,
      router,
      C: components,
      now: opts.now || (() => Date.now()),
      seed: opts.seed, // fixed seed in tests; undefined => time-seeded in production
      persistStatus: { supported: false, fileSupported: false, fileLinked: false },
      syncHeader,
      refreshPersistStatus,
    };
    router.setContext(ctx);

    router.register("home", global.MTT.ui.views.home.render);
    router.register("learn", global.MTT.ui.views.learn.render);
    router.register("explore", global.MTT.ui.views.explainer.render);
    router.register("play", global.MTT.ui.views.playground.render);
    router.register("quiz", global.MTT.ui.views.quiz.render);
    router.register("progress", global.MTT.ui.views.progress.render);

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
        store.setSetting("gradeChosen", true); // changing grade is a deliberate choice
        router.refresh();
      });
    }

    // Settings menu (sound + theme live here to keep the bar light).
    const settingsToggle = doc.getElementById("settings-toggle");
    const settingsMenu = doc.getElementById("settings-menu");
    if (settingsToggle && settingsMenu) {
      const setOpen = (open) => {
        settingsMenu.hidden = !open;
        settingsToggle.setAttribute("aria-expanded", open ? "true" : "false");
      };
      settingsToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        setOpen(settingsMenu.hidden);
      });
      doc.addEventListener("click", (e) => {
        if (!settingsMenu.hidden && !settingsMenu.contains(e.target) && e.target !== settingsToggle) setOpen(false);
      });
      doc.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });
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

    // Theme toggle (cycles light -> dark -> system; system follows the OS).
    const themeToggle = doc.getElementById("theme-toggle");
    const THEME_ICON = { light: "☀️", dark: "🌙", system: "🌗" };
    const THEME_NEXT = { light: "dark", dark: "system", system: "light" };
    if (themeToggle) {
      themeToggle.addEventListener("click", () => {
        const next = THEME_NEXT[store.settings().theme] || "light";
        store.setSetting("theme", next);
        applyTheme();
      });
    }
    function applyTheme() {
      const setting = store.settings().theme || "system";
      let resolved = setting;
      if (setting === "system") {
        let dark = false;
        try { dark = global.matchMedia && global.matchMedia("(prefers-color-scheme: dark)").matches; } catch { /* ignore */ }
        resolved = dark ? "dark" : "light";
      }
      const docEl = doc.documentElement;
      if (docEl) docEl.setAttribute("data-theme", resolved);
      if (themeToggle) {
        themeToggle.textContent = THEME_ICON[setting] || "🌗";
        themeToggle.setAttribute("aria-label", "Colour theme: " + setting + " (click to change)");
      }
    }
    // Re-resolve "system" when the OS preference changes.
    try {
      const mq = global.matchMedia && global.matchMedia("(prefers-color-scheme: dark)");
      if (mq && mq.addEventListener) mq.addEventListener("change", () => { if (store.settings().theme === "system") applyTheme(); });
    } catch { /* ignore */ }

    // Keep the streak + estimated-level chips current whenever state changes.
    const streakChip = doc.getElementById("streak");
    const levelChip = doc.getElementById("level");
    const allTopics = global.MTT.session.quizableTopics(global.MTT.content);
    store.subscribe(syncHeader);

    // The level chip opens the progress view.
    if (levelChip) {
      levelChip.setAttribute("role", "button");
      levelChip.setAttribute("tabindex", "0");
      const openProgress = () => router.navigate("progress");
      levelChip.addEventListener("click", openProgress);
      levelChip.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openProgress(); }
      });
    }

    function syncHeader() {
      if (gradeSelect) gradeSelect.value = String(store.settings().grade);
      if (soundToggle) soundToggle.checked = store.settings().sound;
      if (streakChip) streakChip.textContent = "🔥 " + store.get().streak;
      if (levelChip) {
        const est = global.MTT.analytics.estimatedLevel(store.srsMap(), allTopics);
        levelChip.textContent = est.level ? "Lvl " + est.level : est.label;
        levelChip.title = est.detail;
        levelChip.setAttribute("aria-label", "Estimated level: " + est.label + ". " + est.detail);
      }
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

    function refreshPersistStatus() {
      return persist.init().then((status) => {
        ctx.persistStatus = Object.assign({}, status);
        return ctx.persistStatus;
      }).catch(() => ctx.persistStatus);
    }

    applyTheme();
    syncHeader();
    router.navigate("home");

    // After first paint, request durable storage and adopt any newer stored copy
    // (e.g. localStorage was cleared but IndexedDB or the linked file survived).
    Promise.resolve().then(async () => {
      try {
        ctx.persistStatus = await persist.init();
        const best = await persist.readBest(store.get());
        const changed = best ? store.hydrate(best) : false;
        if (changed) { syncHeader(); router.refresh(); }
        else if (router.getCurrent() === "home") router.refresh(); // reflect persist status in UI
      } catch { /* persistence is best-effort */ }
    });

    return { router, store, ctx };
  }

  const api = { boot };

  global.MTT = global.MTT || {};
  global.MTT.app = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
