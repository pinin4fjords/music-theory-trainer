/* ui/views/reference.js - the look-up reference.
 *
 * A grouped menu of sections (left) and a content pane (right): pick a section to
 * read it, rather than scrolling one monolith. A search box filters across every
 * section at once; clearing it returns to the selected section.
 *
 * Sections come from `MTT.content.reference` (each with a `group` for the menu),
 * built from the same data the drills use.
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

  function esc(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function render(main, ctx, arg) {
    const C = ctx.C;
    const sections = ctx.content.reference || [];
    const wanted = typeof arg === "string" ? arg : null;
    const selectedId = (wanted && sections.some((s) => s.id === wanted)) ? wanted
      : (sections.length ? sections[0].id : null);

    const view = C.el(`
      <div class="view">
        <h1 tabindex="-1">Reference</h1>
        <p class="muted">Pick a topic, or search to filter across everything.</p>
        <input type="search" id="ref-search" class="ref-search" placeholder="Search - e.g. dolce, 6/8, dominant, E major" aria-label="Search the reference">
        <div class="ref-layout">
          <nav class="ref-menu" id="ref-menu" aria-label="Reference topics"></nav>
          <div class="ref-content" id="ref-content" aria-live="polite"></div>
        </div>
      </div>`);
    main.appendChild(view);

    const menu = view.querySelector("#ref-menu");
    const content = view.querySelector("#ref-content");
    const input = view.querySelector("#ref-search");

    // Build the grouped menu.
    const groups = [];
    sections.forEach((s) => {
      let g = groups.find((x) => x.name === s.group);
      if (!g) { g = { name: s.group || "Reference", items: [] }; groups.push(g); }
      g.items.push(s);
    });
    groups.forEach((g) => {
      menu.appendChild(C.el(`<div class="ref-menu-group">${g.name}</div>`));
      g.items.forEach((s) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "ref-menu-item" + (s.id === selectedId ? " active" : "");
        b.dataset.id = s.id;
        b.textContent = s.title;
        // Navigate so the URL reflects the section (linkable + back-button).
        b.addEventListener("click", () => ctx.router.navigate("reference", s.id));
        menu.appendChild(b);
      });
    });

    function markActive() {
      [...menu.querySelectorAll(".ref-menu-item")].forEach((b) => {
        const on = b.dataset.id === selectedId && !input.value.trim();
        b.classList.toggle("active", on);
        if (on) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current");
      });
    }

    function sectionEl(s) {
      const card = C.el(`<div class="card ref-section"><h3 style="margin-top:0">${s.title}</h3></div>`);
      if (s.type === "table") {
        const head = s.columns.map((c) => `<th>${c}</th>`).join("");
        const body = s.rows.map((r) => `<tr>${r.map((cell, i) => `<td${i === 0 ? ' class="ref-key"' : ""}>${cell}</td>`).join("")}</tr>`).join("");
        card.appendChild(C.el(`<div class="ref-table-wrap"><table class="ref-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`));
      } else {
        const items = s.items.map((it) => `<div class="ref-term"><dt>${it.term}</dt><dd>${it.def}</dd></div>`).join("");
        card.appendChild(C.el(`<dl class="ref-glossary">${items}</dl>`));
      }
      return card;
    }

    function showSection(s) {
      C.clear(content);
      if (s) content.appendChild(sectionEl(s));
    }

    function showSearch(q) {
      C.clear(content);
      const shown = sections.map((s) => matches(s, q)).filter(Boolean);
      if (!shown.length) {
        content.appendChild(C.el(`<p class="muted">No matches for "${esc(q)}".</p>`));
        return;
      }
      content.appendChild(C.el(`<p class="muted ref-result-count">${shown.length} section${shown.length === 1 ? "" : "s"} match "${esc(q)}".</p>`));
      shown.forEach((s) => content.appendChild(sectionEl(s)));
    }

    input.addEventListener("input", () => {
      const q = input.value.trim();
      markActive();
      if (q) showSearch(q);
      else showSection(sections.find((s) => s.id === selectedId));
    });

    if (selectedId) showSection(sections.find((s) => s.id === selectedId));
  }

  const api = { render, matches };

  global.MTT = global.MTT || {};
  global.MTT.ui = global.MTT.ui || {};
  global.MTT.ui.views = global.MTT.ui.views || {};
  global.MTT.ui.views.reference = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
