/* core/storage.js - versioned persistence, migration and backup/restore.
 *
 * Persisted state lives under a single localStorage key. A `stateVersion` field
 * lets the app evolve the shape over time without losing a returning learner's
 * progress: on load, legacy data is run forward through a migration pipeline to
 * the current shape. Anything unreadable falls back to clean defaults rather
 * than crashing.
 *
 * Backup/restore is local-file based (no server): exportJSON serialises state;
 * importJSON validates and migrates an uploaded file, with clear errors.
 *
 * The localStorage key is intentionally unchanged from v1 ("mtt.v1") so existing
 * users' saved progress is found and migrated, not orphaned.
 *
 * `localStorage` is injected (defaults to the global) so tests can use a fake.
 *
 * Public surface: global `MTT.storage`.
 */
(function (global) {
  "use strict";

  const KEY = "mtt.v1";
  const PROBE = "mtt.probe";
  const CURRENT_VERSION = 2;

  const srs = () => global.MTT.srs;

  function defaultState() {
    return {
      stateVersion: CURRENT_VERSION,
      streak: 0,
      bestStreak: 0,
      daysPracticed: 0,
      lastDay: null,
      totalAnswered: 0,
      srs: {}, // topicId -> Card (see core/srs.js)
      settings: { sound: true, grade: 4, mode: "daily", reducedMotion: false, theme: "system" },
    };
  }

  function getStore(store) {
    if (store) return store;
    try {
      return global.localStorage || null;
    } catch {
      return null;
    }
  }

  // Does persistence actually work here? (Some browsers refuse to persist for
  // file:// pages, which would silently lose streaks.)
  function probe(store) {
    const s = getStore(store);
    if (!s) return false;
    try {
      s.setItem(PROBE, "1");
      s.removeItem(PROBE);
      return true;
    } catch {
      return false;
    }
  }

  // --- Migration pipeline --------------------------------------------------
  // Each step takes the previous-shape object and returns the next-shape object.

  const MIGRATIONS = {
    // v1 (no stateVersion): { boxes:{id:int}, lastSeen:{id:ts}, ... } ->
    // v2: { srs:{ id: Card }, stateVersion:2 }.
    1: function migrateV1toV2(old) {
      const S = srs();
      const next = Object.assign(defaultState(), {
        streak: old.streak || 0,
        bestStreak: old.bestStreak || 0,
        daysPracticed: old.daysPracticed || 0,
        lastDay: old.lastDay || null,
        totalAnswered: old.totalAnswered || 0,
      });
      next.settings = Object.assign(defaultState().settings, old.settings || {});
      next.srs = {};
      const boxes = old.boxes || {};
      const lastSeen = old.lastSeen || {};
      Object.keys(boxes).forEach((id) => {
        const box = S.clampBox(boxes[id] || 0);
        const card = S.defaultCard();
        card.box = box;
        // Legacy data tracked only box + lastSeen; approximate the rest so the
        // box (the meaningful Leitner progress) and scheduling survive.
        card.seen = Math.max(1, box);
        card.correct = box;
        card.lastSeen = lastSeen[id] || null;
        card.dueAt = card.lastSeen ? card.lastSeen + S.intervalMs(box) : null;
        next.srs[id] = card;
      });
      next.stateVersion = 2;
      return next;
    },
  };

  // Run raw stored data forward to the current version.
  function migrate(raw) {
    if (!raw || typeof raw !== "object") return defaultState();
    let data = raw;
    let version = Number.isInteger(data.stateVersion) ? data.stateVersion : 1;
    let guard = 0;
    while (version < CURRENT_VERSION && guard++ < 20) {
      const step = MIGRATIONS[version];
      if (!step) break;
      data = step(data);
      version = data.stateVersion || version + 1;
    }
    return normalize(data);
  }

  // Merge onto defaults so a partial or hand-edited object never has missing keys.
  function normalize(data) {
    const out = Object.assign(defaultState(), data || {});
    out.settings = Object.assign(defaultState().settings, (data && data.settings) || {});
    out.srs = (data && typeof data.srs === "object" && data.srs) || {};
    out.stateVersion = CURRENT_VERSION;
    if (![1, 2, 3, 4, 5, 6, 7, 8].includes(out.settings.grade)) out.settings.grade = 4;
    if (out.settings.mode !== "path") out.settings.mode = "daily";
    if (!["light", "dark", "system"].includes(out.settings.theme)) out.settings.theme = "system";
    return out;
  }

  function load(store) {
    const s = getStore(store);
    if (!s) return defaultState();
    try {
      const raw = JSON.parse(s.getItem(KEY));
      if (!raw) return defaultState();
      return migrate(raw);
    } catch {
      return defaultState(); // corruption-safe
    }
  }

  function save(state, store) {
    const s = getStore(store);
    if (!s) return false;
    try {
      s.setItem(KEY, JSON.stringify(state));
      return true;
    } catch {
      return false;
    }
  }

  // --- Backup / restore ----------------------------------------------------

  function exportJSON(state) {
    return JSON.stringify(state, null, 2);
  }

  // Minimal structural check that an uploaded object is plausibly our state.
  function validateImport(obj) {
    if (!obj || typeof obj !== "object") return "Not a JSON object.";
    const looksLikeState =
      "srs" in obj || "boxes" in obj || "streak" in obj || "settings" in obj;
    if (!looksLikeState) return "This file doesn't look like saved progress.";
    return null;
  }

  /**
   * Parse + validate + migrate an uploaded backup.
   * @returns {{ ok: true, state: object } | { ok: false, error: string }}
   */
  function importJSON(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, error: "That file isn't valid JSON." };
    }
    const err = validateImport(parsed);
    if (err) return { ok: false, error: err };
    try {
      return { ok: true, state: migrate(parsed) };
    } catch {
      return { ok: false, error: "That backup couldn't be restored (unexpected shape)." };
    }
  }

  const api = {
    KEY, CURRENT_VERSION, MIGRATIONS,
    defaultState, probe, migrate, normalize, load, save,
    exportJSON, importJSON, validateImport,
  };

  global.MTT = global.MTT || {};
  global.MTT.storage = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
