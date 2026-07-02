/* ui/views/aural.js - dedicated aural training area.
 *
 * Shows aural topics by grade (Grades 1-5) as practisable cards,
 * separate from the main theory quiz sessions. Topics include time-signature
 * identification, spot-the-change, dynamics, articulation, tonality, singing
 * back, and style/period recognition.
 *
 * Public surface: global `MTT.ui.views.aural`.
 */
(function (global) {
  "use strict";

  function render(main, ctx) {
    const C = ctx.C;
    const auralGrades = (ctx.content && ctx.content.auralGrades) || [];
    const currentGrade = ctx.store.settings().grade;

    const view = C.el(
      `<div class="view">` +
        `<h1 tabindex="-1">Aural Training</h1>` +
        `<p>Practice grade aural tests independently. These listening and singing tasks are a separate part of the exam — distinct from written theory.</p>` +
      `</div>`
    );
    main.appendChild(view);

    if (!auralGrades.length) {
      view.appendChild(C.el(`<p class="muted">No aural topics loaded.</p>`));
      return;
    }

    auralGrades.forEach(function (ag) {
      const isCurrentGrade = ag.grade === currentGrade;
      const gradeLabel = isCurrentGrade
        ? `Grade ${ag.grade} <span class="pill" style="font-size:.8em;vertical-align:middle">your grade</span>`
        : `Grade ${ag.grade}`;
      view.appendChild(C.el(`<h2 style="margin-top:28px">${gradeLabel}</h2>`));

      const grid = C.el(`<div class="grid"></div>`);
      ag.topics.forEach(function (t) {
        // Strip leading "Aural: " from the title for display.
        const shortTitle = t.title.replace(/^Aural:\s*/i, "");
        const icon = global.MTT.ui.icons.iconHtml(t.id);
        const card = C.cardButton(
          `<div class="topic-head">${icon}<h3>${shortTitle}</h3></div>` +
          `<div class="why">${t.why || ""}</div>`,
          function () { ctx.router.navigate("quiz", { single: t }); }
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
