/* notation.js - the staff renderer.
 *
 * A self-contained SVG music staff: five lines, ellipse noteheads, stems, ledger
 * lines, hand-built clef glyphs (treble / bass / alto / tenor) and Unicode
 * accidentals. No external font or library, so it stays offline-safe and
 * themable - everything draws in `currentColor`, so the surrounding CSS colour
 * controls the ink.
 *
 * Every rendered staff carries an `aria-label` text description (see describe),
 * so screen readers announce "Treble clef. C4, E4" instead of an opaque image.
 *
 * Public surface: global `MTT.notation`.
 *   MTT.notation.staff(spec)     -> <svg> element (needs a DOM)
 *   MTT.notation.staffHTML(spec) -> string (pure; safe in Node)
 *   MTT.notation.describe(spec)  -> plain-text alternative (pure)
 *
 * @typedef {{ clef?: "treble"|"bass"|"alto"|"tenor", keySignature?: object|null,
 *   notes?: Array, accidentals?: "auto"|"all"|"none", scale?: number,
 *   label?: string }} StaffSpec
 */
(function (global) {
  "use strict";

  const M = global.MTT.music;
  const LETTERS = M.LETTERS;

  const S = 12;
  const STEP = S / 2;
  const PAD_TOP = 3.5 * S;
  const PAD_BOTTOM = 3.5 * S;
  const STAFF_H = 4 * S;
  const NOTE_RX = S * 0.66;
  const NOTE_RY = S * 0.5;
  const STEM_LEN = 3.1 * S;
  const COL_W = 2.3 * S;
  const SIG_W = S * 0.95;

  function pos(letter, octave) { return octave * 7 + LETTERS.indexOf(letter); }

  const CLEFS = {
    treble: { refLine: 4, refP: pos("E", 4) },
    bass: { refLine: 4, refP: pos("G", 2) },
    alto: { refLine: 2, refP: pos("C", 4) },
    tenor: { refLine: 1, refP: pos("C", 4) },
  };

  // Key-signature accidental positions, as diatonic steps below the top line.
  // Treble/alto/bass follow standard engraving. Tenor placement is legible but
  // approximate (the app does not render key signatures on the tenor clef; it is
  // used for note reading), so its positions keep all accidentals on the staff.
  const SIG_STEPS = {
    treble: { sharp: [0, 3, -1, 2, 5, 1, 4], flat: [4, 1, 5, 2, 6, 3, 7] },
    alto: { sharp: [1, 4, 0, 3, 6, 2, 5], flat: [5, 2, 6, 3, 7, 4, 8] },
    bass: { sharp: [2, 5, 1, 4, 7, 3, 6], flat: [6, 3, 7, 4, 8, 5, 9] },
    tenor: { sharp: [2, 5, 1, 4, 7, 3, 6], flat: [3, 0, 4, 1, 5, 2, 6] },
  };

  const GLYPH = { "-2": "𝄫", "-1": "♭", "0": "♮", "1": "♯", "2": "𝄪" };

  const CLEF_GLYPHS = {
    treble: {
      anchorLine: 3, localRefY: 64, spaceHeight: 6.6, localH: 100,
      path: "M21 4 C12 12 12 26 21 35 C32 46 7 52 7 67 C7 82 27 84 30 68 "
        + "C32 56 16 57 17 67 C18 75 26 74 25 65 M21 4 L29 66 "
        + "C30 78 23 84 16 82",
    },
    bass: {
      anchorLine: 1, localRefY: 16, spaceHeight: 3.3, localH: 66,
      path: "M8 6 C26 6 34 18 34 30 C34 52 16 60 4 64 C20 56 26 46 26 32 "
        + "C26 20 20 12 8 12 Z M40 16 a4 4 0 1 1 0.1 0 Z M40 30 a4 4 0 1 1 0.1 0 Z",
    },
    alto: {
      anchorLine: 2, localRefY: 48, spaceHeight: 4, localH: 96,
      path: "M4 2 L10 2 L10 94 L4 94 Z M14 2 L18 2 L18 94 L14 94 Z "
        + "M22 2 C40 4 40 44 24 48 C40 52 40 92 22 94 "
        + "C36 86 34 54 22 50 L22 46 C34 42 36 10 22 2 Z",
    },
    tenor: {
      anchorLine: 1, localRefY: 48, spaceHeight: 4, localH: 96,
      path: "M4 2 L10 2 L10 94 L4 94 Z M14 2 L18 2 L18 94 L14 94 Z "
        + "M22 2 C40 4 40 44 24 48 C40 52 40 92 22 94 "
        + "C36 86 34 54 22 50 L22 46 C34 42 36 10 22 2 Z",
    },
  };

  function diatonic(n) { return n.octave * 7 + LETTERS.indexOf(n.letter); }
  function lineY(i) { return PAD_TOP + i * S; }

  function yForP(clef, p) {
    const c = CLEFS[clef];
    return lineY(c.refLine) - (p - c.refP) * STEP;
  }
  function yForNote(clef, n) { return yForP(clef, diatonic(n)); }

  function sigEffect(sig, letter) {
    if (!sig || !sig.accidentals) return 0;
    if (sig.accidentals.indexOf(letter) === -1) return 0;
    return sig.type === "sharp" ? 1 : -1;
  }

  function accidentalGlyph(note, sig, mode) {
    if (mode === "none") return null;
    const keyAcc = sigEffect(sig, note.letter);
    if (mode === "all") {
      if (note.accidental === 0 && keyAcc === 0) return null;
      return GLYPH[String(note.accidental)];
    }
    if (note.accidental === keyAcc) return null;
    return GLYPH[String(note.accidental)];
  }

  function svgEl(tag, attrs) {
    const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function clefMarkup(clef, x) {
    const g = CLEF_GLYPHS[clef];
    const scale = (g.spaceHeight * S) / g.localH;
    const ty = lineY(g.anchorLine) - g.localRefY * scale;
    return `<g transform="translate(${r(x)} ${r(ty)}) scale(${r(scale, 4)})">`
      + `<path d="${g.path}" fill="currentColor" stroke="currentColor" `
      + `stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></g>`;
  }

  function clefWidth(clef) {
    const g = CLEF_GLYPHS[clef];
    const scale = (g.spaceHeight * S) / g.localH;
    return (clef === "bass" ? 48 : clef === "alto" || clef === "tenor" ? 22 : 38) * scale;
  }

  function noteheadMarkup(cx, cy) {
    return `<ellipse cx="${r(cx)}" cy="${r(cy)}" rx="${r(NOTE_RX)}" ry="${r(NOTE_RY)}" `
      + `fill="currentColor" transform="rotate(-22 ${r(cx)} ${r(cy)})"/>`;
  }

  function accidentalMarkup(cx, cy, glyph) {
    return `<text x="${r(cx)}" y="${r(cy)}" font-size="${r(S * 1.9)}" `
      + `text-anchor="end" dominant-baseline="central" fill="currentColor" `
      + `font-family="serif">${glyph}</text>`;
  }

  function ledgerMarkup(cx, ys) {
    const half = NOTE_RX * 1.55;
    const top = lineY(0), bot = lineY(4);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const parts = [];
    for (let yl = top - S; yl >= minY - 1; yl -= S) parts.push(line(cx - half, yl, cx + half, yl, 1.4));
    for (let yl = bot + S; yl <= maxY + 1; yl += S) parts.push(line(cx - half, yl, cx + half, yl, 1.4));
    return parts.join("");
  }

  function line(x1, y1, x2, y2, w) {
    return `<line x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}" `
      + `stroke="currentColor" stroke-width="${w}" stroke-linecap="round"/>`;
  }

  function r(n, places = 2) { return Number(n.toFixed(places)); }

  function escapeAttr(s) {
    return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // A plain-text alternative for screen readers, e.g.
  // "Treble clef, key signature 2 sharps. Notes: D4, F#4, A4."
  function describe(spec) {
    const clef = spec.clef || "treble";
    const parts = [clef.charAt(0).toUpperCase() + clef.slice(1) + " clef"];
    const sig = spec.keySignature;
    if (sig && typeof sig.count === "number" && sig.count !== 0) {
      const n = Math.abs(sig.count);
      parts[0] += ", key signature " + n + " " + sig.type + (n > 1 ? "s" : "");
    }
    const cols = (spec.notes || []).map((c) => (Array.isArray(c) ? c : [c]));
    const names = cols.map((col) =>
      col.map((nn) => M.spelledName(nn, { unicode: false }) + nn.octave).join(" and "));
    if (names.length) parts.push("Notes: " + names.join(", "));
    return parts.join(". ") + ".";
  }

  function staffHTML(spec) {
    const clef = spec.clef || "treble";
    const sig = spec.keySignature || null;
    const mode = spec.accidentals || "auto";
    const columns = (spec.notes || []).map((c) => (Array.isArray(c) ? c : [c]));

    let x = S * 0.9;
    const parts = [];
    const clefX = x;
    x += clefWidth(clef) + S * 0.5;

    if (sig && sig.accidentals && sig.accidentals.length) {
      const steps = SIG_STEPS[clef][sig.type];
      const glyph = sig.type === "sharp" ? "♯" : "♭";
      sig.accidentals.forEach((_, i) => {
        const gy = lineY(0) + steps[i] * STEP;
        parts.push(`<text x="${r(x + i * SIG_W)}" y="${r(gy)}" font-size="${r(S * 1.9)}" `
          + `text-anchor="start" dominant-baseline="central" fill="currentColor" `
          + `font-family="serif">${glyph}</text>`);
      });
      x += sig.accidentals.length * SIG_W + S * 0.4;
    }

    const firstColX = x + COL_W * 0.5;
    columns.forEach((notes, i) => {
      const cx = firstColX + i * COL_W;
      const ys = notes.map((n) => yForNote(clef, n));
      parts.push(ledgerMarkup(cx, ys));
      const midY = lineY(2);
      const avg = ys.reduce((a, b) => a + b, 0) / ys.length;
      const up = avg >= midY;
      const topY = Math.min(...ys), botY = Math.max(...ys);
      if (up) parts.push(line(cx + NOTE_RX * 0.92, botY, cx + NOTE_RX * 0.92, topY - STEM_LEN, 1.6));
      else parts.push(line(cx - NOTE_RX * 0.92, topY, cx - NOTE_RX * 0.92, botY + STEM_LEN, 1.6));
      notes.forEach((n, j) => {
        const cy = ys[j];
        parts.push(noteheadMarkup(cx, cy));
        const g = accidentalGlyph(n, sig, mode);
        if (g) parts.push(accidentalMarkup(cx - NOTE_RX - S * 0.18, cy, g));
      });
    });

    const width = columns.length
      ? firstColX + (columns.length - 1) * COL_W + COL_W * 0.5 + S
      : x + S;
    const height = PAD_TOP + STAFF_H + PAD_BOTTOM;

    const lx0 = S * 0.5, lx1 = width - S * 0.5;
    let staffLines = "";
    for (let i = 0; i < 5; i++) staffLines += line(lx0, lineY(i), lx1, lineY(i), 1.1);

    const css = spec.scale ? `height:${r(height * spec.scale)}px;` : "";
    const label = escapeAttr(spec.label || describe(spec));
    return `<svg class="staff" viewBox="0 0 ${r(width)} ${r(height)}" `
      + `width="${r(width)}" height="${r(height)}" style="${css}max-width:100%" `
      + `xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label}">`
      + staffLines + clefMarkup(clef, clefX) + parts.join("") + `</svg>`;
  }

  function staff(spec) {
    const wrap = document.createElement("div");
    wrap.innerHTML = staffHTML(spec).trim();
    return wrap.firstChild;
  }

  const api = {
    staff, staffHTML, describe,
    yForNote, yForP, diatonic, CLEFS, svgEl,
  };

  global.MTT = global.MTT || {};
  global.MTT.notation = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
