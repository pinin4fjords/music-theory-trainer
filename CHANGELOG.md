# Changelog

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
