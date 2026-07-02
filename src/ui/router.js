/* ui/router.js - hash-based view routing for the single-page shell.
 *
 * Tabs (and in-app links) map to named view render functions, each of which fills
 * the <main> element. The URL hash reflects the current page - `#reference/keys`,
 * `#explore/harmonic-series`, `#learn/g4-key-signatures` - so individual pages are
 * linkable and the browser back/forward buttons work. Hash routing needs no
 * server, so it works on GitHub Pages and over file://.
 *
 * navigate(name, arg): arg may be a STRING id (encoded into the hash and passed to
 * the view as its param) or an OBJECT (rich, internal-only args like a quiz's
 * { single } - not hash-encoded). Switching also updates the nav button states,
 * announces the change, and moves focus to the new heading.
 *
 * Public surface: global `MTT.ui.router` (a factory).
 */
(function (global) {
  "use strict";

  const C = () => global.MTT.ui.components;

  function create(opts) {
    const main = opts.mainEl;
    const navButtons = opts.navButtons || [];
    const win = opts.window || global;
    const views = {};
    let ctx = null;
    let current = null;
    let currentParam = null;
    let lastHash = null; // the hash we last wrote, to distinguish our own changes

    function register(name, fn) { views[name] = fn; }
    function setContext(c) { ctx = c; }
    function getCurrent() { return current; }
    function getParam() { return currentParam; }

    function hashFor(name, arg) {
      const id = typeof arg === "string" ? arg : "";
      return "#" + name + (id ? "/" + encodeURIComponent(id) : "");
    }

    function setHash(name, arg) {
      const loc = win.location;
      if (!loc) return;
      const target = hashFor(name, arg);
      lastHash = target;
      if (loc.hash !== target) loc.hash = target;
    }

    function navigate(name, arg) {
      if (!views[name]) return;
      current = name;
      currentParam = typeof arg === "string" ? arg : null;
      navButtons.forEach((b) => {
        const on = b.dataset.tab === name;
        b.classList.toggle("active", on);
        if (on) b.setAttribute("aria-current", "page");
        else b.removeAttribute("aria-current");
      });
      setHash(name, arg);
      C().clear(main);
      views[name](main, ctx, arg);
      const heading = main.querySelector("h1, h2");
      if (heading) C().focus(heading);
    }

    function refresh() {
      if (current) navigate(current, currentParam);
    }

    // Parse the current hash and navigate to it (defaults to home).
    // "quiz" is not restored on refresh — quiz sessions don't survive a page reload.
    function fromHash() {
      const raw = (win.location && win.location.hash || "").replace(/^#/, "");
      if (!raw) { navigate("home"); return; }
      const slash = raw.indexOf("/");
      const name = slash === -1 ? raw : raw.slice(0, slash);
      const param = slash === -1 ? null : decodeURIComponent(raw.slice(slash + 1));
      if (name === "quiz") { navigate("home"); return; }
      if (views[name]) navigate(name, param);
      else navigate("home");
    }

    // React to back/forward and manual hash edits (but not our own writes, and
    // not on stale routers whose <main> has been detached - e.g. across test boots
    // that share one window).
    function onHashChange() {
      if (main && main.ownerDocument && !main.ownerDocument.contains(main)) return;
      const h = (win.location && win.location.hash) || "";
      if (h === lastHash) return; // our own change
      fromHash();
    }
    if (win.addEventListener) win.addEventListener("hashchange", onHashChange);

    return { register, setContext, navigate, refresh, getCurrent, getParam, fromHash };
  }

  const api = { create };

  global.MTT = global.MTT || {};
  global.MTT.ui = global.MTT.ui || {};
  global.MTT.ui.router = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
