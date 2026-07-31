/* ui/views/home.js - the landing view.
 *
 * The daily-practice front door: streak + totals, a "focus areas" panel that
 * surfaces the learner's weakest learning objectives (local analytics), the practice mode
 * toggle (mixed daily review vs a learning path that leads with the current
 * grade), quick links into the other sections, and a concise save-status line.
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
    const grade = st.settings.grade;
    const sessionLength = st.settings.sessionLength || 10;
    const sessionMinutes = Math.max(3, Math.round(sessionLength / 2));

    // First-run: make grade selection an intentional moment, not header furniture.
    if (!st.settings.gradeChosen) { renderOnboarding(); return; }

    const warn = store.storageOK ? "" :
      `<div class="why-box" role="alert">⚠ This browser isn't saving progress on its own (common when opening the file directly). Open Your data in Settings to link a save file, or use the hosted version.</div>`;

    // Hide the stats panel until there's something to show (no cold zeroes).
    const showStats = (st.totalAnswered || 0) > 0;
    const statsHtml = showStats ? `
        <div class="stats-row">
          <div class="stat"><div class="stat-num">🔥 ${st.streak}</div><div class="stat-lbl">day streak</div></div>
          <div class="stat"><div class="stat-num">${st.bestStreak || 0}</div><div class="stat-lbl">best streak</div></div>
          <div class="stat"><div class="stat-num">${st.daysPracticed || 0}</div><div class="stat-lbl">days practised</div></div>
          <div class="stat"><div class="stat-num">${st.totalAnswered || 0}</div><div class="stat-lbl">questions answered</div></div>
        </div>` : "";

    function renderOnboarding() {
      const view = C.el(`
        <div class="view onboard-view">
          <section class="onboarding-shell">
            <div class="onboarding-copy">
              <p class="eyebrow">Daily music theory, Grades 1–8</p>
              <h1 tabindex="-1">Read what you hear.<br>Hear what you read.</h1>
              <p>Motif turns a few spare minutes into focused theory practice, connecting the mark on the page with the reason it sounds that way.</p>
              <div class="onboarding-staff" aria-hidden="true"><span></span><span></span><span></span></div>
            </div>
            <div class="card onboard-card">
              <p class="eyebrow">Set your starting point</p>
              <h2>What grade are you working towards?</h2>
              <p class="muted">This shapes your daily session. You can change it whenever you like.</p>
              <div class="grade-picker" role="group" aria-label="Choose your grade"></div>
              <div class="onboard-placement"><span>Not sure where to begin?</span><div id="placement-cta"></div></div>
            </div>
          </section>
        </div>`);
      main.appendChild(view);
      const picker = view.querySelector(".grade-picker");
      ctx.content.grades.forEach((g) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "grade-pick";
        b.textContent = String(g.grade);
        b.setAttribute("aria-label", "Grade " + g.grade);
        b.addEventListener("click", () => {
          store.setSetting("grade", g.grade);
          store.setSetting("gradeChosen", true);
          ctx.syncHeader();
          ctx.router.navigate("home", undefined, { force: true });
        });
        picker.appendChild(b);
      });

      // Optional placement check: a short adaptive diagnostic that suggests a
      // starting grade. The manual picker above stays the default/override.
      const placement = global.MTT.ui.views.placement;
      if (placement) {
        const cta = view.querySelector("#placement-cta");
        const btn = C.button("Take a quick placement check", () => placement.render(main, ctx), { className: "ghost" });
        cta.appendChild(btn);
      }

      C.focus(view.querySelector("h1"));
    }

    const view = C.el(`
      <div class="view home-view">
        <section class="home-hero">
          <div class="home-hero-copy">
            <p class="eyebrow">Grade ${grade} · daily practice</p>
            <h1 tabindex="-1">A few minutes of theory a day</h1>
            <p>Connect what you see, hear and understand through one focused session at a time.</p>
            <details class="project-note">
              <summary>About this project</summary>
              <p>Motif is an independent hobby project. It is not affiliated with an exam board, has not been checked by a teacher, and should not replace an official syllabus or published study materials.</p>
            </details>
          </div>
          <div class="card start-card">
            <div class="session-heading">
              <span>Today’s practice</span>
              <strong>${sessionLength} questions · ${sessionMinutes} min</strong>
            </div>
            <div class="mode-toggle" role="group" aria-label="Practice mode">
              <button type="button" data-mode="daily" class="${mode === "daily" ? "on" : ""}" aria-pressed="${mode === "daily"}">Daily mix</button>
              <button type="button" data-mode="path" class="${mode === "path" ? "on" : ""}" aria-pressed="${mode === "path"}">Learning path</button>
            </div>
            <p class="muted mode-blurb">${mode === "path"
              ? "Move through Grade " + grade + " in order, with earlier weak spots folded in."
              : "Spaced review from Grade " + grade + " and the foundations beneath it."}</p>
            <div class="start-action"></div>
            <p class="session-status">${done ? "Today’s session is complete. Extra practice will not change your streak." : "Ready when you are."}</p>
          </div>
        </section>
        <div id="resume-area"></div>
        <div id="aural-nudge-area"></div>
        <div id="focus-area"></div>
        ${warn}
        ${statsHtml}
        <section class="home-section" aria-labelledby="home-next-heading">
          <div class="section-heading">
            <div><p class="eyebrow">Keep exploring</p><h2 id="home-next-heading">Your music desk</h2></div>
            <p>Lessons, listening, reference and progress.</p>
          </div>
          <div id="home-cards" class="home-links"></div>
        </section>
        <section class="home-data-status" aria-label="Progress save status">
          <span class="home-data-dot" aria-hidden="true"></span>
          <span class="home-data-copy"><b id="home-data-title"></b><small id="home-data-detail"></small></span>
          <button class="linkish" id="manage-data" type="button">Manage in Settings</button>
        </section>
      </div>`);
    main.appendChild(view);

    // Start button.
    const startWrap = view.querySelector(".start-action");
    const startBtn = C.button(done ? "Practise again" : "Start today's practice", () => ctx.router.navigate("quiz"));
    startWrap.appendChild(startBtn);

    // Mode toggle.
    view.querySelectorAll(".mode-toggle button").forEach((b) => {
      b.addEventListener("click", () => {
        store.setSetting("mode", b.dataset.mode);
        ctx.router.refresh();
      });
    });

    // Resume banner: an interrupted quiz session left in sessionStorage - a
    // refresh or back-navigation would otherwise silently discard it.
    renderResumeBanner();
    function renderResumeBanner() {
      const area = view.querySelector("#resume-area");
      const saved = ctx.quizResume.load(ctx.sessionStore);
      if (!area || !saved || typeof saved.idx !== "number" || typeof saved.total !== "number") return;
      const panel = C.el(`
        <div class="why-box resume-box" role="note">
          <p style="margin:0 0 8px"><strong>▶ Resume your session</strong></p>
          <p style="margin:0 0 10px">${escapeHtml(saved.label || "Practice")} - question ${saved.idx + 1} of ${saved.total}, score ${saved.score}.</p>
        </div>`);
      const row = C.el(`<div style="display:flex;gap:10px;flex-wrap:wrap"></div>`);
      row.appendChild(C.button("Resume", () => ctx.router.navigate("quiz", { resume: true })));
      row.appendChild(C.button("Discard", () => {
        ctx.quizResume.clear(ctx.sessionStore);
        panel.remove();
      }, { className: "ghost" }));
      panel.appendChild(row);
      area.appendChild(panel);
    }

    // Aural due nudge: aural practice lives on its own tab, outside the daily
    // session, so due aural topics can quietly pile up. Surface a count linking
    // to the tab when any are due.
    renderAuralNudge();
    function renderAuralNudge() {
      const area = view.querySelector("#aural-nudge-area");
      if (!area) return;
      const now = ctx.now();
      const srsMap = store.srsMap();
      const due = ctx.analytics.objectiveUnits(ctx.session.auralTopics(ctx.content)).filter((objective) => {
        const c = srsMap[objective.id];
        return c && global.MTT.srs.evidence(c) > 0 && c.dueAt != null && c.dueAt <= now;
      }).length;
      if (!due) return;
      const label = due === 1
        ? "1 aural skill is due for review"
        : `${due} aural skills are due for review`;
      const panel = C.el(`<div class="why-box aural-nudge" role="note"><p style="margin:0 0 10px">👂 ${label}.</p></div>`);
      panel.appendChild(C.button("Go to Aural training", () => ctx.router.navigate("aural")));
      area.appendChild(panel);
    }

    // Focus areas (weak topics) - theory and aural topics both count, since
    // both feed the same SRS data.
    const topics = ctx.session.quizableTopics(ctx.content).concat(ctx.session.auralTopics(ctx.content));
    const weak = ctx.analytics.weakAreas(store.srsMap(), topics, 3);
    if (weak.length) {
      const panel = C.el(`<div class="card focus-card"><h3 style="margin-top:0">Focus areas</h3>
        <p class="muted" style="margin-top:0">Skills worth another look, based on your answers.</p></div>`);
      const row = C.el(`<div class="focus-chips"></div>`);
      weak.forEach((w) => {
        const topic = topics.find((t) => t.id === w.topicId);
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "focus-chip";
        const pct = w.accuracy == null ? "" : ` · ${Math.round(w.accuracy * 100)}%`;
        chip.innerHTML = `${w.title}<span class="muted"> (Grade ${w.grade}${pct})</span>`;
        chip.setAttribute("aria-label", `Practise ${w.title}, Grade ${w.grade}`);
        chip.addEventListener("click", () => ctx.router.navigate("quiz", {
          single: Object.assign({}, topic, {
            scheduledObjectiveId: w.id,
            scheduledObjective: (topic.objectives || []).find((objective) => objective.id === w.id),
          }),
        }));
        row.appendChild(chip);
      });
      panel.appendChild(row);
      view.querySelector("#focus-area").appendChild(panel);
    }

    // The desk keeps the destinations that support the next study decision.
    const cards = view.querySelector("#home-cards");
    [["learn", "Learn", "Lessons for every grade", "learn"],
      ["aural", "Aural", "Listening and singing", "aural"],
      ["reference", "Reference", "Quick lookup tables", "reference"],
      ["progress", "Progress", "Mastery and weak areas", "progress"]].forEach(([icon, title, sub, tab]) => {
      const c = C.cardButton(`${global.MTT.ui.icons.appIconHtml(icon)}<span class="home-link-copy"><h3>${title}</h3><span>${sub}</span></span><span class="home-link-arrow" aria-hidden="true">→</span>`,
        () => ctx.router.navigate(tab), "home-link");
      cards.appendChild(c);
    });

    const dataView = global.MTT.ui.views.data;
    const saveSummary = dataView.summary(ctx, store.storageOK);
    view.querySelector("#home-data-title").textContent = saveSummary.title;
    view.querySelector("#home-data-detail").textContent = saveSummary.detail;
    view.querySelector(".home-data-status").dataset.tone = saveSummary.tone;
    view.querySelector("#manage-data").addEventListener("click", () => ctx.router.navigate("data"));

    function escapeHtml(s) {
      return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

  }

  const api = { render };

  global.MTT = global.MTT || {};
  global.MTT.ui = global.MTT.ui || {};
  global.MTT.ui.views = global.MTT.ui.views || {};
  global.MTT.ui.views.home = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
