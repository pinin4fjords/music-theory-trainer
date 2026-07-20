/* staff-editor.js - an interactive, keyboard-first music staff.
 *
 * Wraps MTT.notation's SVG staff (rendered with `interactive: true`, so every
 * notehead is a focusable `.note-slot`) and lets a learner CONSTRUCT an answer
 * directly on the staff rather than pick from a list:
 *   - Up / Down          shift the focused note by one staff step (pitch)
 *   - Shift + Up / Down   raise / lower its accidental (sharps & flats)
 *   - Left / Right        move between editable notes
 * A compact on-screen control row mirrors those keys for touch/pointer users.
 *
 * Notes are plain `music.js` spelled-note objects ({letter, accidental,
 * octave}); the editor's `columns` array IS the answer state, so reading it back
 * needs no parsing. `setValidity` styles individual notes (e.g. flag a wrong
 * interval red) for a real-time feedback loop.
 *
 * Public surface: global `MTT.staffEditor`.
 *   MTT.staffEditor.create(options) -> { el, getNotes, setValidity, focusFirst, destroy }
 *   MTT.staffEditor.grade(notes, target, opts) -> boolean
 *   MTT.staffEditor.slotValidity(notes, target, opts) -> ("ok"|"error")[]
 *
 * @typedef {{ clef?: string, keySignature?: object|null,
 *   columns: Array<Array<object>>, editableCols?: number[],
 *   range?: { minMidi: number, maxMidi: number }, allowAccidentals?: boolean,
 *   onChange?: Function, label?: string }} EditorOptions
 */
