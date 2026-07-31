/* core/gist.js - optional GitHub Gist progress sync.
 *
 * A classic Personal Access Token with the `gist` scope mirrors progress to a
 * private Gist. The token and Gist identifier are stored in localStorage,
 * separate from the exported progress state. Any script running on this origin
 * can read localStorage, so the UI must explain that trust boundary before a
 * learner connects.
 *
 * Public surface: global `MTT.gist` plus `MTT.gist.create(opts)` for tests.
 */
(function (global) {
  "use strict";

  const TOKEN_KEY = "mtt.gh.token";
  const GIST_ID_KEY = "mtt.gh.gistId";
  const GIST_DESC = "music-theory-trainer-progress";
  const GIST_FILE = "progress.json";

  function browserStore() {
    try { return global.localStorage || null; } catch { return null; }
  }

  function read(store, key) {
    try { return store ? store.getItem(key) : null; } catch { return null; }
  }

  function write(store, key, value) {
    try {
      if (!store) return false;
      store.setItem(key, value);
      return true;
    } catch { return false; }
  }

  function remove(store, key) {
    try { if (store) store.removeItem(key); } catch { /* blocked storage */ }
  }

  function create(opts) {
    opts = opts || {};
    const store = opts.storage === undefined ? browserStore() : opts.storage;
    const request = opts.fetch || ((...args) => global.fetch(...args));

    function getToken() { return read(store, TOKEN_KEY); }
    function getGistId() { return read(store, GIST_ID_KEY); }
    function isConnected() { return !!getToken(); }

    function readableError(data, status, token) {
      const raw = data && typeof data.message === "string" ? data.message : "HTTP " + status;
      return token ? raw.split(token).join("[redacted]") : raw;
    }

    async function ghApiWithToken(path, token, requestOpts) {
      if (!token) throw new Error("Not connected to GitHub.");
      const headers = {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        Authorization: "Bearer " + token,
      };
      if (requestOpts && requestOpts.body) headers["Content-Type"] = "application/json";

      let res;
      try {
        res = await request("https://api.github.com" + path, Object.assign({}, requestOpts, { headers }));
      } catch {
        throw new Error("Could not reach GitHub. Check your connection and try again.");
      }
      if (res.status === 204) return null;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readableError(data, res.status, token));
      return data;
    }

    function ghApi(path, requestOpts) {
      return ghApiWithToken(path, getToken(), requestOpts);
    }

    // The account and Gist lookup must both succeed before a credential is
    // retained. Failed setup cannot leave a token behind in browser storage.
    async function connect(token) {
      token = String(token || "").trim();
      if (!token) throw new Error("Enter a GitHub token to connect.");

      let user;
      try {
        user = await ghApiWithToken("/user", token);
      } catch (error) {
        if (/Bad credentials|401|recognised/i.test(error.message)) {
          throw new Error("Token not recognised - check you copied it in full.");
        }
        throw error;
      }

      const gists = await ghApiWithToken("/gists?per_page=100", token);
      const existing = Array.isArray(gists) ? gists.find((gist) => gist.description === GIST_DESC) : null;
      if (!write(store, TOKEN_KEY, token)) {
        throw new Error("This browser could not save the GitHub connection.");
      }
      if (existing && existing.id && !write(store, GIST_ID_KEY, existing.id)) {
        remove(store, TOKEN_KEY);
        throw new Error("This browser could not save the GitHub connection.");
      }
      if (!existing) remove(store, GIST_ID_KEY);

      return { username: user && user.login, gistId: existing ? existing.id : null };
    }

    function disconnect() {
      remove(store, TOKEN_KEY);
      remove(store, GIST_ID_KEY);
    }

    async function pull() {
      const gistId = getGistId();
      if (!gistId) return null;
      const gist = await ghApi("/gists/" + encodeURIComponent(gistId));
      const file = gist && gist.files && gist.files[GIST_FILE];
      if (!file) return null;
      let text = file.content;
      if (file.truncated) {
        let res;
        try { res = await request(file.raw_url); } catch { throw new Error("Could not download synced progress."); }
        if (!res.ok) throw new Error("Could not download synced progress.");
        text = await res.text();
      }
      return text ? JSON.parse(text) : null;
    }

    async function push(state) {
      const gistId = getGistId();
      const text = JSON.stringify(state);
      if (gistId) {
        await ghApi("/gists/" + encodeURIComponent(gistId), {
          method: "PATCH",
          body: JSON.stringify({ files: { [GIST_FILE]: { content: text } } }),
        });
        return;
      }

      const created = await ghApi("/gists", {
        method: "POST",
        body: JSON.stringify({
          description: GIST_DESC,
          public: false,
          files: { [GIST_FILE]: { content: text } },
        }),
      });
      if (created && created.id) write(store, GIST_ID_KEY, created.id);
    }

    function getStatus() {
      return { connected: isConnected(), gistId: getGistId(), credentialStorage: isConnected() ? "device" : null };
    }

    return { isConnected, getStatus, connect, disconnect, pull, push };
  }

  const api = create();
  api.create = create;

  global.MTT = global.MTT || {};
  global.MTT.gist = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
