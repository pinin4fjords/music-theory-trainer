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

  // Open an explainer in a floating panel without leaving the current view.
  // Returns { body, close } where `body` is the container to render into and
  // `close()` tears down the overlay and returns focus to the trigger element.
  function openExplainerModal(trigger) {
    const overlay = document.createElement("div");
    overlay.className = "explainer-modal-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Explainer");

    const panel = document.createElement("div");
    panel.className = "explainer-modal-panel";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "explainer-modal-close btn ghost";
    closeBtn.setAttribute("aria-label", "Close explainer");
    closeBtn.textContent = "✕";

    const body = document.createElement("div");
    body.className = "explainer-modal-body";

    panel.appendChild(closeBtn);
    panel.appendChild(body);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    function close() {
      overlay.remove();
      if (trigger) { try { trigger.focus(); } catch { /* ignore */ } }
    }

    closeBtn.addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    overlay.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } });

    return { body, close };
  }

  // A pitch meter for aural singing tasks. Shows target note, a needle that
  // tracks detected pitch, and colour feedback (on/off pitch).
  // Call meter.update({ midi, cents, clarity }) on each detector frame.
  // Call meter.setTarget(noteName) to label what the user should sing.
  // Pass options.levelOnly=true for sequence mode where no single target exists:
  // the ♭/♯ labels are hidden and the meter acts as a plain recording-level bar.
  function pitchMeter(targetName, options) {
    const levelOnly = options && options.levelOnly;
    const wrap = document.createElement("div");
    wrap.className = "pitch-meter" + (levelOnly ? " pitch-meter-level" : "");
    wrap.setAttribute("aria-label", levelOnly ? "Recording level" : "Pitch meter");
    const lowLabel  = levelOnly ? "" : "♭ too low";
    const highLabel = levelOnly ? "" : "too high ♯";
    const centerLabel = levelOnly ? "Level" : (targetName || "?");
    wrap.innerHTML =
      `<div class="pitch-meter-labels"><span class="pitch-low">${lowLabel}</span><span class="pitch-target-label">${centerLabel}</span><span class="pitch-high">${highLabel}</span></div>`
      + `<div class="pitch-bar" role="meter" aria-label="${levelOnly ? "Recording level" : "Pitch accuracy in cents"}" aria-valuemin="-50" aria-valuemax="50" aria-valuenow="0">`
      + `  <div class="pitch-zone good"></div>`
      + `  <div class="pitch-needle" aria-hidden="true"></div>`
      + `</div>`
      + `<div class="pitch-reading">–</div>`;

    const bar = wrap.querySelector(".pitch-bar");
    const needle = wrap.querySelector(".pitch-needle");
    const reading = wrap.querySelector(".pitch-reading");

    wrap.update = function ({ midi, cents, clarity }) {
      if (midi == null || clarity < (global.MTT.audioInput && global.MTT.audioInput.MIN_CLARITY || 0.85)) {
        needle.className = "pitch-needle";
        needle.style.left = "50%";
        reading.textContent = "–";
        bar.setAttribute("aria-valuenow", "0");
        return;
      }
      const clamped = Math.max(-50, Math.min(50, cents));
      const pct = 50 + (clamped / 50) * 46;
      needle.style.left = pct + "%";
      const onPitch = Math.abs(cents) < 25;
      needle.className = "pitch-needle" + (onPitch ? " on-pitch" : " off-pitch");
      const midiName = global.MTT.audioInput ? global.MTT.audioInput.midiToName(midi) : String(midi);
      reading.textContent = midiName + (cents >= 0 ? "+" : "") + cents + "¢";
      bar.setAttribute("aria-valuenow", clamped);
    };

    wrap.setTarget = function (name) {
      wrap.querySelector(".pitch-target-label").textContent = name || "?";
    };

    return wrap;
  }

  const api = { el, clear, announce, ensureLiveRegion, focus, cardButton, button, playButton, openExplainerModal, pitchMeter };

  global.MTT = global.MTT || {};
  global.MTT.ui = global.MTT.ui || {};
  global.MTT.ui.components = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
