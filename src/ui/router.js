/* ui/router.js - view routing for the single-page shell.
 *
 * A tiny hash-free router: tabs map to named view render functions, each of which
 * fills the <main> element. Switching a tab updates the nav button states
 * (active + aria-current), announces the change for screen readers, and moves
 * focus to the new view heading so keyboard users land in the right place.
 *
 * Public surface: global `MTT.ui.router` (a factory).
 */
(function (global) {
  "use strict";

  const C = () => global.MTT.ui.components;

  function create(opts) {
    const main = opts.mainEl;
    const navButtons = opts.navButtons || [];
    const views = {};
    let ctx = null;
    let current = null;

    function register(name, fn) { views[name] = fn; }
    function setContext(c) { ctx = c; }
    function getCurrent() { return current; }

    function navigate(name, arg) {
      if (!views[name]) return;
      current = name;
      navButtons.forEach((b) => {
        const on = b.dataset.tab === name;
        b.classList.toggle("active", on);
        if (on) b.setAttribute("aria-current", "page");
        else b.removeAttribute("aria-current");
      });
      C().clear(main);
      views[name](main, ctx, arg);
      // Move focus to the first heading of the new view (keyboard orientation).
      const heading = main.querySelector("h1, h2");
      if (heading) C().focus(heading);
    }

    // Re-render the current view in place (e.g. after a settings change).
    function refresh() {
      if (current) navigate(current);
    }

    return { register, setContext, navigate, refresh, getCurrent };
  }

  const api = { create };

  global.MTT = global.MTT || {};
  global.MTT.ui = global.MTT.ui || {};
  global.MTT.ui.router = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
