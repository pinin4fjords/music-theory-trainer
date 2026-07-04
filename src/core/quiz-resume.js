/* core/quiz-resume.js - sessionStorage snapshot for resuming an interrupted quiz.
 *
 * A quiz session's state (topic pool, progress, running score) lives only in
 * ui/views/quiz.js's render closure, so a refresh or back-navigation normally
 * loses it outright. This module persists just enough to reconstruct the exact
 * same session deterministically: the RNG seed, a snapshot of the SRS map
 * frozen at session start (so later answers, which update the live SRS map,
 * can't change topic selection if the session is rebuilt on resume), and the
 * learner's progress - all under a single sessionStorage key.
 *
 * sessionStorage (not localStorage) is deliberate: it survives a refresh but
 * clears when the tab closes, matching "resume where I left off" rather than
 * "resurrect a session from last week".
 *
 * `sessionStorage` is injected (defaults to the global) so tests can use a fake.
 *
 * Public surface: global `MTT.quizResume`.
 */
(function (global) {
  "use strict";

  const KEY = "mtt.quiz-resume.v1";

  function getStore(store) {
    if (store) return store;
    try {
      return global.sessionStorage || null;
    } catch {
      return null;
    }
  }

  function save(snapshot, store) {
    const s = getStore(store);
    if (!s) return false;
    try {
      s.setItem(KEY, JSON.stringify(snapshot));
      return true;
    } catch {
      return false;
    }
  }

  function load(store) {
    const s = getStore(store);
    if (!s) return null;
    try {
      const raw = JSON.parse(s.getItem(KEY));
      return raw && typeof raw === "object" ? raw : null;
    } catch {
      return null; // corruption-safe
    }
  }

  function clear(store) {
    const s = getStore(store);
    if (!s) return;
    try { s.removeItem(KEY); } catch { /* ok */ }
  }

  const api = { KEY, save, load, clear };

  global.MTT = global.MTT || {};
  global.MTT.quizResume = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
