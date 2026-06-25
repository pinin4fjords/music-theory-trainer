/* ui/views/playground.js - build/see/hear a scale, interval or triad.
 *
 * Pick a root and a structure; the staff, the audio and the on-screen keyboard
 * all update together. Switch clef, toggle technical degree names. Every control
 * is a real form control or button, so it is fully keyboard-operable.
 *
 * Public surface: global `MTT.ui.views.playground`.
 */
(function (global) {
  "use strict";

  const PG_ROOTS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
  const PG_SCALES = [
    ["major", "major"], ["naturalMinor", "natural minor"], ["harmonicMinor", "harmonic minor"],
    ["melodicMinorAsc", "melodic minor"], ["dorian", "Dorian mode"], ["phrygian", "Phrygian mode"],
    ["lydian", "Lydian mode"], ["mixolydian", "Mixolydian mode"], ["locrian", "Locrian mode"],
  ];
  const PG_INTERVALS = [
    [2, "minor", "minor 2nd"], [2, "major", "major 2nd"], [3, "minor", "minor 3rd"], [3, "major", "major 3rd"],
    [4, "perfect", "perfect 4th"], [4, "augmented", "augmented 4th"], [5, "diminished", "diminished 5th"],
    [5, "perfect", "perfect 5th"], [6, "minor", "minor 6th"], [6, "major", "major 6th"],
    [7, "minor", "minor 7th"], [7, "major", "major 7th"], [8, "perfect", "perfect octave"],
  ];
  const PG_QUALITIES = ["major", "minor", "diminished", "augmented"];

  // Persisted across navigations (module scope), like the original.
  const pg = { kind: "scale", root: "C", scale: "major", interval: 7, quality: "major", inversion: 0, clef: "treble", degrees: false };

  function render(main, ctx) {
    const C = ctx.C;
    const M = ctx.music;
    const N = ctx.notation;
    const A = ctx.audio;
    const playBtn = (label, fn) => C.playButton(label, () => { try { fn(); } catch { /* ignore */ } });

    const view = C.el(`<div class="view"><h1 tabindex="-1">Playground</h1><p class="muted">Build a scale, interval or triad - see it on the staff, hear it, and find it on the keyboard.</p></div>`);
    main.appendChild(view);

    const panel = C.el(`<div class="card pg-panel"></div>`);
    const kindRow = C.el(`<div class="seg" role="group" aria-label="What to build"></div>`);
    [["scale", "Scale"], ["interval", "Interval"], ["triad", "Triad"]].forEach(([k, label]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.classList.toggle("on", pg.kind === k);
      b.setAttribute("aria-pressed", pg.kind === k ? "true" : "false");
      b.addEventListener("click", () => { pg.kind = k; ctx.router.refresh(); });
      kindRow.appendChild(b);
    });
    panel.appendChild(kindRow);

    const opts = C.el(`<div class="pg-opts"></div>`);
    opts.appendChild(selectField("Root", PG_ROOTS.map((r) => [r, r]), pg.root, (val) => { pg.root = val; rebuild(); }));
    if (pg.kind === "scale") {
      opts.appendChild(selectField("Type", PG_SCALES, pg.scale, (val) => { pg.scale = val; rebuild(); }));
    } else if (pg.kind === "interval") {
      opts.appendChild(selectField("Interval", PG_INTERVALS.map((iv, i) => [String(i), iv[2]]), String(pg.interval),
        (val) => { pg.interval = parseInt(val, 10); rebuild(); }));
    } else {
      opts.appendChild(selectField("Quality", PG_QUALITIES.map((q) => [q, q]), pg.quality, (val) => { pg.quality = val; rebuild(); }));
      opts.appendChild(selectField("Position", [["0", "root position"], ["1", "first inversion"], ["2", "second inversion"]],
        String(pg.inversion), (val) => { pg.inversion = parseInt(val, 10); rebuild(); }));
    }
    opts.appendChild(selectField("Clef", [["treble", "treble"], ["bass", "bass"], ["alto", "alto"], ["tenor", "tenor"]], pg.clef, (val) => { pg.clef = val; rebuild(); }));
    panel.appendChild(opts);

    if (pg.kind === "scale") {
      const tog = C.el(`<label class="pg-toggle"><input type="checkbox" ${pg.degrees ? "checked" : ""}> show technical degree names</label>`);
      tog.querySelector("input").addEventListener("change", (e) => { pg.degrees = e.target.checked; rebuild(); });
      panel.appendChild(tog);
    }
    view.appendChild(panel);

    const stage = C.el(`<div class="card" id="pg-stage"></div>`);
    view.appendChild(stage);
    const kb = C.el(`<div class="card pg-kb" id="pg-kb" role="group" aria-label="Keyboard"></div>`);
    view.appendChild(kb);

    rebuild();

    function pgBuild() {
      if (pg.kind === "scale") {
        const notes = M.scale(pg.root, pg.scale);
        return { columns: notes, flat: notes, chord: false };
      }
      if (pg.kind === "interval") {
        const root = M.parseSpelled(pg.root, 4);
        const [num, qual] = PG_INTERVALS[pg.interval];
        const top = M.transpose(root, num, qual);
        return { columns: [root, top], flat: [root, top], chord: false };
      }
      const notes = M.chordTriad(M.parseSpelled(pg.root, 4), pg.quality);
      for (let i = 0; i < pg.inversion; i++) {
        const low = notes.shift();
        notes.push(M.spelled(low.letter, low.accidental, low.octave + 1));
      }
      return { columns: [notes], flat: notes, chord: true };
    }

    function rebuild() {
      const built = pgBuild();
      const spec = { clef: pg.clef, notes: built.columns };
      stage.innerHTML = `<div class="staff-wrap">${N.staffHTML(spec)}</div>`;

      if (pg.kind === "scale" && pg.degrees) {
        const chips = built.flat.slice(0, 7).map((n, i) =>
          `<span class="deg-chip"><b>${M.spelledName(n)}</b> ${M.degreeName(i + 1)}</span>`).join("");
        stage.appendChild(C.el(`<div class="deg-row">${chips}</div>`));
      }

      const row = C.el(`<div class="explainer-controls"></div>`);
      const playLabel = built.chord ? "Play chord" : "Play";
      const playFn = built.chord ? () => A.chord(built.flat) : () => A.sequence(built.flat);
      row.appendChild(playBtn(playLabel, playFn));
      if (built.chord) row.appendChild(playBtn("Arpeggiate", () => A.sequence(built.flat, 0.28, 0.34)));
      if (pg.kind === "interval") row.appendChild(playBtn("Together", () => A.chord(built.flat)));
      stage.appendChild(row);

      drawKeyboard(new Set(built.flat.map((n) => M.spelledToMidi(n))));
    }

    function drawKeyboard(activeMidis) {
      C.clear(kb);
      for (let midi = 60; midi <= 84; midi++) {
        const isBlack = [1, 3, 6, 8, 10].includes(midi % 12);
        const active = activeMidis.has(midi);
        const key = document.createElement("button");
        key.type = "button";
        key.className = "pg-key" + (isBlack ? " black" : "") + (active ? " active" : "");
        key.setAttribute("aria-label", "MIDI note " + midi);
        key.addEventListener("click", () => A.note(midi));
        kb.appendChild(key);
      }
    }

    function selectField(label, options, value, onChange) {
      const id = "pg-" + label.toLowerCase();
      const wrap = C.el(`<label class="pg-field" for="${id}"><span>${label}</span></label>`);
      const sel = document.createElement("select");
      sel.id = id;
      options.forEach(([val, text]) => {
        const o = document.createElement("option");
        o.value = val; o.textContent = text;
        if (val === value) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener("change", () => onChange(sel.value));
      wrap.appendChild(sel);
      return wrap;
    }
  }

  const api = { render };

  global.MTT = global.MTT || {};
  global.MTT.ui = global.MTT.ui || {};
  global.MTT.ui.views = global.MTT.ui.views || {};
  global.MTT.ui.views.playground = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
