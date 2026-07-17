/* ui/views/home.js - the landing view.
 *
 * The daily-practice front door: streak + totals, a "focus areas" panel that
 * surfaces the learner's weakest topics (local analytics), the practice mode
 * toggle (mixed daily review vs a learning path that leads with the current
 * grade), quick links into the other sections, and local backup/restore.
 *
 * Public surface: global `MTT.ui.views.home`.
 */
(function (global) {
  "use strict";

  function render(main, ctx) {
    const C = ctx.C;
    const store = ctx.store;
    const st = store.get();
    const done = store.doneToday(ctx.now());
    const mode = st.settings.mode || "daily";

    // First-run: make grade selection an intentional moment, not header furniture.
    if (!st.settings.gradeChosen) { renderOnboarding(); return; }

    const warn = store.storageOK ? "" :
      `<div class="why-box" role="alert">⚠ This browser isn't saving progress on its own (common when opening the file directly). Link a save file below, or open the hosted version.</div>`;

    // Hide the stats panel until there's something to show (no cold zeroes).
    const showStats = (st.totalAnswered || 0) > 0;
    const statsHtml = showStats ? `
        <div class="stats-row">
          <div class="stat"><div class="stat-num">🔥 ${st.streak}</div><div class="stat-lbl">day streak</div></div>
          <div class="stat"><div class="stat-num">${st.bestStreak || 0}</div><div class="stat-lbl">best streak</div></div>
          <div class="stat"><div class="stat-num">${st.daysPracticed || 0}</div><div class="stat-lbl">days practised</div></div>
          <div class="stat"><div class="stat-num">${st.totalAnswered || 0}</div><div class="stat-lbl">questions answered</div></div>
        </div>` : "";

    function renderOnboarding() {
      const view = C.el(`
        <div class="view">
          <div class="hero">
            <h1 tabindex="-1">Welcome</h1>
            <p>A few minutes of music theory a day, grounded in <i>why</i> as well as <i>what</i>.</p>
          </div>
          <div class="card center onboard-card">
            <h3 style="margin-top:0">What grade are you working towards?</h3>
            <p class="muted" style="margin-top:0">It sets your daily session. You can change it any time in the header.</p>
            <div class="grade-picker" role="group" aria-label="Choose your grade"></div>
            <p class="muted onboard-or" style="margin:18px 0 8px">Not sure which to pick?</p>
            <div id="placement-cta"></div>
          </div>
        </div>`);
      main.appendChild(view);
      const picker = view.querySelector(".grade-picker");
      ctx.content.grades.forEach((g) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "grade-pick";
        b.textContent = String(g.grade);
        b.setAttribute("aria-label", "Grade " + g.grade);
        b.addEventListener("click", () => {
          store.setSetting("grade", g.grade);
          store.setSetting("gradeChosen", true);
          ctx.syncHeader();
          ctx.router.navigate("home", undefined, { force: true });
        });
        picker.appendChild(b);
      });

      // Optional placement check: a short adaptive diagnostic that suggests a
      // starting grade. The manual picker above stays the default/override.
      const placement = global.MTT.ui.views.placement;
      if (placement) {
        const cta = view.querySelector("#placement-cta");
        const btn = C.button("Take a quick placement check", () => placement.render(main, ctx), { className: "ghost" });
        cta.appendChild(btn);
      }

      C.focus(view.querySelector("h1"));
    }

    const view = C.el(`
      <div class="view">
        <div class="hero">
          <h1 tabindex="-1">A few minutes of theory a day</h1>
          <p>Graded music theory, grounded in <i>why</i> as well as <i>what</i>. Set your grade and the daily session follows.</p>
        </div>
        <div class="disclaimer-box" role="note">
          <p><b>⚠ Just a hobby project.</b> I built this for my own practice, in my spare time - it isn't affiliated with any exam board, hasn't been checked by a teacher, and isn't guaranteed correct. Don't rely on it in place of official syllabuses or published study materials. Use at your own risk.</p>
        </div>
        <div id="resume-area"></div>
        ${warn}
        ${statsHtml}
        <div class="card center start-card">
          <div class="mode-toggle" role="group" aria-label="Practice mode">
            <button type="button" data-mode="daily" class="${mode === "daily" ? "on" : ""}" aria-pressed="${mode === "daily"}">Daily mix</button>
            <button type="button" data-mode="path" class="${mode === "path" ? "on" : ""}" aria-pressed="${mode === "path"}">Learning path</button>
          </div>
          <p class="muted mode-blurb">${mode === "path"
            ? "Learning path: leads with your current grade's topics, with weak earlier topics mixed in."
            : "Daily mix: spaced review across your current grade and everything below it."}</p>
          <p class="muted" style="margin-top:0">${done ? "Today's practice is done - come back tomorrow to keep the streak going." : "Ready for today's set?"}</p>
        </div>
        <div id="aural-nudge-area"></div>
        <div id="focus-area"></div>
        <div class="grid" id="home-cards"></div>
        <div class="card data-card">
          <h3 style="margin-top:0">Your data</h3>
          <p class="muted" id="durability-line" style="margin-top:0"></p>
          <div id="file-link-area"></div>
          <div id="github-sync-area"></div>
          <p class="muted backup-line">Or keep a manual copy:
            <button class="linkish" id="backup" type="button">Back up to a file</button> ·
            <button class="linkish" id="restore" type="button">Restore</button> ·
            <button class="linkish danger" id="reset" type="button">Reset progress</button></p>
        </div>
        <input type="file" id="restore-file" accept="application/json" hidden>
      </div>`);
    main.appendChild(view);

    // Start button.
    const startWrap = view.querySelector(".start-card");
    const startBtn = C.button(done ? "Practise again" : "Start today's practice", () => ctx.router.navigate("quiz"));
    startWrap.appendChild(startBtn);

    // Mode toggle.
    view.querySelectorAll(".mode-toggle button").forEach((b) => {
      b.addEventListener("click", () => {
        store.setSetting("mode", b.dataset.mode);
        ctx.router.refresh();
      });
    });

    // Resume banner: an interrupted quiz session left in sessionStorage - a
    // refresh or back-navigation would otherwise silently discard it.
    renderResumeBanner();
    function renderResumeBanner() {
      const area = view.querySelector("#resume-area");
      const saved = ctx.quizResume.load(ctx.sessionStore);
      if (!area || !saved || typeof saved.idx !== "number" || typeof saved.total !== "number") return;
      const panel = C.el(`
        <div class="why-box resume-box" role="note">
          <p style="margin:0 0 8px"><strong>▶ Resume your session</strong></p>
          <p style="margin:0 0 10px">${escapeHtml(saved.label || "Practice")} - question ${saved.idx + 1} of ${saved.total}, score ${saved.score}.</p>
        </div>`);
      const row = C.el(`<div style="display:flex;gap:10px;flex-wrap:wrap"></div>`);
      row.appendChild(C.button("Resume", () => ctx.router.navigate("quiz", { resume: true })));
      row.appendChild(C.button("Discard", () => {
        ctx.quizResume.clear(ctx.sessionStore);
        panel.remove();
      }, { className: "ghost" }));
      panel.appendChild(row);
      area.appendChild(panel);
    }

    // Aural due nudge: aural practice lives on its own tab, outside the daily
    // session, so due aural topics can quietly pile up. Surface a count linking
    // to the tab when any are due.
    renderAuralNudge();
    function renderAuralNudge() {
      const area = view.querySelector("#aural-nudge-area");
      if (!area) return;
      const now = ctx.now();
      const srsMap = store.srsMap();
      const due = ctx.session.auralTopics(ctx.content).filter((t) => {
        const c = srsMap[t.id];
        return c && c.seen > 0 && c.dueAt != null && c.dueAt <= now;
      }).length;
      if (!due) return;
      const label = due === 1
        ? "1 aural topic is due for review"
        : `${due} aural topics are due for review`;
      const panel = C.el(`<div class="why-box aural-nudge" role="note"><p style="margin:0 0 10px">👂 ${label}.</p></div>`);
      panel.appendChild(C.button("Go to Aural training", () => ctx.router.navigate("aural")));
      area.appendChild(panel);
    }

    // Focus areas (weak topics) - theory and aural topics both count, since
    // both feed the same SRS data.
    const topics = ctx.session.quizableTopics(ctx.content).concat(ctx.session.auralTopics(ctx.content));
    const weak = ctx.analytics.weakAreas(store.srsMap(), topics, 3);
    if (weak.length) {
      const panel = C.el(`<div class="card focus-card"><h3 style="margin-top:0">Focus areas</h3>
        <p class="muted" style="margin-top:0">Topics worth another look, based on your answers.</p></div>`);
      const row = C.el(`<div class="focus-chips"></div>`);
      weak.forEach((w) => {
        const topic = topics.find((t) => t.id === w.id);
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "focus-chip";
        const pct = w.accuracy == null ? "" : ` · ${Math.round(w.accuracy * 100)}%`;
        chip.innerHTML = `${w.title}<span class="muted"> (Grade ${w.grade}${pct})</span>`;
        chip.setAttribute("aria-label", `Practise ${w.title}, Grade ${w.grade}`);
        chip.addEventListener("click", () => ctx.router.navigate("quiz", { single: topic }));
        row.appendChild(chip);
      });
      panel.appendChild(row);
      view.querySelector("#focus-area").appendChild(panel);
    }

    // Quick links.
    const cards = view.querySelector("#home-cards");
    [["📚", "Learn", "Lessons by grade", "learn"],
      ["👂", "Aural", "Listening & singing tests", "aural"],
      ["💡", "Explainers", "The why behind the theory", "explore"],
      ["🎹", "Playground", "Build & hear it", "play"],
      ["📖", "Reference", "Quick lookup tables", "reference"],
      ["📈", "Progress", "Level & weak areas", "progress"]].forEach(([icon, title, sub, tab]) => {
      const c = C.cardButton(`<div style="font-size:1.8rem" aria-hidden="true">${icon}</div><h3>${title}</h3><div class="why">${sub}</div>`,
        () => ctx.router.navigate(tab));
      cards.appendChild(c);
    });

    // Durability status + linked-file controls.
    renderDataStatus();
    function renderDataStatus() {
      const status = ctx.persistStatus || {};
      const durable = status.persisted;
      const line = view.querySelector("#durability-line");
      if (line) {
        line.textContent = store.storageOK
          ? (durable
            ? "Saved in this browser with durable storage (the browser has been asked not to clear it)."
            : "Saved in this browser. For the strongest safety, link a save file below.")
          : "This browser won't reliably keep data on its own - linking a save file (or manual backup) is recommended.";
      }
      const area = view.querySelector("#file-link-area");
      if (!area) return;
      C.clear(area);
      if (!status.fileSupported) {
        area.appendChild(C.el(`<p class="muted" style="font-size:.85rem;margin:6px 0 0">Tip: this browser doesn't support linked auto-save files. Use a manual backup, or open the app in a Chromium browser to auto-save to a file in a synced folder.</p>`));
        return;
      }
      if (status.fileLinked && !status.needsPermission) {
        area.appendChild(C.el(`<p class="ok-line" style="margin:6px 0">✓ Auto-saving to <b>${escapeHtml(status.fileName || "your linked file")}</b> on every change.</p>`));
        const unlink = C.button("Stop auto-saving", async () => { await ctx.persist.unlinkFile(); await ctx.refreshPersistStatus(); renderDataStatus(); }, { className: "ghost" });
        area.appendChild(unlink);
      } else if (status.fileLinked && status.needsPermission) {
        area.appendChild(C.el(`<p class="muted" style="margin:6px 0">A save file is linked but the browser needs permission again.</p>`));
        const reconnect = C.button("Reconnect save file", async () => {
          await ctx.persist.reconnectFile();
          await ctx.refreshPersistStatus();
          renderDataStatus();
        });
        area.appendChild(reconnect);
      } else {
        area.appendChild(C.el(`<p class="muted" style="margin:6px 0;font-size:.9rem">Link a save file once and your progress auto-saves to it on every change - put it in a Drive/Dropbox folder and it follows you across devices. No accounts, no server.</p>`));
        const link = C.button("Link a save file (auto-save)", async () => {
          try {
            await ctx.persist.linkFile(store.get());
            await ctx.refreshPersistStatus();
            renderDataStatus();
            C.announce("Save file linked. Progress now auto-saves to it.");
          } catch {
            C.announce("Couldn't link a save file.", true);
          }
        });
        area.appendChild(link);
      }
    }

    // GitHub Gist sync controls.
    renderGithubSync();
    function renderGithubSync() {
      const area = view.querySelector("#github-sync-area");
      if (!area) return;
      C.clear(area);

      const gist = ctx.gist;
      if (!gist) return; // not available in test environment

      const connected = gist.isConnected();

      if (connected) {
        area.appendChild(C.el(`<p class="ok-line" style="margin:6px 0">✓ Progress syncs to a private GitHub Gist on every change.</p>`));
        const syncBtn = C.button("Sync now", async () => {
          syncBtn.disabled = true;
          syncBtn.textContent = "Syncing...";
          try {
            await gist.push(Object.assign({}, store.get(), { savedAt: ctx.now() }));
            C.announce("Synced to GitHub.");
          } catch (e) {
            C.announce("Sync failed: " + e.message, true);
          } finally {
            syncBtn.disabled = false;
            syncBtn.textContent = "Sync now";
          }
        }, { className: "ghost" });
        const disconnectBtn = C.button("Disconnect", () => {
          gist.disconnect();
          renderGithubSync();
          C.announce("Disconnected from GitHub.");
        }, { className: "ghost" });
        area.appendChild(syncBtn);
        area.appendChild(disconnectBtn);
      } else {
        // Token setup: a direct link opens GitHub with scope + name pre-filled,
        // so the user just clicks "Generate token" and pastes it back.
        const TOKEN_URL = "https://github.com/settings/tokens/new?scopes=gist&description=Motif+music+theory+trainer";
        const box = C.el(`
          <div class="github-auth-box">
            <p style="margin:0 0 10px"><b>Sync across devices via GitHub</b></p>
            <ol class="pat-steps">
              <li><a href="${TOKEN_URL}" target="_blank" rel="noopener" class="pat-link">Open GitHub token settings <span aria-hidden="true">↗</span></a> and click <b>Generate token</b> (settings are pre-filled).</li>
              <li>Copy the token GitHub shows you.</li>
              <li>Paste it here:</li>
            </ol>
            <div class="pat-input-row">
              <input type="password" id="pat-input" class="pat-input" placeholder="ghp_…" autocomplete="off" spellcheck="false">
              <button type="button" class="btn" id="pat-connect" disabled>Connect</button>
            </div>
            <p class="pat-error" id="pat-error" hidden></p>
          </div>`);

        const input = box.querySelector("#pat-input");
        const connectBtn = box.querySelector("#pat-connect");
        const errorEl = box.querySelector("#pat-error");

        function setError(msg) {
          errorEl.textContent = msg;
          errorEl.hidden = !msg;
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

        async function doConnect() {
          const token = input.value.trim();
          if (!token) return;
          setConnecting(true);
          setError("");
          try {
            const info = await gist.connect(token);
            try {
              const remote = await gist.pull();
              if (remote) store.hydrate(remote);
            } catch { /* pull failure is non-fatal */ }
            ctx.syncHeader();
            renderGithubSync();
            C.announce("Connected to GitHub" + (info.username ? " as " + info.username : "") + ".");
          } catch (e) {
            setConnecting(false);
            setError(e.message);
          }
        }

        // Connect on button click or Enter in the input.
        connectBtn.addEventListener("click", doConnect);
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") doConnect(); });

        // Also connect automatically on paste so the user doesn't need to click.
        input.addEventListener("paste", () => {
          // Read value after paste event resolves.
          setTimeout(() => {
            if (input.value.trim().length >= 10) doConnect();
          }, 0);
        });

        area.appendChild(box);
      }
    }

    function escapeHtml(s) {
      return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    // Backup / restore / reset.
    view.querySelector("#backup").addEventListener("click", () => exportProgress());
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
      ctx.router.navigate("home");
      C.announce("Progress reset.");
    });

    function exportProgress() {
      try {
        const blob = new Blob([store.exportJSON()], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "music-theory-progress.json";
        a.click();
        URL.revokeObjectURL(a.href);
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
        ctx.router.navigate("home");
        C.announce("Progress restored.");
      };
      reader.onerror = () => alert("That file couldn't be read.");
      reader.readAsText(file);
    }
  }

  const api = { render };

  global.MTT = global.MTT || {};
  global.MTT.ui = global.MTT.ui || {};
  global.MTT.ui.views = global.MTT.ui.views || {};
  global.MTT.ui.views.home = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
