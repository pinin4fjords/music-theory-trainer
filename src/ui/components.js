/* ui/components.js - reusable UI primitives.
 *
 * Small, dependency-free DOM helpers shared by the views. The accessibility
 * behaviours live here so every view inherits them: an ARIA-live region for
 * announcements, keyboard-operable "card" buttons, and focus helpers.
 *
 * Public surface: global `MTT.ui.components`.
 */
(function (global) {
  "use strict";

  function el(html) {
    const d = document.createElement("div");
    d.innerHTML = String(html).trim();
    return d.firstChild;
  }

  function clear(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  // A single persistent ARIA-live region used for all announcements (answer
  // feedback, view changes). polite by default; assertive for urgent updates.
  let liveRegion = null;
  function ensureLiveRegion() {
    if (liveRegion && document.body.contains(liveRegion)) return liveRegion;
    liveRegion = document.getElementById("a11y-live");
    if (!liveRegion) {
      liveRegion = el(`<div id="a11y-live" class="sr-only" aria-live="polite" aria-atomic="true"></div>`);
      document.body.appendChild(liveRegion);
    }
    return liveRegion;
  }

  function announce(message, assertive) {
    const region = ensureLiveRegion();
    region.setAttribute("aria-live", assertive ? "assertive" : "polite");
    // Clear then set on the next frame so repeated identical messages re-announce.
    region.textContent = "";
    const set = () => { region.textContent = message; };
    if (global.requestAnimationFrame) global.requestAnimationFrame(set);
    else set();
  }

  function focus(node) {
    if (!node) return;
    if (!node.hasAttribute("tabindex") && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(node.tagName)) {
      node.setAttribute("tabindex", "-1");
    }
    try { node.focus(); } catch { /* focus can throw on detached nodes */ }
  }

  // A clickable card rendered as a real <button>, so it is keyboard-operable and
  // announced as a button. (Plain clickable <div>s are not reachable by keyboard.)
  function cardButton(innerHtml, onClick, extraClass) {
    const b = document.createElement("button");
    b.className = "card topic as-button" + (extraClass ? " " + extraClass : "");
    b.type = "button";
    b.innerHTML = innerHtml;
    b.addEventListener("click", onClick);
    return b;
  }

  function button(label, onClick, opts) {
    opts = opts || {};
    const b = document.createElement("button");
    b.className = "btn" + (opts.className ? " " + opts.className : "");
    b.type = "button";
    b.textContent = label;
    if (opts.ariaLabel) b.setAttribute("aria-label", opts.ariaLabel);
    b.addEventListener("click", onClick);
    return b;
  }

  function playButton(label, fn) {
    const b = document.createElement("button");
    b.className = "audio-btn";
    b.type = "button";
    b.innerHTML = "▶ " + label;
    b.addEventListener("click", fn);
    return b;
  }

  const api = { el, clear, announce, ensureLiveRegion, focus, cardButton, button, playButton };

  global.MTT = global.MTT || {};
  global.MTT.ui = global.MTT.ui || {};
  global.MTT.ui.components = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