(function (global) {
  "use strict";

  const M = global.MTT.music;
  const N = global.MTT.notation;
  const LETTERS = M.LETTERS;

  // Move a spelled note one staff step (diatonic) up (+1) or down (-1). The new
  // notehead sits on the adjacent line/space with a natural accidental; sharps
  // and flats are added separately (Shift+Up/Down), matching how you actually
  // write on a staff.
  function stepNote(n, dir) {
    let idx = LETTERS.indexOf(n.letter) + dir;
    let oct = n.octave;
    if (idx > 6) { idx -= 7; oct += 1; }
    if (idx < 0) { idx += 7; oct -= 1; }
    return { letter: LETTERS[idx], accidental: 0, octave: oct };
  }

  function withAccidental(n, acc) {
    return { letter: n.letter, accidental: Math.max(-2, Math.min(2, acc)), octave: n.octave };
  }

  function inRange(n, range) {
    if (!range) return true;
    const midi = M.spelledToMidi(n);
    return midi >= range.minMidi && midi <= range.maxMidi;
  }

  // --- Grading (pure; shared by quiz + content authoring) -------------------

  // A comparison key for one note under the chosen policy:
  //   spelling "exact" -> letter + accidental (+ octave unless ignoreOctave)
  //   spelling "pitch" -> sounding pitch, enharmonics equal (mod 12 if ignoreOctave)
  function noteKey(n, spelling, ignoreOctave) {
    if (spelling === "pitch") {
      const midi = M.spelledToMidi(n);
      return "p" + (ignoreOctave ? ((midi % 12) + 12) % 12 : midi);
    }
    return "s" + n.letter + n.accidental + (ignoreOctave ? "" : "@" + n.octave);
  }

  // True when the built notes match the target. Order-insensitive by default (a
  // triad is a set of pitches); pass opts.ordered for melodic answers where the
  // sequence matters.
  function grade(notes, target, opts) {
    opts = opts || {};
    const spelling = opts.spelling || "exact";
    const ignoreOctave = !!opts.ignoreOctave;
    if (!Array.isArray(notes) || notes.length !== target.length) return false;
    const key = (n) => noteKey(n, spelling, ignoreOctave);
    if (opts.ordered) return notes.every((n, i) => key(n) === key(target[i]));
    const a = notes.map(key).sort();
    const b = target.map(key).sort();
    return a.every((k, i) => k === b[i]);
  }

  // Per-note "ok"/"error" aligned to `notes`, for live feedback: a note is ok
  // when its key appears in the (multiset of) target keys, consuming each target
  // slot once so duplicates aren't over-credited.
  function slotValidity(notes, target, opts) {
    opts = opts || {};
    const spelling = opts.spelling || "exact";
    const ignoreOctave = !!opts.ignoreOctave;
    const remaining = target.map((n) => noteKey(n, spelling, ignoreOctave));
    return notes.map((n) => {
      const k = noteKey(n, spelling, ignoreOctave);
      const at = remaining.indexOf(k);
      if (at === -1) return "error";
      remaining.splice(at, 1);
      return "ok";
    });
  }

  // --- The editor -----------------------------------------------------------

  function create(options) {
    const opts = options || {};
    const clef = opts.clef || "treble";
    const keySignature = opts.keySignature || null;
    const range = opts.range || null;
    const allowAccidentals = opts.allowAccidentals !== false;
    const onChange = typeof opts.onChange === "function" ? opts.onChange : null;
    // Deep-copy the seed so the caller's objects are never mutated in place.
    const columns = (opts.columns || []).map((col) => col.map((n) => ({ letter: n.letter, accidental: n.accidental, octave: n.octave })));
    const editableCols = opts.editableCols
      ? new Set(opts.editableCols)
      : new Set(columns.map((_, i) => i)); // all editable unless told otherwise

    // Flat, deterministic slot order (column-major) shared by getNotes /
    // setValidity so a flat validity array lines up with the notes it read back.
    const flatSlots = [];
    columns.forEach((col, ci) => col.forEach((_, ni) => flatSlots.push({ col: ci, note: ni })));
    const editableFlat = flatSlots.filter((s) => editableCols.has(s.col));

    let active = editableFlat.length ? Object.assign({}, editableFlat[0]) : null;
    let validity = null; // last flat "ok"/"error" array, re-applied after re-render

    const el = document.createElement("div");
    el.className = "staff-editor";

    const help = document.createElement("p");
    help.className = "staff-editor-help muted";
    help.textContent = "Use ↑ ↓ to change pitch, ← → to move between notes, Shift+↑ ↓ for sharps & flats.";
    el.appendChild(help);

    const stage = document.createElement("div");
    stage.className = "staff-editor-stage staff-wrap";
    el.appendChild(stage);

    const controls = document.createElement("div");
    controls.className = "staff-editor-controls";
    el.appendChild(controls);

    function ctlBtn(glyph, aria, fn) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "staff-editor-btn";
      b.textContent = glyph;
      b.setAttribute("aria-label", aria);
      b.addEventListener("click", () => { fn(); });
      return b;
    }
    controls.appendChild(ctlBtn("◀", "Previous note", () => moveActive(-1)));
    controls.appendChild(ctlBtn("▶", "Next note", () => moveActive(1)));
    controls.appendChild(ctlBtn("▲", "Raise pitch a step", () => nudgeActive(1)));
    controls.appendChild(ctlBtn("▼", "Lower pitch a step", () => nudgeActive(-1)));
    if (allowAccidentals) {
      controls.appendChild(ctlBtn("♯", "Sharpen", () => accidentalActive(1)));
      controls.appendChild(ctlBtn("♮", "Natural", () => naturalActive()));
      controls.appendChild(ctlBtn("♭", "Flatten", () => accidentalActive(-1)));
    }

    // Delegated on the persistent stage, so it survives every re-render.
    stage.addEventListener("keydown", onKeydown);
    stage.addEventListener("click", onClick);

    render();

    function activeIndex() {
      if (!active) return -1;
      return editableFlat.findIndex((s) => s.col === active.col && s.note === active.note);
    }

    function onKeydown(e) {
      const slot = e.target.closest && e.target.closest(".note-slot");
      if (!slot || slot.classList.contains("fixed")) return;
      active = { col: +slot.dataset.col, note: +slot.dataset.note };
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (e.shiftKey && allowAccidentals) accidentalActive(1); else nudgeActive(1);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (e.shiftKey && allowAccidentals) accidentalActive(-1); else nudgeActive(-1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault(); moveActive(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault(); moveActive(1);
      }
    }

    function onClick(e) {
      const slot = e.target.closest && e.target.closest(".note-slot");
      if (!slot || slot.classList.contains("fixed")) return;
      active = { col: +slot.dataset.col, note: +slot.dataset.note };
      focusActive();
    }

    function moveActive(dir) {
      if (!editableFlat.length) return;
      let i = activeIndex();
      if (i === -1) i = 0;
      else i = Math.max(0, Math.min(editableFlat.length - 1, i + dir));
      active = Object.assign({}, editableFlat[i]);
      focusActive();
    }

    function setActiveNote(next) {
      if (!active || next == null) return;
      if (!inRange(next, range)) return; // refuse a move outside the allowed compass
      columns[active.col][active.note] = next;
      render();
      focusActive();
      if (onChange) onChange(getNotes());
    }

    function nudgeActive(dir) {
      if (!active) { moveActive(0); if (!active) return; }
      setActiveNote(stepNote(columns[active.col][active.note], dir));
    }

    function accidentalActive(delta) {
      if (!allowAccidentals || !active) return;
      const n = columns[active.col][active.note];
      setActiveNote(withAccidental(n, n.accidental + delta));
    }

    function naturalActive() {
      if (!allowAccidentals || !active) return;
      const n = columns[active.col][active.note];
      setActiveNote(withAccidental(n, 0));
    }

    function render() {
      stage.innerHTML = N.staffHTML({
        clef,
        keySignature,
        notes: columns,
        accidentals: "all",
        interactive: true,
        label: opts.label,
      });
      // Mark non-editable slots so they neither take focus nor look actionable.
      stage.querySelectorAll(".note-slot").forEach((slot) => {
        if (!editableCols.has(+slot.dataset.col)) {
          slot.classList.add("fixed");
          slot.setAttribute("tabindex", "-1");
          slot.removeAttribute("role");
        }
      });
      if (validity) applyValidity(validity);
    }

    function focusActive() {
      if (!active) return;
      const sel = `.note-slot[data-col="${active.col}"][data-note="${active.note}"]`;
      const node = stage.querySelector(sel);
      if (node) { try { node.focus(); } catch { /* detached */ } }
    }

    function applyValidity(arr) {
      flatSlots.forEach((s, i) => {
        const node = stage.querySelector(`.note-slot[data-col="${s.col}"][data-note="${s.note}"]`);
        if (!node) return;
        node.classList.remove("error", "ok");
        const state = arr[i];
        if (state === "error") node.classList.add("error");
        else if (state === "ok") node.classList.add("ok");
      });
    }

    function getNotes() {
      return flatSlots.map((s) => {
        const n = columns[s.col][s.note];
        return { letter: n.letter, accidental: n.accidental, octave: n.octave };
      });
    }

    return {
      el,
      getNotes,
      // Accepts a flat "ok"/"error"/"" array aligned to getNotes() order.
      setValidity(arr) { validity = arr ? arr.slice() : null; applyValidity(validity || []); },
      focusFirst() { if (editableFlat.length) { active = Object.assign({}, editableFlat[0]); focusActive(); } },
      destroy() {
        stage.removeEventListener("keydown", onKeydown);
        stage.removeEventListener("click", onClick);
      },
    };
  }

  const api = { create, grade, slotValidity };

  global.MTT = global.MTT || {};
  global.MTT.staffEditor = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
