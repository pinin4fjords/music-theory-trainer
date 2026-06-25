/* core/persist.js - durable, backup-free persistence.
 *
 * localStorage (in core/storage.js) gives an instant synchronous load, but it can
 * be evicted by the browser and never leaves the device. This layer makes saved
 * progress sturdier and portable WITHOUT a backend:
 *
 *   1. navigator.storage.persist() - asks the browser not to evict our data.
 *   2. An IndexedDB mirror - larger, sturdier site storage than localStorage.
 *   3. An optional LINKED FILE (File System Access API): the learner picks a file
 *      once and every change auto-saves to it. Point it at a synced folder
 *      (Drive/Dropbox) and progress follows them across devices - no manual
 *      backups. The file handle is itself persisted in IndexedDB so the link
 *      survives reloads.
 *
 * On load, the newest copy across localStorage / IndexedDB / the linked file wins
 * (each save stamps `savedAt`), so a wiped localStorage recovers from IndexedDB or
 * the file. Everything degrades gracefully where an API is missing (e.g. Node,
 * Safari for the file API), falling back to the existing local store + manual
 * backup/restore.
 *
 * Backends are injectable so the reconciliation logic is unit-testable without a
 * real browser.
 *
 * Public surface: global `MTT.persist`.
 */
(function (global) {
  "use strict";

  // Pure: choose the state with the newest savedAt (missing => oldest).
  function pickNewest(states) {
    let best = null;
    let bestAt = -1;
    for (const s of states) {
      if (!s) continue;
      const at = typeof s.savedAt === "number" ? s.savedAt : 0;
      if (at > bestAt) { bestAt = at; best = s; }
    }
    return best;
  }

  // --- Default real backends (browser) ------------------------------------

  function makeIdbBackend() {
    const DB = "mtt";
    const STORE = "kv";
    const idb = () => global.indexedDB;
    function open() {
      return new Promise((resolve, reject) => {
        if (!idb()) return reject(new Error("no indexedDB"));
        const req = idb().open(DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    function tx(mode, fn) {
      return open().then((db) => new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        const r = fn(store);
        t.oncomplete = () => resolve(r && r.result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }));
    }
    return {
      available: () => !!idb(),
      get: (key) => tx("readonly", (s) => s.get(key)).catch(() => null),
      set: (key, val) => tx("readwrite", (s) => s.put(val, key)).then(() => true).catch(() => false),
      del: (key) => tx("readwrite", (s) => s.delete(key)).then(() => true).catch(() => false),
    };
  }

  function makeFileBackend(idbBackend) {
    const supported = () => typeof global.showSaveFilePicker === "function";
    const HANDLE_KEY = "fileHandle";

    async function perm(handle, request) {
      if (!handle || !handle.queryPermission) return "granted";
      const opts = { mode: "readwrite" };
      let state = await handle.queryPermission(opts);
      if (state !== "granted" && request && handle.requestPermission) {
        state = await handle.requestPermission(opts);
      }
      return state;
    }
    async function readHandle(handle) {
      const file = await handle.getFile();
      const text = await file.text();
      return text ? JSON.parse(text) : null;
    }
    async function writeHandle(handle, text) {
      const w = await handle.createWritable();
      await w.write(text);
      await w.close();
    }

    return {
      supported,
      async getHandle() {
        return idbBackend.available() ? idbBackend.get(HANDLE_KEY) : null;
      },
      async link(text) {
        const handle = await global.showSaveFilePicker({
          suggestedName: "music-theory-progress.json",
          types: [{ description: "Progress", accept: { "application/json": [".json"] } }],
        });
        await writeHandle(handle, text);
        await idbBackend.set(HANDLE_KEY, handle);
        return { name: handle.name };
      },
      async unlink() {
        await idbBackend.del(HANDLE_KEY);
      },
      // Read the linked file if we already have permission (no prompt).
      async read(requestPermission) {
        const handle = await this.getHandle();
        if (!handle) return { state: null, linked: false };
        const state = await perm(handle, requestPermission);
        if (state !== "granted") return { state: null, linked: true, name: handle.name, needsPermission: true };
        try {
          return { state: await readHandle(handle), linked: true, name: handle.name };
        } catch {
          return { state: null, linked: true, name: handle.name };
        }
      },
      async write(text) {
        const handle = await this.getHandle();
        if (!handle) return false;
        const state = await perm(handle, false);
        if (state !== "granted") return false;
        try { await writeHandle(handle, text); return true; } catch { return false; }
      },
    };
  }

  /**
   * Create a persistence manager.
   * @param {{ now?: Function, serialize?: Function, idb?, file?, persistFn? }} opts
   */
  function create(opts) {
    opts = opts || {};
    const clock = opts.now || (() => Date.now());
    const serialize = opts.serialize || ((s) => JSON.stringify(s));
    const idb = opts.idb || makeIdbBackend();
    const file = opts.file || makeFileBackend(idb);
    const requestPersistent = opts.persistFn || (async () => {
      try {
        if (global.navigator && global.navigator.storage && global.navigator.storage.persist) {
          return await global.navigator.storage.persist();
        }
      } catch { /* ignore */ }
      return false;
    });

    // Ask the browser to keep our data; report current capabilities.
    async function init() {
      const persisted = await requestPersistent();
      let fileLinked = false, fileName = null, needsPermission = false;
      try {
        if (file.supported()) {
          const r = await file.read(false);
          fileLinked = !!r.linked;
          fileName = r.name || null;
          needsPermission = !!r.needsPermission;
        }
      } catch { /* ignore */ }
      return { persisted, idb: idb.available(), fileSupported: file.supported(), fileLinked, fileName, needsPermission };
    }

    // Read the newest stored copy across IndexedDB + linked file. Returns the
    // candidate state if it is newer than `localState`, else null.
    async function readBest(localState) {
      const candidates = [localState];
      try { if (idb.available()) candidates.push(await idb.get("state")); } catch { /* ignore */ }
      try { if (file.supported()) { const r = await file.read(false); if (r && r.state) candidates.push(r.state); } } catch { /* ignore */ }
      const best = pickNewest(candidates);
      if (best && best !== localState) return best;
      return null;
    }

    // Write-through to the sturdy sinks (called on every save). Swallows errors.
    async function mirror(state) {
      const text = serialize(state);
      try { if (idb.available()) await idb.set("state", state); } catch { /* ignore */ }
      try { if (file.supported()) await file.write(text); } catch { /* ignore */ }
    }

    async function linkFile(state) {
      const text = serialize(Object.assign({}, state, { savedAt: clock() }));
      const r = await file.link(text);
      try { await idb.set("state", state); } catch { /* ignore */ }
      return r;
    }

    async function unlinkFile() { await file.unlink(); }

    // Re-grant permission to the linked file (must be called from a user gesture).
    async function reconnectFile() {
      return file.read(true);
    }

    function fileStatus() {
      return { supported: file.supported() };
    }

    return { init, readBest, mirror, linkFile, unlinkFile, reconnectFile, fileStatus, pickNewest };
  }

  const api = { create, pickNewest, makeIdbBackend, makeFileBackend };

  global.MTT = global.MTT || {};
  global.MTT.persist = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
