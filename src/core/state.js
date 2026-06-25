/* core/state.js - the central state store.
 *
 * A small, DOM-free model the UI talks to. It owns the loaded state object and
 * the only paths that mutate it: recording an answer (updates the SRS card and
 * totals) and recording a day of practice (advances the streak). It persists
 * through core/storage.js and notifies subscribers so the UI can refresh.
 *
 * Storage and the clock are injectable, so tests drive it deterministically with
 * a fake store and a fixed `now`.
 *
 * Public surface: global `MTT.state` (a factory; the app creates one instance).
 *   const store = MTT.state.create({ storage, now });
 */
(function (global) {
  "use strict";

  const DAY = 86400000;
  const storage = () => global.MTT.storage;
  const srs = () => global.MTT.srs;

  function dayStr(ms) {
    return new Date(ms).toISOString().slice(0, 10);
  }

  function create(opts) {
    opts = opts || {};
    const store = opts.storage || null; // null => storage uses the global localStorage
    const clock = opts.now || (() => Date.now());
    const listeners = [];

    let state = storage().load(store);
    const storageOK = storage().probe(store);

    // Stamp each save so the persistence layer can reconcile newest-wins across
    // localStorage / IndexedDB / a linked file. `onPersist` mirrors to the sturdy
    // sinks (set up by the app); hydrate() deliberately skips it.
    function persist() {
      state.savedAt = clock();
      storage().save(state, store);
      if (opts.onPersist) {
        try { opts.onPersist(state); } catch { /* mirroring must never break a save */ }
      }
    }

    // Adopt a stored copy found by the persistence layer if it is newer than what
    // we have (e.g. localStorage was cleared but IndexedDB or the linked file
    // survived). Writes through to localStorage only - never back to the sinks.
    function hydrate(candidate) {
      if (!candidate) return false;
      const at = typeof candidate.savedAt === "number" ? candidate.savedAt : 0;
      const cur = typeof state.savedAt === "number" ? state.savedAt : 0;
      if (at <= cur) return false;
      state = storage().normalize(candidate);
      storage().save(state, store);
      notify();
      return true;
    }
    function notify() {
      listeners.forEach((fn) => {
        try { fn(state); } catch { /* a listener error must not break the store */ }
      });
    }

    function subscribe(fn) {
      listeners.push(fn);
      return () => {
        const i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    }

    function get() { return state; }
    function settings() { return state.settings; }
    function srsMap() { return state.srs; }
    function cardFor(topicId) { return state.srs[topicId] || srs().defaultCard(); }

    function setSetting(key, value) {
      state.settings[key] = value;
      persist();
      notify();
    }

    /**
     * Record one answer. now defaults to the injected clock.
     * @param {string} topicId
     * @param {{ correct: boolean, responseMs?: number, now?: number }} result
     */
    function recordAnswer(topicId, result) {
      const now = result.now != null ? result.now : clock();
      state.srs[topicId] = srs().update(state.srs[topicId], {
        correct: result.correct,
        responseMs: result.responseMs,
        now,
      });
      state.totalAnswered = (state.totalAnswered || 0) + 1;
      persist();
      notify();
    }

    // Advance the daily streak. Returns true if this is the first session today.
    function recordSessionDay(now) {
      const t = now != null ? now : clock();
      const today = dayStr(t);
      if (state.lastDay === today) return false;
      const yesterday = dayStr(t - DAY);
      state.streak = state.lastDay === yesterday ? (state.streak || 0) + 1 : 1;
      state.bestStreak = Math.max(state.bestStreak || 0, state.streak);
      state.daysPracticed = (state.daysPracticed || 0) + 1;
      state.lastDay = today;
      persist();
      notify();
      return true;
    }

    function doneToday(now) {
      return state.lastDay === dayStr(now != null ? now : clock());
    }

    // Replace the entire state (restore from backup). Already migrated/validated.
    function restore(newState) {
      state = storage().normalize(newState);
      persist();
      notify();
    }

    // Wipe progress back to defaults while keeping preferences (grade, theme,
    // sound). persist() then overwrites every sink, so the linked file /
    // IndexedDB can't resurrect the old progress via reconciliation.
    function reset() {
      const keptSettings = Object.assign({}, state.settings);
      state = storage().defaultState();
      state.settings = Object.assign(state.settings, keptSettings);
      persist();
      notify();
    }

    function exportJSON() {
      return storage().exportJSON(state);
    }

    return {
      get, settings, srsMap, cardFor, subscribe,
      setSetting, recordAnswer, recordSessionDay, doneToday,
      restore, reset, hydrate, exportJSON,
      get storageOK() { return storageOK; },
    };
  }

  const api = { create, dayStr };

  global.MTT = global.MTT || {};
  global.MTT.state = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
