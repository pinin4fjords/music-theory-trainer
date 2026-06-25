/* ui/views/reference.js - the look-up reference.
 *
 * Presents the curriculum's facts in reference form (tables + glossaries) with a
 * single search box that filters rows across every section, so a learner can
 * look something up directly instead of only meeting it in a drill.
 *
 * Public surface: global `MTT.ui.views.reference`.
 */
(function (global) {
  "use strict";

  function matches(section, q) {
    if (!q) return section;
    const needle = q.toLowerCase();
    const hit = (s) => String(s).toLowerCase().includes(needle);
    if (section.type === "table") {
      const rows = section.rows.filter((r) => r.some(hit) || hit(section.title));
      return rows.length ? Object.assign({}, section, { rows }) : null;
    }
    const items = section.items.filter((it) => hit(it.term) || hit(it.def) || hit(section.title));
    return items.length ? Object.assign({}, section, { items }) : null;
  }

  function render(main, ctx) {
    const C = ctx.C;
    const sections = ctx.content.reference || [];

    const view = C.el(`
      <div class="view">
        <h1 tabindex="-1">Reference</h1>
        <p class="muted">Look anything up. Type to filter across every table.</p>
        <input type="search" id="ref-search" class="ref-search" placeholder="Search - e.g. dolce, 6/8, dominant, E major" aria-label="Search the reference">
        <div id="ref-results"></div>
      </div>`);
    main.appendChild(view);

    const input = view.querySelector("#ref-search");
    const results = view.querySelector("#ref-results");

    function draw(q) {
      C.clear(results);
      const shown = sections.map((s) => matches(s, q)).filter(Boolean);
      if (!shown.length) {
        results.appendChild(C.el(`<p class="muted">No matches for "${escapeHtml(q)}".</p>`));
        return;
      }
      shown.forEach((s) => results.appendChild(sectionEl(s)));
    }

    function sectionEl(s) {
      const card = C.el(`<div class="card ref-section"><h3 style="margin-top:0">${s.title}</h3></div>`);
      if (s.type === "table") {
        const head = s.columns.map((c) => `<th>${c}</th>`).join("");
        const body = s.rows.map((r) => `<tr>${r.map((cell, i) => `<td${i === 0 ? ' class="ref-key"' : ""}>${cell}</td>`).join("")}</tr>`).join("");
        const wrap = C.el(`<div class="ref-table-wrap"><table class="ref-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`);
        card.appendChild(wrap);
      } else {
        const items = s.items.map((it) => `<div class="ref-term"><dt>${it.term}</dt><dd>${it.def}</dd></div>`).join("");
        card.appendChild(C.el(`<dl class="ref-glossary">${items}</dl>`));
      }
      return card;
    }

    function escapeHtml(str) {
      return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    input.addEventListener("input", () => draw(input.value.trim()));
    draw("");
  }

  const api = { render, matches };

  global.MTT = global.MTT || {};
  global.MTT.ui = global.MTT.ui || {};
  global.MTT.ui.views = global.MTT.ui.views || {};
  global.MTT.ui.views.reference = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
