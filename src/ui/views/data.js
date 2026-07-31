/* ui/views/data.js - progress storage, backup and sync controls.
 *
 * Keeps data-management decisions separate from the daily practice flow. The
 * page presents browser storage first, then optional file and GitHub mirrors,
 * followed by manual export, restore and reset actions.
 *
 * Public surface: global `MTT.ui.views.data`.
 */
(function (global) {
  "use strict";

  const TOKEN_URL = "https://github.com/settings/tokens/new?scopes=gist&description=Motif+music+theory+trainer";
  const REVOKE_URL = "https://github.com/settings/tokens";

  function escapeHtml(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function summary(ctx, storageOK) {
    const status = ctx.persistStatus || {};
    const gistConnected = !!(ctx.gist && ctx.gist.isConnected());
    if (gistConnected) {
      return {
        title: "GitHub sync is on",
        detail: "Progress is saved in this browser and syncs automatically to a private GitHub Gist.",
        tone: "synced",
      };
    }
    if (status.fileLinked && !status.needsPermission) {
      return {
        title: "File auto-save is on",
        detail: "Progress is saved in this browser and to " + (status.fileName || "the linked file") + ".",
        tone: "linked",
      };
    }
    if (storageOK) {
      return {
        title: "Saved in this browser",
        detail: status.persisted
          ? "The browser has granted durable storage for this progress."
          : "A linked file or GitHub sync can add a second copy.",
        tone: "local",
      };
    }
    return {
      title: "Browser storage is unavailable",
      detail: "Link a save file or make a manual backup before practising.",
      tone: "warning",
    };
  }

  function render(main, ctx) {
    const C = ctx.C;
    const store = ctx.store;
    const view = C.el(`
      <div class="view data-view">
        <header class="page-heading data-heading">
          <p class="eyebrow">Settings</p>
          <h1 tabindex="-1">Your data</h1>
          <p>Choose where your progress is kept, make a portable copy, or clear your practice history.</p>
        </header>

        <section class="data-status-card" aria-labelledby="data-status-title">
          <span class="data-status-pulse" aria-hidden="true"></span>
          <div>
            <p class="eyebrow">Current save status</p>
            <h2 id="data-status-title"></h2>
            <p id="data-status-detail"></p>
          </div>
        </section>

        <div class="data-method-grid">
          <section class="card data-method" aria-labelledby="file-save-title">
            <div class="data-method-head">
              <div><p class="eyebrow">Automatic copy</p><h2 id="file-save-title">Linked save file</h2></div>
              <span class="data-badge">No account</span>
            </div>
            <p>Keep a second copy in a file you choose. Put it in a synced folder to carry progress between devices.</p>
            <div id="file-link-area" class="data-method-action"></div>
          </section>

          <section class="card data-method data-method-github" aria-labelledby="github-sync-title">
            <div class="data-method-head">
              <div><p class="eyebrow">Automatic cloud sync</p><h2 id="github-sync-title">Private GitHub Gist</h2></div>
              <span class="data-badge">Advanced</span>
            </div>
            <p>Connect once, then sync every progress change to one private Gist in your GitHub account.</p>
            <div id="github-sync-area" class="data-method-action"></div>
          </section>
        </div>

        <section class="card manual-data-card" aria-labelledby="manual-data-title">
          <div>
            <p class="eyebrow">Portable and local</p>
            <h2 id="manual-data-title">Manual controls</h2>
            <p>Download a backup, restore one you already have, or reset your learning history.</p>
          </div>
          <div class="manual-data-actions">
            <button class="btn ghost" id="backup" type="button">Back up to a file</button>
            <button class="btn ghost" id="restore" type="button">Restore from a file</button>
            <button class="btn ghost danger" id="reset" type="button">Reset progress</button>
          </div>
        </section>
        <input type="file" id="restore-file" accept="application/json" hidden>
      </div>`);
    main.appendChild(view);

    function renderSummary() {
      const current = summary(ctx, store.storageOK);
      const panel = view.querySelector(".data-status-card");
      panel.dataset.tone = current.tone;
      view.querySelector("#data-status-title").textContent = current.title;
      view.querySelector("#data-status-detail").textContent = current.detail;
    }

    function renderFileSave() {
      const status = ctx.persistStatus || {};
      const area = view.querySelector("#file-link-area");
      C.clear(area);

      if (!status.fileSupported) {
        area.appendChild(C.el(`<p class="data-note">This browser cannot keep a live link to a save file. Manual backup below still works here.</p>`));
        return;
      }
      if (status.fileLinked && !status.needsPermission) {
        area.appendChild(C.el(`<p class="ok-line">✓ Auto-saving to <b>${escapeHtml(status.fileName || "your linked file")}</b> on every change.</p>`));
        area.appendChild(C.button("Stop auto-saving", async () => {
          await ctx.persist.unlinkFile();
          await refreshPersistence();
          C.announce("File auto-save stopped.");
        }, { className: "ghost" }));
        return;
      }
      if (status.fileLinked && status.needsPermission) {
        area.appendChild(C.el(`<p class="data-note">The browser needs permission to use the linked file again.</p>`));
        area.appendChild(C.button("Reconnect save file", async () => {
          try {
            await ctx.persist.reconnectFile();
            await refreshPersistence();
            C.announce("Save file reconnected.");
          } catch {
            C.announce("Couldn't reconnect the save file.", true);
          }
        }));
        return;
      }

      area.appendChild(C.el(`<p class="data-note">Your browser will ask where to create the file. Future changes are written there automatically.</p>`));
      area.appendChild(C.button("Link a save file", async () => {
        try {
          await ctx.persist.linkFile(store.get());
          await refreshPersistence();
          C.announce("Save file linked. Progress now auto-saves to it.");
        } catch {
          C.announce("Couldn't link a save file.", true);
        }
      }));
    }

    async function refreshPersistence() {
      await ctx.refreshPersistStatus();
      renderSummary();
      renderFileSave();
    }

    function renderGithubSync() {
      const area = view.querySelector("#github-sync-area");
      C.clear(area);
      const gist = ctx.gist;
      if (!gist) {
        area.appendChild(C.el(`<p class="data-note">GitHub sync is unavailable in this browser.</p>`));
        return;
      }

      if (gist.isConnected()) {
        const connected = C.el(`
          <div class="github-connected">
            <p class="ok-line">✓ Syncing automatically to a private Gist.</p>
            <p class="data-note">The GitHub token is stored on this device so sync keeps working after you return. Any script running on this site's origin can read that token.</p>
            <div class="data-action-row"></div>
            <p class="token-revoke">To remove access completely, <a href="${REVOKE_URL}" target="_blank" rel="noopener">delete the Motif token in GitHub <span aria-hidden="true">↗</span></a>, then disconnect it here.</p>
          </div>`);
        const actions = connected.querySelector(".data-action-row");
        const syncBtn = C.button("Sync now", async () => {
          syncBtn.disabled = true;
          syncBtn.textContent = "Syncing…";
          try {
            await gist.push(Object.assign({}, store.get(), { savedAt: ctx.now() }));
            C.announce("Synced to GitHub.");
          } catch (error) {
            C.announce("Sync failed: " + error.message, true);
          } finally {
            syncBtn.disabled = false;
            syncBtn.textContent = "Sync now";
          }
        }, { className: "ghost" });
        actions.appendChild(syncBtn);
        actions.appendChild(C.button("Disconnect this device", () => {
          gist.disconnect();
          renderSummary();
          renderGithubSync();
          C.announce("Disconnected from GitHub and removed the saved credential and Gist link from this device.");
        }, { className: "ghost" }));
        area.appendChild(connected);
        return;
      }

      const setup = C.el(`
        <div class="github-auth-box">
          <div class="token-disclosure" role="note">
            <p><b>Before connecting</b></p>
            <ul>
              <li>The GitHub <code>gist</code> scope can read and write every Gist in your account, not only Motif's private progress Gist.</li>
              <li>The token is stored in this browser's local storage so automatic sync works when you return.</li>
              <li>Any script running on this site's origin can read it. Connect only on a device and site version you trust.</li>
              <li>The token is kept separate from progress and is not included in backup files.</li>
            </ul>
          </div>
          <ol class="pat-steps">
            <li><a href="${TOKEN_URL}" target="_blank" rel="noopener" class="pat-link">Create a token with the Gist scope <span aria-hidden="true">↗</span></a>.</li>
            <li>Copy the token GitHub shows you and paste it below.</li>
          </ol>
          <div class="pat-input-row">
            <label class="sr-only" for="pat-input">GitHub token</label>
            <input type="password" id="pat-input" class="pat-input" placeholder="ghp_…" autocomplete="off" spellcheck="false">
            <button type="button" class="btn" id="pat-connect" disabled>Connect</button>
          </div>
          <p class="pat-error" id="pat-error" role="alert" hidden></p>
        </div>`);
      const input = setup.querySelector("#pat-input");
      const connectBtn = setup.querySelector("#pat-connect");
      const errorEl = setup.querySelector("#pat-error");

      function setError(message) {
        errorEl.textContent = message;
        errorEl.hidden = !message;
      }

      function setConnecting(yes) {
        connectBtn.disabled = yes;
        connectBtn.textContent = yes ? "Connecting…" : "Connect";
        input.disabled = yes;
      }

      input.addEventListener("input", () => {
        connectBtn.disabled = input.value.trim().length < 10;
        setError("");
      });

      async function connect() {
        const token = input.value.trim();
        if (!token) return;
        setConnecting(true);
        setError("");
        try {
          const info = await gist.connect(token);
          try {
            const remote = await gist.pull();
            if (remote) store.hydrate(remote);
          } catch { /* the local copy remains authoritative when a pull fails */ }
          ctx.syncHeader();
          renderSummary();
          renderGithubSync();
          C.announce("Connected to GitHub" + (info.username ? " as " + info.username : "") + ".");
        } catch (error) {
          setConnecting(false);
          setError(error.message);
        }
      }

      connectBtn.addEventListener("click", connect);
      input.addEventListener("keydown", (event) => { if (event.key === "Enter") connect(); });
      input.addEventListener("paste", () => {
        setTimeout(() => { if (input.value.trim().length >= 10) connect(); }, 0);
      });
      area.appendChild(setup);
    }

    view.querySelector("#backup").addEventListener("click", exportProgress);
    const fileInput = view.querySelector("#restore-file");
    view.querySelector("#restore").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => importProgress(fileInput.files[0]));
    view.querySelector("#reset").addEventListener("click", () => {
      const ok = typeof confirm === "function"
        ? confirm("Reset all progress? This clears your streak, history and spaced-repetition state. Your grade and preferences are kept. This can't be undone.")
        : true;
      if (!ok) return;
      store.reset();
      ctx.syncHeader();
      C.announce("Progress reset.");
    });

    function exportProgress() {
      try {
        const blob = new Blob([store.exportJSON()], { type: "application/json" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "music-theory-progress.json";
        link.click();
        URL.revokeObjectURL(link.href);
        C.announce("Progress backed up to a file.");
      } catch {
        C.announce("Couldn't create a backup file.", true);
      }
    }

    function importProgress(file) {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const result = ctx.storage.importJSON(reader.result);
        if (!result.ok) {
          C.announce(result.error, true);
          alert(result.error);
          return;
        }
        store.restore(result.state);
        ctx.audio.setEnabled(store.settings().sound);
        ctx.syncHeader();
        ctx.router.navigate("data", undefined, { force: true });
        C.announce("Progress restored.");
      };
      reader.onerror = () => alert("That file couldn't be read.");
      reader.readAsText(file);
    }

    renderSummary();
    renderFileSave();
    renderGithubSync();
  }

  const api = { render, summary };

  global.MTT = global.MTT || {};
  global.MTT.ui = global.MTT.ui || {};
  global.MTT.ui.views = global.MTT.ui.views || {};
  global.MTT.ui.views.data = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
