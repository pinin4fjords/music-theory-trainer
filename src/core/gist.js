/* core/gist.js - GitHub Gist sync via Device Flow OAuth.
 *
 * Lets any GitHub user sync their progress across devices without a backend.
 * A private Gist (fixed description "music-theory-trainer-progress") acts as
 * the cloud store. The app authenticates via GitHub's Device Flow, which needs
 * no client secret and works from a static page.
 *
 * Auth state persists in localStorage (TOKEN_KEY, GIST_ID_KEY) so the user
 * only needs to sign in once per browser.
 *
 * If a Device Flow is in progress when the home view is re-rendered, _pending
 * preserves the flow state so polling continues seamlessly.
 *
 * Public surface: global `MTT.gist`.
 */
(function (global) {
  "use strict";

  const CLIENT_ID = "Ov23lisYjx5Gm5hPczTK";
  const TOKEN_KEY = "mtt.gh.token";
  const GIST_ID_KEY = "mtt.gh.gistId";
  const GIST_DESC = "music-theory-trainer-progress";
  const GIST_FILE = "progress.json";

  // Holds in-progress Device Flow data across view re-renders.
  let _pending = null;

  function ls() {
    try { return global.localStorage || null; } catch { return null; }
  }

  function getToken() { const s = ls(); return s ? s.getItem(TOKEN_KEY) : null; }
  function getGistId() { const s = ls(); return s ? s.getItem(GIST_ID_KEY) : null; }
  function isConnected() { return !!getToken(); }
  function getPending() { return _pending; }

  // --- GitHub API helpers ---------------------------------------------------

  async function ghPost(url, body, token) {
    const headers = { Accept: "application/json", "Content-Type": "application/json" };
    if (token) headers.Authorization = "Bearer " + token;
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "HTTP " + res.status);
    return data;
  }

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

  // --- Device Flow ----------------------------------------------------------

  // Step 1: request a device + user code from GitHub.
  async function startDeviceFlow() {
    const data = await ghPost("https://github.com/login/device/code", {
      client_id: CLIENT_ID, scope: "gist",
    });
    if (data.error) throw new Error(data.error_description || data.error);
    _pending = {
      userCode: data.user_code,
      verificationUri: data.verification_uri || "https://github.com/login/device",
      deviceCode: data.device_code,
      interval: data.interval || 5,
      cancelled: false,
    };
    return _pending;
  }

  // Step 2: poll until the user authorises in their browser.
  // Resolves with the access token string; throws on cancel / expiry / denial.
  async function pollForToken() {
    if (!_pending) throw new Error("No Device Flow in progress.");
    const pause = (ms) => new Promise((r) => setTimeout(r, ms));
    let pollMs = (_pending.interval || 5) * 1000;
    const deadline = Date.now() + 15 * 60 * 1000;

    while (Date.now() < deadline) {
      await pause(pollMs);
      if (_pending && _pending.cancelled) throw new Error("cancelled");

      const data = await ghPost("https://github.com/login/oauth/access_token", {
        client_id: CLIENT_ID,
        device_code: _pending.deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      });

      if (data.access_token) return data.access_token;
      if (data.error === "authorization_pending") continue;
      if (data.error === "slow_down") { pollMs = ((data.interval || 5) + 5) * 1000; continue; }
      if (data.error === "expired_token") throw new Error("Sign-in request expired. Please try again.");
      if (data.error === "access_denied") throw new Error("GitHub sign-in was cancelled.");
      throw new Error(data.error_description || data.error || "Unexpected error from GitHub.");
    }
    throw new Error("Sign-in timed out. Please try again.");
  }

  // Step 3: store the token, validate it, find (or note absence of) an
  // existing gist so push() can create one on first write.
  async function finishConnect(token) {
    _pending = null;
    const s = ls();
    if (s) s.setItem(TOKEN_KEY, token);

    const user = await ghApi("/user");

    // Search the user's most recent 100 gists for an existing sync gist.
    const gists = await ghApi("/gists?per_page=100");
    const existing = Array.isArray(gists) ? gists.find((g) => g.description === GIST_DESC) : null;
    if (s) {
      if (existing) s.setItem(GIST_ID_KEY, existing.id);
      else s.removeItem(GIST_ID_KEY);
    }

    return { username: user.login, gistId: existing ? existing.id : null };
  }

  function cancelAuth() {
    if (_pending) _pending.cancelled = true;
    _pending = null;
  }

  // --- Read / write ---------------------------------------------------------

  // Pull progress from the linked gist. Returns parsed state or null.
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

  // Push progress to the linked gist, creating it if this is the first write.
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

  function disconnect() {
    cancelAuth();
    const s = ls();
    if (!s) return;
    s.removeItem(TOKEN_KEY);
    s.removeItem(GIST_ID_KEY);
  }

  function getStatus() {
    return { connected: isConnected(), gistId: getGistId() };
  }

  const api = {
    isConnected, getStatus, getPending,
    startDeviceFlow, pollForToken, finishConnect, cancelAuth,
    pull, push, disconnect,
  };

  global.MTT = global.MTT || {};
  global.MTT.gist = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
