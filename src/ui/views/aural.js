/* ui/views/aural.js - dedicated aural training area.
 *
 * Shows aural topics by grade (Grades 1-8) as practisable cards,
 * separate from the main theory quiz sessions. Topics include time-signature
 * identification, spot-the-change, dynamics, articulation, tonality, singing
 * back, cadences, modulation, and style/period recognition.
 *
 * Public surface: global `MTT.ui.views.aural`.
 */
(function (global) {
  "use strict";

  function topicAccuracyChip(srsMap, topicId) {
    const card = srsMap[topicId];
    if (!card || card.seen <= 0) {
      return `<span class="pill outline aural-acc-chip" aria-label="Not practised yet">New</span>`;
    } else {
      const pct = Math.round((card.correct / card.seen) * 100);
      return `<span class="pill aural-acc-chip" aria-label="Accuracy ${pct}%">${pct}%</span>`;
    }
  }

  function render(main, ctx) {
    const C = ctx.C;
    const auralGrades = (ctx.content && ctx.content.auralGrades) || [];
    const currentGrade = ctx.store.settings().grade;
    const srsMap = ctx.store.srsMap();

    const view = C.el(
      `<div class="view">` +
        `<h1 tabindex="-1">Aural Training</h1>` +
        `<p>These listening and singing tasks are the aural component of a <b>practical exam</b> (piano, violin, and other instruments), Grades 1-8 - a separate assessment from the written theory tests practised elsewhere in this app.</p>` +
      `</div>`
    );
    main.appendChild(view);

    if (!auralGrades.length) {
      view.appendChild(C.el(`<p class="muted">Aural exercises aren't available right now. Try reloading the page.</p>`));
      return;
    }

    const orderedGrades = auralGrades
      .map((auralGrade, originalIndex) => ({ auralGrade, originalIndex }))
      .sort((a, b) => {
        const aCurrent = a.auralGrade.grade === currentGrade;
        const bCurrent = b.auralGrade.grade === currentGrade;
        if (aCurrent !== bCurrent) return aCurrent ? -1 : 1;
        return a.originalIndex - b.originalIndex;
      })
      .map((x) => x.auralGrade);

    orderedGrades.forEach(function (ag) {
      const isCurrentGrade = ag.grade === currentGrade;
      const title = ag.title || `Grade ${ag.grade}`;
      const gradeLabel = isCurrentGrade
        ? `${title} <span class="pill" style="font-size:.8em;vertical-align:middle">your grade</span>`
        : title;
      view.appendChild(C.el(`<h2 style="margin-top:28px">${gradeLabel}</h2>`));

      const grid = C.el(`<div class="grid"></div>`);
      ag.topics.forEach(function (t) {
        // Strip leading "Aural: " from the title for display.
        const shortTitle = t.title.replace(/^Aural:\s*/i, "");
        const icon = global.MTT.ui.icons.iconHtml(t.id);
        const accuracyChip = topicAccuracyChip(srsMap, t.id);
        const card = C.cardButton(
          `<div class="topic-head">${icon}<h3>${shortTitle}</h3>${accuracyChip}</div>` +
          `<div class="why">${t.why || ""}</div>`,
          function () { ctx.router.navigate("quiz", { single: Object.assign({}, t, { grade: ag.grade }) }); }
        );
        grid.appendChild(card);
      });
      view.appendChild(grid);
    });
  }

  global.MTT = global.MTT || {};
  global.MTT.ui = global.MTT.ui || {};
  global.MTT.ui.views = global.MTT.ui.views || {};
  global.MTT.ui.views.aural = { render: render };
  if (typeof module !== "undefined" && module.exports) module.exports = { render: render };
})(typeof globalThis !== "undefined" ? globalThis : this);
