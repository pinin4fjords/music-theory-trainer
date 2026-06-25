/* ui/views/home.js - the landing view.
 *
 * The daily-practice front door: streak + totals, a "focus areas" panel that
 * surfaces the learner's weakest topics (local analytics), the practice mode
 * toggle (mixed daily review vs a learning path that leads with the current
 * grade), quick links into the other sections, and local backup/restore.
 *
 * Public surface: global `MTT.ui.views.home`.
 */
(function (global) {
  "use strict";

  function render(main, ctx) {
    const C = ctx.C;
    const store = ctx.store;
    const st = store.get();
    const done = store.doneToday(ctx.now());
    const mode = st.settings.mode || "daily";

    const warn = store.storageOK ? "" :
      `<div class="why-box" role="alert" style="background:#fbe6df">⚠ This browser isn't saving progress to disk (common when opening the file directly). Your streak will reset when you close it - use <b>Back up</b> below to save a file you can restore, or open the hosted version.</div>`;

    const view = C.el(`
      <div class="view">
        <div class="hero">
          <h1 tabindex="-1">A few minutes of theory a day</h1>
          <p>Graded music theory, grounded in <i>why</i> as well as <i>what</i>. Set your grade and the daily session follows.</p>
        </div>
        <p class="disclaimer">A personal toy project, shared as-is with <b>absolutely no warranty</b>. Not affiliated with any exam board, not guaranteed correct, and not to be blamed if an exam goes badly. Use at your own risk.</p>
        ${warn}
        <div class="stats-row">
          <div class="stat"><div class="stat-num">🔥 ${st.streak}</div><div class="stat-lbl">day streak</div></div>
          <div class="stat"><div class="stat-num">${st.bestStreak || 0}</div><div class="stat-lbl">best streak</div></div>
          <div class="stat"><div class="stat-num">${st.daysPracticed || 0}</div><div class="stat-lbl">days practised</div></div>
          <div class="stat"><div class="stat-num">${st.totalAnswered || 0}</div><div class="stat-lbl">questions answered</div></div>
        </div>
        <div class="card center start-card">
          <div class="mode-toggle" role="group" aria-label="Practice mode">
            <button type="button" data-mode="daily" class="${mode === "daily" ? "on" : ""}" aria-pressed="${mode === "daily"}">Daily mix</button>
            <button type="button" data-mode="path" class="${mode === "path" ? "on" : ""}" aria-pressed="${mode === "path"}">Learning path</button>
          </div>
          <p class="muted mode-blurb">${mode === "path"
            ? "Learning path: leads with your current grade's topics, with weak earlier topics mixed in."
            : "Daily mix: spaced review across your current grade and everything below it."}</p>
          <p class="muted" style="margin-top:0">${done ? "Today's practice is done - come back tomorrow to keep the streak going." : "Ready for today's set?"}</p>
        </div>
        <div id="focus-area"></div>
        <div class="grid" id="home-cards"></div>
        <p class="muted backup-line">Progress is saved in this browser.
          <button class="linkish" id="backup" type="button">Back up to a file</button> ·
          <button class="linkish" id="restore" type="button">Restore</button></p>
        <input type="file" id="restore-file" accept="application/json" hidden>
      </div>`);
    main.appendChild(view);

    // Start button.
    const startWrap = view.querySelector(".start-card");
    const startBtn = C.button(done ? "Practise again" : "Start today's practice", () => ctx.router.navigate("quiz"));
    startWrap.appendChild(startBtn);

    // Mode toggle.
    view.querySelectorAll(".mode-toggle button").forEach((b) => {
      b.addEventListener("click", () => {
        store.setSetting("mode", b.dataset.mode);
        ctx.router.refresh();
      });
    });

    // Focus areas (weak topics).
    const topics = ctx.session.quizableTopics(ctx.content);
    const weak = ctx.analytics.weakAreas(store.srsMap(), topics, 3);
    if (weak.length) {
      const panel = C.el(`<div class="card focus-card"><h3 style="margin-top:0">Focus areas</h3>
        <p class="muted" style="margin-top:0">Topics worth another look, based on your answers.</p></div>`);
      const row = C.el(`<div class="focus-chips"></div>`);
      weak.forEach((w) => {
        const topic = topics.find((t) => t.id === w.id);
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "focus-chip";
        const pct = w.accuracy == null ? "" : ` · ${Math.round(w.accuracy * 100)}%`;
        chip.innerHTML = `${w.title}<span class="muted"> (Grade ${w.grade}${pct})</span>`;
        chip.setAttribute("aria-label", `Practise ${w.title}, Grade ${w.grade}`);
        chip.addEventListener("click", () => ctx.router.navigate("quiz", { single: topic }));
        row.appendChild(chip);
      });
      panel.appendChild(row);
      view.querySelector("#focus-area").appendChild(panel);
    }

    // Quick links.
    const cards = view.querySelector("#home-cards");
    [["📚", "Learn", "Lessons by grade", "learn"],
      ["💡", "Why", "Interactive explainers", "explore"],
      ["🎹", "Playground", "Build & hear it", "play"]].forEach(([icon, title, sub, tab]) => {
      const c = C.cardButton(`<div style="font-size:1.8rem" aria-hidden="true">${icon}</div><h3>${title}</h3><div class="why">${sub}</div>`,
        () => ctx.router.navigate(tab));
      cards.appendChild(c);
    });

    // Backup / restore.
    view.querySelector("#backup").addEventListener("click", () => exportProgress());
    const fileInput = view.querySelector("#restore-file");
    view.querySelector("#restore").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => importProgress(fileInput.files[0]));

    function exportProgress() {
      try {
        const blob = new Blob([store.exportJSON()], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "music-theory-progress.json";
        a.click();
        URL.revokeObjectURL(a.href);
        C.announce("Progress backed up to a file.");
      } catch {
        C.announce("Couldn't create a backup file.", true);
      }
    }

    function importProgress(file) {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const result = ctx.storage.importJSON(reader.result);
        if (!result.ok) {
          C.announce(result.error, true);
          alert(result.error);
          return;
        }
        store.restore(result.state);
        ctx.audio.setEnabled(store.settings().sound);
        ctx.syncHeader();
        ctx.router.navigate("home");
        C.announce("Progress restored.");
      };
      reader.onerror = () => alert("That file couldn't be read.");
      reader.readAsText(file);
    }
  }

  const api = { render };

  global.MTT = global.MTT || {};
  global.MTT.ui = global.MTT.ui || {};
  global.MTT.ui.views = global.MTT.ui.views || {};
  global.MTT.ui.views.home = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
