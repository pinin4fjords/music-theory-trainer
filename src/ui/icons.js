/* ui/icons.js - small category glyphs for topic tiles.
 *
 * The Learn, Aural and Explainers grids were walls of text-only tiles. This
 * gives each topic a one-color line icon (drawn with the app's single accent
 * color, matching the existing minimal design) so a grade's tile row reads at
 * a glance instead of as a paragraph list. Category is inferred from the
 * topic's stable `id`, since titles vary in wording but ids are consistent
 * across grades (e.g. every rhythm topic's id contains "time" or "rhythm").
 *
 * Public surface: global `MTT.ui.icons`.
 */
(function (global) {
  "use strict";

  // Each entry is the inner markup of a 24x24 icon. The shared <svg> wrapper
  // sets stroke=currentColor so every icon inherits the tile's accent color;
  // filled shapes (noteheads, dots) opt out of the stroke individually.
  const ICONS = {
    // Reading pitch: notation, clefs.
    notes: `<circle cx="9" cy="18" r="3" fill="currentColor" stroke="none"/><path d="M12 18V4c3 0 5 2 5 5"/>`,
    // Beats, note values, tempo: a metronome.
    rhythm: `<path d="M8 20h8L14 5h-4L8 20Z"/><path d="M12 8V5"/><path d="M12 8l3 9"/><circle cx="12" cy="8" r="1" fill="currentColor" stroke="none"/>`,
    // Scales & key signatures: piano keys.
    keys: `<rect x="4" y="6" width="16" height="14" rx="1"/><path d="M9.3 6v8"/><path d="M14.7 6v8"/><rect x="6.5" y="6" width="3" height="8" fill="currentColor" stroke="none"/><rect x="14.5" y="6" width="3" height="8" fill="currentColor" stroke="none"/>`,
    // Distance between two notes.
    interval: `<circle cx="6" cy="17" r="2.2" fill="currentColor" stroke="none"/><circle cx="18" cy="7" r="2.2" fill="currentColor" stroke="none"/><path d="M6 17 18 7" stroke-dasharray="1 3.2"/>`,
    // Triads and harmony: stacked noteheads.
    chord: `<circle cx="9" cy="19" r="2.6" fill="currentColor" stroke="none"/><circle cx="9" cy="13" r="2.6" fill="currentColor" stroke="none"/><circle cx="9" cy="7" r="2.6" fill="currentColor" stroke="none"/><path d="M11.6 7V19"/>`,
    // Directions & signs: a label tag.
    terms: `<path d="M4 6h9l7 7-9 9-7-7V6Z"/><circle cx="8.5" cy="10.5" r="1.3" fill="currentColor" stroke="none"/>`,
    // Shifting pitch up or down.
    transpose: `<path d="M7 15V6"/><path d="M4.5 8.5 7 6l2.5 2.5"/><path d="M17 9v9"/><path d="M14.5 15.5 17 18l2.5-2.5"/>`,
    // Instruments & voices (SATB).
    instrument: `<path d="M3 12h10l5-3v6l-5-3"/><path d="M6 9v1.4"/><path d="M8 9v1.4"/><path d="M10 9v1.4"/>`,
    // Writing/composing music.
    compose: `<path d="M4 20l1-4L16 5l3 3L8 19l-4 1Z"/><path d="M14 7l3 3"/>`,
    // Aural: listening tasks.
    ear: `<path d="M9 5a6 6 0 0 1 6 6c0 3-2 3-2 6a3 3 0 0 1-6 0"/><path d="M9 5a4 4 0 0 0-4 4c0 2 1.5 2.5 1.5 4.5"/>`,
    // Aural: echo/sight singing.
    voice: `<path d="M12 15a3.5 3.5 0 0 0 3.5-3.5V7a3.5 3.5 0 0 0-7 0v4.5A3.5 3.5 0 0 0 12 15Z"/><path d="M7 11.5a5 5 0 0 0 10 0"/><path d="M12 16v3"/>`,
    // Acoustics & physics explainers.
    wave: `<path d="M3 12c2-6 4-6 6 0s4 6 6 0 4-6 6 0"/>`,
  };

  // A topic's id normally encodes its category well enough on its own, except
  // for a handful of ids that reuse a word ("chromatic") across two different
  // concepts - those get an explicit override instead of a fragile regex.
  const OVERRIDES = {
    "g7-chromatic": "chord", // "Chromatic chords", not the chromatic scale.
    monochord: "wave", // its id contains the substring "chord", not a harmony topic.
  };

  // Ordered id-substring rules, first match wins. Order matters where one id
  // could otherwise match more than one rule (e.g. "aural...sing" before the
  // more general "aural").
  const RULES = [
    [/aural.*sing|sight-sing/, "voice"],
    [/aural/, "ear"],
    [/interval|quality/, "interval"],
    [/composition|harmony-write/, "compose"],
    [/triad|chord|figured|non-chord|aug-sixth|secondary-dominant/, "chord"],
    [/transposition/, "transpose"],
    [/instrument/, "instrument"],
    [/terms|ornament/, "terms"],
    [/rhythm|time|compound|irregular|note-values|metre/, "rhythm"],
    [/key|melodic|degree-names|chromatic|double-acc|three-minors|modes|circle-of-fifths|keyboard/, "keys"],
    [/notes|clef|notation/, "notes"],
    [/monochord|harmonic-series|consonance|cents|timbre|temperament/, "wave"],
  ];

  function categoryFor(id) {
    if (!id) return "notes";
    if (OVERRIDES[id]) return OVERRIDES[id];
    const match = RULES.find(([re]) => re.test(id));
    return match ? match[1] : "notes";
  }

  // Returns a <span class="topic-icon"> wrapping the SVG for a topic's id.
  function iconHtml(id) {
    const inner = ICONS[categoryFor(id)];
    return `<span class="topic-icon" aria-hidden="true"><svg class="topic-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${inner}</svg></span>`;
  }

  const api = { categoryFor, iconHtml };

  global.MTT = global.MTT || {};
  global.MTT.ui = global.MTT.ui || {};
  global.MTT.ui.icons = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
