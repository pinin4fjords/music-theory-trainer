/* ui/views/learn.js - lessons browser and topic detail.
 *
 * Lists every grade and its topics as keyboard-operable cards. Selecting a topic
 * shows its "why" hook and "what" lesson, then either a "practise this topic"
 * button (for drillable topics) or a clear "coming next" note for the
 * composition/free-writing topics that aren't auto-drillable.
 *
 * Public surface: global `MTT.ui.views.learn`.
 */
(function (global) {
  "use strict";

  function isComingNext(t) {
    return typeof t.questions !== "function" || (t.tags && t.tags.indexOf("comingNext") !== -1);
  }

  function render(main, ctx, arg) {
    const C = ctx.C;

    // Deep-link: open a specific topic directly (from the hash or a link).
    const topicId = typeof arg === "string" ? arg : null;
    if (topicId) {
      for (const g of ctx.content.grades) {
        const t = g.topics.find((x) => x.id === topicId);
        if (t) { renderTopic(Object.assign({}, t, { grade: g.grade })); return; }
      }
    }

    const view = C.el(`<div class="view"><h1 tabindex="-1">Learn</h1></div>`);
    main.appendChild(view);

    ctx.content.grades.forEach((g) => {
      view.appendChild(C.el(`<h2 style="margin-top:26px">${g.title}</h2>`));
      const grid = C.el(`<div class="grid"></div>`);
      g.topics.forEach((t) => {
        const badge = isComingNext(t) ? `<span class="pill outline">coming next</span>` : "";
        const icon = global.MTT.ui.icons.iconHtml(t.id);
        const card = C.cardButton(`<div class="topic-head">${icon}<h3>${t.title}</h3>${badge}</div><div class="why">${t.why || "Coming soon."}</div>`,
          () => ctx.router.navigate("learn", t.id));
        grid.appendChild(card);
      });
      view.appendChild(grid);
    });

    function renderTopic(t) {
      C.clear(main);
      const v = C.el(`<div class="view"></div>`);
      v.appendChild(C.button("← Back", () => ctx.router.navigate("learn"), { className: "ghost" }));
      v.appendChild(C.el(`<h1 tabindex="-1" style="margin-top:14px">${t.title}</h1>`));
      if (t.why) v.appendChild(C.el(`<div class="why-box"><strong>Why:</strong> ${t.why}</div>`));
      v.appendChild(C.el(`<div class="card">${t.what || ""}</div>`));
      if (!isComingNext(t)) {
        v.appendChild(C.button("Practise this topic", () => ctx.router.navigate("quiz", { single: t })));
      } else {
        v.appendChild(C.el(`<p class="muted">This is an open-ended writing topic - guided practice for it is coming next. The related drillable topics in this grade build the underlying skills.</p>`));
      }
      // Thread into the science behind the topic.
      if (t.explainer) {
        const ex = (ctx.content.explainers || []).find((e) => e.id === t.explainer);
        if (ex) {
          const dig = document.createElement("button");
          dig.type = "button";
          dig.className = "dig-deeper";
          dig.style.marginLeft = "12px";
          dig.innerHTML = `Dig deeper: ${ex.title} <span aria-hidden="true">→</span>`;
          dig.addEventListener("click", () => {
            const m = ctx.C.openExplainerModal(dig);
            const modalCtx = Object.assign({}, ctx, {
              router: Object.assign({}, ctx.router, {
                navigate: function (view, arg) {
                  m.close();
                  if (view !== "explore" || arg) ctx.router.navigate(view, arg);
                },
              }),
            });
            global.MTT.ui.views.explainer.render(m.body, modalCtx, t.explainer);
          });
          v.appendChild(dig);
        }
      }
      main.appendChild(v);
      C.focus(v.querySelector("h1"));
    }
  }

  const api = { render };

  global.MTT = global.MTT || {};
  global.MTT.ui = global.MTT.ui || {};
  global.MTT.ui.views = global.MTT.ui.views || {};
  global.MTT.ui.views.learn = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
