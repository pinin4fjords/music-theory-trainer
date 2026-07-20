# Changelog

## 2.6.0 - Build answers on the staff

- **Interactive staff editor** (`src/staff-editor.js`): a keyboard-first,
  touch-friendly staff where notes are constructed rather than picked. ↑/↓ shift a
  note by a staff step, Shift+↑/↓ add sharps and flats, ←/→ move between notes; an
  on-screen ◀▶ ▲▼ ♯♮♭ control row mirrors the keys. Each notehead is a focusable
  slot that can be flagged (e.g. a wrong interval turns red) for real-time feedback.
- **Constructed-answer quiz questions**: build tasks are mixed into existing
  topics across grades - write a named note, build a tonic triad, spell an interval
  above a fixed root, raise the 7th to reach harmonic minor, build a dominant 7th.
  Grading is task-dependent (exact spelling where it matters, enharmonic-tolerant
  where it doesn't).
- **Interactive explainers**: the intervals (keyboard) explainer gains a
  build-it-on-the-staff card, three-minors lets you raise the 7th yourself, and a
  new "Build a triad" explainer names the quality as you stack the thirds.
- **Playground "Build" mode**: a free staff you shape yourself, naming the
  interval/triad and playing it back, with the keyboard kept in sync.
- Tests: build-task grading, editor keyboard/validity, quiz integration, generator
  solvability, and the new interactive surfaces.

## 2.5.0 - Linkable pages, reference menu, clearer acoustics

- **Linkable pages (hash routing)**: the URL hash now reflects the page -
  `#reference/keys`, `#explore/harmonic-series`, `#learn/g4-key-signatures` - so
  individual pages can be linked/bookmarked and the browser back/forward buttons
  work. No server needed (fine on GitHub Pages and file://).
- **Reference: menu instead of a monolith**: sections are grouped in a sidebar
  menu (Pitch & keys, Chords & harmony, Rhythm & metre, Tempo & expression,
  French & German, Instruments & voices) with a content pane; search still filters
  across everything.
- **Much fuller reference**: added clefs, scales & modes, chord types, transposing
  instruments, enharmonic equivalents, tuplets, order of sharps/flats, and a far
  bigger terms glossary (tempo, dynamics, articulation, expression, navigation,
  French & German).
- **Clearer acoustics**: the harmonic-series and monochord explainers now spell
  out the difference between multiplying frequency (×2, ×3, ×4 - intervals shrink
  as you climb) and an interval as a ratio (a 5th = 3:2, e.g. 440→660 Hz), with
  concrete Hz throughout (both pages anchored on A, so 440 = the 4th partial).
- Tests: 158 total (reference menu + search, hash deep-links).

## 2.4.0 - Reference look-up + graphical monochord

- **Reference section** (new tab): the curriculum's facts in look-up form -
  key signatures, intervals, scale degrees, note values, time signatures,
  ornaments, foreign terms, cadences, figured bass, chromatic chords, instruments
  and voices - as tables/glossaries with a single search box that filters across
  every section. Built from the same data the drills use.
- **Graphical monochord**: the "A string over a box" explainer now shows an
  interactive SVG of a string over a soundbox that visibly shortens and vibrates
  (a standing-wave arch, animated unless reduced-motion) as you pick each
  whole-number fraction, wired to the audio.
- Tests: 154 total (reference rendering + search filtering).

## 2.3.0 - Progress view + explainer thread in lessons

- **Progress view**: estimated level, overall accuracy, per-grade mastery bars
  (up to the current grade) and tappable weak-area chips - reached by clicking the
  header level chip or the new Progress card on home. Empty state before any practice.
- **Explainer thread in lessons**: Learn topic pages now carry the same "dig
  deeper" link into the relevant explainer that the quiz reveal does.
- Tests: 152 total (added progress-view rendering, level-chip navigation, empty state).

## 2.2.0 - UX-review fixes, onboarding, reset, science content

Acting on a UX review, plus a "science of music" content pass.

- **Quiz loop**: dominant prompt, de-emphasised topic label, a "3 / 10" counter,
  a confident (no longer dashed) "I don't know" button, and a finish screen that
  closes the loop with a per-topic correct/wrong breakdown.
- **First-run onboarding**: a one-step grade picker when no grade is chosen yet;
  the empty stats panel is hidden until there's data; the disclaimer moved to the
  footer so it no longer front-loads doubt.
- **Reset progress**: a confirmed reset that wipes streak/history/SRS back to
  defaults (keeping preferences) and clears the IndexedDB / linked-file copies.
- **Navigation**: the "Why" tab is now "Explainers"; the answer reveal offers a
  "Dig deeper" link into the relevant explainer.
- **Lighter header**: sound + theme moved into a settings menu.
- **Science of music**: a new "A string over a box" (monochord) explainer -
  origins of pitch, simple-ratio intervals, standing waves and why simple ratios
  sound consonant - tied into the interval lessons via "dig deeper".
- **Crisp, modern redesign** (from 2.1.x): cool near-monochrome palette with a
  single indigo accent, ink buttons, tight corners, flat hairline surfaces, and
  the engraved five-line stave behind the hero headline; full light/dark theming.
- Tests: 149 total (added onboarding, reset, finish breakdown coverage).

## 2.1.0 - Durable persistence, level badge, dark mode

- **Durable, backup-free persistence** (`core/persist.js`): requests
  `navigator.storage.persist()`, mirrors every save to IndexedDB, and adds an optional
  linked save-file (File System Access API) that auto-saves on every change - point it at
  a synced folder and progress follows you across devices, with no accounts or server.
  Newest-wins reconciliation across localStorage / IndexedDB / the file (a `savedAt`
  stamp); manual backup/restore stays as a universal fallback.
- **Estimated-level badge**: a constant header chip estimates the highest grade you've
  demonstrated, computed locally (`analytics.estimatedLevel`).
- **Lower-grade interleaving**: higher-grade sessions guarantee a diagnostic slice of
  lower-grade questions, so the app can gauge what a struggling learner already knows;
  "learning path" mode still leads with the current grade.
- **Light/dark theme**: header toggle (light → dark → system), system-aware and
  live-updating; full token-based theming for both modes.
- **Visual refresh**: lighter layered elevation, refined buttons/cards/quiz choices,
  themed chrome and chips - less "clunky e-learning".
- Tests: +16 (persist reconciliation, estimated level, session interleaving, theme
  toggle, level badge) - 147 total.

## 2.0.0 - Production-quality upgrade

A cohesive upgrade across architecture, correctness, pedagogy, accessibility,
reliability, testing, CI and docs. The app remains a no-build static site; no
existing progress is lost (legacy state is migrated).

### Architecture
- Broke the monolithic `app.js` into focused modules under `src/` (`core/*`,
  `ui/*`, `ui/views/*`), each attaching to a single `MTT` namespace and dual-loadable
  in the browser (classic scripts) and Node (tests). No bundler introduced.
- Separated concerns: theory (`music.js`), notation (`notation.js`), audio
  (`audio.js`), curriculum (`content.js`); engine modules `state`, `storage`, `srs`,
  `session`, `analytics`, `validate`, `diagnose`, `rng`.
- Added JSDoc typedefs for the critical data shapes.

### Determinism
- Added a seeded PRNG (`core/rng.js`: `next/int/pick/shuffle/pickWeighted`) threaded
  through all question generation and card ordering. Production seeds from the clock;
  tests use fixed seeds for reproducible output.

### Content & correctness
- Hardened `music.js`: compound intervals, interval inversion, directional
  transposition, triad-quality derivation, enharmonic helpers.
- Operationalised Grades 5-6 into full drills (all keys to 7 accidentals, all
  interval qualities + compound + inversion, I/ii/IV/V chords + inversions, the four
  cadences, four clefs incl. tenor, transposition incl. transposing instruments,
  foreign terms, instruments/voices, figured bass, V7, non-chord notes).
- Added drillable identification items for Grades 7-8 (diminished 7th, Neapolitan
  6th, augmented sixths, secondary dominants), with open-ended composition topics
  flagged "coming next" rather than left as broken stubs.

### Pedagogy
- Diagnostic feedback on wrong answers (likely-confusion hints).
- SRS now tracks accuracy and response time; weak/overdue topics resurface first.
- "Focus areas" on the home screen; a Learning-path mode alongside Daily mix.

### Accessibility
- Full keyboard operability, ARIA-live announcements, text alternatives for all
  notation, `:focus-visible` rings, skip link, reduced-motion support.

### Reliability
- Audio lifecycle hardened (autoplay-safe unlock, exception-guarded playback, replay).
- Generators/rendering guarded so one bad item never crashes a session; invalid
  generated questions are skipped with structured warnings.

### Persistence
- Versioned state with a v1→v2 migration pipeline; backup/restore validates and
  migrates uploaded files; corruption-safe defaults.

### Schema & validation
- Strict Topic/Question schema contracts, enforced in tests, the standalone content
  validator, and at runtime (graceful skip).

### Testing & CI
- 131-test Vitest + jsdom suite across music, SRS, session, RNG, validation,
  generators (60/generator), storage migration/backup, the state store, DOM quiz
  flow, and accessibility.
- GitHub Actions CI runs install + lint + content validation + tests.

### Docs
- Rewrote the README (architecture map, determinism, persistence/migration,
  accessibility, roadmap); added CONTRIBUTING.md and issue templates.
