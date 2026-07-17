/* ui/views/progress.js - the progress / analytics view.
 *
 * A local-only read of how the learner is doing: estimated level, overall
 * accuracy, per-grade mastery (a bar per grade up to the current grade), the
 * weakest topics with one-tap practice, and a recent-misses list for
 * deliberate review. Derived from the SRS card map via core/analytics.js and
 * the miss log in core/state.js - nothing is sent anywhere.
 *
 * Public surface: global `MTT.ui.views.progress`.
 */
(function (global) {
  "use strict";

  function pct(x) { return Math.round((x || 0) * 100); }

  function render(main, ctx) {
    const C = ctx.C;
    const store = ctx.store;
    const A = ctx.analytics;
    const topics = ctx.session.quizableTopics(ctx.content);
    const auralTopics = ctx.session.auralTopics(ctx.content);
    const srsMap = store.srsMap();
    const st = store.get();

    const view = C.el(`<div class="view"><h1 tabindex="-1">Your progress</h1></div>`);
    main.appendChild(view);

    const overall = A.overall(srsMap);
    if (!overall.seen) {
      view.appendChild(C.el(`<div class="card"><p class="muted" style="margin:0">No data yet. Once you've answered a few questions, this shows your estimated level, accuracy by grade, and the topics worth more practice.</p></div>`));
      view.appendChild(C.button("Start practising", () => ctx.router.navigate("quiz")));
      return;
    }

    const est = A.estimatedLevel(srsMap, topics);
    const gm = A.gradeMastery(srsMap, topics);
    const auralGm = A.gradeMastery(srsMap, auralTopics);
    const acc = overall.accuracy == null ? "—" : pct(overall.accuracy) + "%";

    view.appendChild(C.el(`
      <div class="stats-row">
        <div class="stat"><div class="stat-num">${est.level ? "Lvl " + est.level : est.label}</div><div class="stat-lbl">estimated level</div></div>
        <div class="stat"><div class="stat-num">${acc}</div><div class="stat-lbl">overall accuracy</div></div>
        <div class="stat"><div class="stat-num">🔥 ${st.streak}</div><div class="stat-lbl">day streak</div></div>
        <div class="stat"><div class="stat-num">${st.totalAnswered || 0}</div><div class="stat-lbl">answered</div></div>
      </div>`));
    view.appendChild(C.el(`<p class="muted" style="margin:-8px 0 18px">${est.detail}</p>`));

    // Per-grade mastery bars, up to the current grade.
    const maxGrade = st.settings.grade || 4;
    const card = C.el(`<div class="card"><h3 style="margin-top:0">By grade</h3></div>`);
    for (let g = 1; g <= maxGrade; g++) {
      const m = gm[g];
      if (!m) continue;
      const seen = m.seen > 0;
      const mastery = seen ? pct(m.mastery) : 0;
      const detail = seen ? `${m.seen}/${m.total} topics · ${mastery}% mastery` : "not started";
      const row = C.el(`
        <div class="grade-row">
          <div class="grade-row-head">
            <span class="grade-row-name">Grade ${g}</span>
            <span class="muted grade-row-detail">${detail}</span>
          </div>
          <div class="bar" role="img" aria-label="Grade ${g} mastery ${mastery}%"><div class="bar-fill" style="width:${mastery}%"></div></div>
        </div>`);
      card.appendChild(row);
    }
    view.appendChild(card);

    // Aural mastery, by grade - kept separate from the written-theory bars
    // above since aural (listening/singing) is a distinct exam component with
    // its own pace, not gated behind the chosen theory grade.
    const auralSeen = Object.values(auralGm).some((m) => m.seen > 0);
    if (auralSeen) {
      const auralCard = C.el(`<div class="card"><h3 style="margin-top:0">Aural, by grade</h3></div>`);
      for (let g = 1; g <= 8; g++) {
        const m = auralGm[g];
        if (!m) continue;
        const seen = m.seen > 0;
        const mastery = seen ? pct(m.mastery) : 0;
        const detail = seen ? `${m.seen}/${m.total} topics · ${mastery}% mastery` : "not started";
        const row = C.el(`
          <div class="grade-row">
            <div class="grade-row-head">
              <span class="grade-row-name">Grade ${g}</span>
              <span class="muted grade-row-detail">${detail}</span>
            </div>
            <div class="bar" role="img" aria-label="Grade ${g} aural mastery ${mastery}%"><div class="bar-fill" style="width:${mastery}%"></div></div>
          </div>`);
        auralCard.appendChild(row);
      }
      view.appendChild(auralCard);
    }

    // Weakest topics, with one-tap practice.
    const allTopics = topics.concat(auralTopics);
    const weak = A.weakAreas(srsMap, allTopics, 5);
    if (weak.length) {
      const fc = C.el(`<div class="card focus-card"><h3 style="margin-top:0">Focus areas</h3><p class="muted" style="margin-top:0">Your weakest topics - tap to practise one.</p></div>`);
      const row = C.el(`<div class="focus-chips"></div>`);
      weak.forEach((w) => {
        const topic = allTopics.find((t) => t.id === w.id);
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "focus-chip";
        const a = w.accuracy == null ? "" : ` · ${pct(w.accuracy)}%`;
        chip.innerHTML = `${w.title} <span class="muted">(G${w.grade}${a})</span>`;
        chip.setAttribute("aria-label", `Practise ${w.title}, Grade ${w.grade}`);
        chip.addEventListener("click", () => ctx.router.navigate("quiz", { single: topic }));
        row.appendChild(chip);
      });
      fc.appendChild(row);
      view.appendChild(fc);
    }

    // Recent misses: a small bounded review list (core/state.js recordMiss),
    // newest first, so the learner can go back over exactly what they got
    // wrong rather than just an aggregate accuracy number.
    const misses = st.misses || [];
    if (misses.length) {
      const mc = C.el(`<div class="card misses-card"><h3 style="margin-top:0">Recent misses</h3><p class="muted" style="margin-top:0">Questions you got wrong recently - worth another look.</p></div>`);
      const list = C.el(`<div class="miss-list"></div>`);
      misses.forEach((m) => {
        list.appendChild(C.el(`
          <div class="miss-row">
            <div class="miss-row-head"><span>Grade ${m.grade} · ${escapeHtml(m.topicTitle)}</span></div>
            <p class="miss-prompt">${escapeHtml(m.prompt)}</p>
            <p class="miss-answers">You said: <b>${escapeHtml(m.yourAnswer)}</b> · Correct: <b>${escapeHtml(m.correctAnswer)}</b></p>
          </div>`));
      });
      mc.appendChild(list);
      view.appendChild(mc);
    }

    view.appendChild(C.button("Back home", () => ctx.router.navigate("home"), { className: "ghost" }));
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  const api = { render };

  global.MTT = global.MTT || {};
  global.MTT.ui = global.MTT.ui || {};
  global.MTT.ui.views = global.MTT.ui.views || {};
  global.MTT.ui.views.progress = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
