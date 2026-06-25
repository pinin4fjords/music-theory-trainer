/* core/gist.js - GitHub Gist sync via Personal Access Token.
 *
 * Lets any GitHub user sync their progress across devices using a private
 * Gist as cloud storage. The user creates a token with `gist` scope once;
 * after that every save mirrors to GitHub automatically.
 *
 * Token and Gist ID are kept in localStorage (TOKEN_KEY, GIST_ID_KEY),
 * separate from the state blob. All Gist API calls go to api.github.com,
 * which supports CORS from browsers with a Bearer token.
 *
 * Public surface: global `MTT.gist`.
 */
(function (global) {
  "use strict";

  const TOKEN_KEY = "mtt.gh.token";
  const GIST_ID_KEY = "mtt.gh.gistId";
  const GIST_DESC = "music-theory-trainer-progress";
  const GIST_FILE = "progress.json";

  function ls() {
    try { return global.localStorage || null; } catch { return null; }
  }

  function getToken() { const s = ls(); return s ? s.getItem(TOKEN_KEY) : null; }
  function getGistId() { const s = ls(); return s ? s.getItem(GIST_ID_KEY) : null; }
  function isConnected() { return !!getToken(); }

  // --- GitHub API -----------------------------------------------------------

  async function ghApi(path, opts) {
    const token = getToken();
    if (!token) throw new Error("Not connected to GitHub.");
    const headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      Authorization: "Bearer " + token,
    };
    if (opts && opts.body) headers["Content-Type"] = "application/json";
    const res = await fetch("https://api.github.com" + path, Object.assign({}, opts, { headers }));
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "HTTP " + res.status);
    return data;
  }

  // --- Connect / disconnect -------------------------------------------------

  // Validate a token, find any existing sync Gist, persist credentials.
  // Returns { username, gistId } on success; throws a readable error on failure.
  async function connect(token) {
    const s = ls();

    // Validate via a lightweight user-info call before storing anything.
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        Authorization: "Bearer " + token,
      },
    });
    if (res.status === 401) throw new Error("Token not recognised - check you copied it in full.");
    if (!res.ok) throw new Error("GitHub returned an error (" + res.status + "). Check your connection.");
    const user = await res.json();

    if (s) s.setItem(TOKEN_KEY, token);

    // Search the user's most recent 100 Gists for an existing sync Gist.
    const gists = await ghApi("/gists?per_page=100");
    const existing = Array.isArray(gists) ? gists.find((g) => g.description === GIST_DESC) : null;
    if (s) {
      if (existing) s.setItem(GIST_ID_KEY, existing.id);
      else s.removeItem(GIST_ID_KEY);
    }

    return { username: user.login, gistId: existing ? existing.id : null };
  }

  function disconnect() {
    const s = ls();
    if (!s) return;
    s.removeItem(TOKEN_KEY);
    s.removeItem(GIST_ID_KEY);
  }

  // --- Read / write ---------------------------------------------------------

  // Pull progress from the linked Gist. Returns parsed state or null.
  async function pull() {
    const gistId = getGistId();
    if (!gistId) return null;
    const gist = await ghApi("/gists/" + gistId);
    const file = gist && gist.files && gist.files[GIST_FILE];
    if (!file) return null;
    const text = file.truncated
      ? await fetch(file.raw_url).then((r) => r.text())
      : file.content;
    return text ? JSON.parse(text) : null;
  }

  // Push progress to the linked Gist, creating it on first write.
  async function push(state) {
    const s = ls();
    const gistId = getGistId();
    const text = JSON.stringify(state);
    if (gistId) {
      await ghApi("/gists/" + gistId, {
        method: "PATCH",
        body: JSON.stringify({ files: { [GIST_FILE]: { content: text } } }),
      });
    } else {
      const created = await ghApi("/gists", {
        method: "POST",
        body: JSON.stringify({
          description: GIST_DESC,
          public: false,
          files: { [GIST_FILE]: { content: text } },
        }),
      });
      if (s && created && created.id) s.setItem(GIST_ID_KEY, created.id);
    }
  }

  function getStatus() {
    return { connected: isConnected(), gistId: getGistId() };
  }

  const api = { isConnected, getStatus, connect, disconnect, pull, push };

  global.MTT = global.MTT || {};
  global.MTT.gist = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
