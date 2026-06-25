# Why & What - a music theory trainer

> ⚠️ **Disclaimer.** This is a personal toy project I built to help my own revision,
> shared as-is with **absolutely no warranty**. It is not affiliated with or endorsed by
> any examination board, it is not guaranteed to be correct, and it must not be relied on
> for exam preparation - if you use it and an exam goes badly, that's on the exam, not on
> this. Use entirely at your own risk.

A clean, self-contained web app for a few minutes of music-theory practice each day.
This is graded music *theory* (the written side). Set any grade from 1 to 8 and the
daily session follows. Every topic is grounded in *why* (where equal temperament comes
from, why minor has three forms, modes beyond major/minor) as well as *what*.

It is a **no-build, no-server static site**: the browser loads the source directly, with
no bundler and no transpile step. It also has a real automated test suite and CI.

## Running it

Live at **https://pinin4fjords.github.io/music-theory-trainer/** - no install needed.

Locally, just open `index.html` in a browser (`open index.html` on macOS), or serve the
folder with any static server. The hosted/served version is preferable because browsers
persist `localStorage` reliably over `http(s)://` but not always over `file://` (the app
detects this and offers a file backup).

## Developing

```bash
npm install
npm run check        # lint + content validation + tests (exactly what CI runs)

npm test             # vitest (watch: npm run test:watch)
npm run lint         # eslint
npm run validate-content   # schema-check the curriculum + 60 questions/generator
npm run coverage     # test coverage report
```

No build step is required to *run* the app; the tooling above is only for development.

## Architecture

The app is split into small modules, each a classic browser script that attaches its API
to a single global `MTT` namespace and also exports via `module.exports` so the test
runner can load it. `index.html` loads them in dependency order; there is no bundler.

```
index.html ── loads, in order:
│
├── src/core/rng.js        seeded PRNG (deterministic randomness)        MTT.rng
├── src/music.js           theory model: notes, intervals, scales,       MTT.music
│                          key sigs, triads, transposition, inversion
├── src/core/validate.js   Topic + Question schema contracts             MTT.validate
├── src/core/diagnose.js   diagnostic feedback (likely-confusion hints)  MTT.diagnose
├── src/notation.js        dependency-free SVG staff + text description  MTT.notation
├── src/audio.js           Web Audio synth (autoplay-safe lifecycle)     MTT.audio
├── src/core/srs.js        Leitner spaced repetition + response signals  MTT.srs
├── src/core/analytics.js  local-only weak-area analytics                MTT.analytics
├── src/core/storage.js    versioned persistence + migration + backup    MTT.storage
├── src/core/persist.js    durable: persist()+IndexedDB+linked file      MTT.persist
├── src/content.js         the curriculum (Grades 1-8) + generators      MTT.content
├── src/core/session.js    session assembly (filter, order, validate)    MTT.session
├── src/core/state.js      central state store (DOM-free)                MTT.state
├── src/ui/components.js   reusable, accessible DOM primitives           MTT.ui.components
├── src/ui/router.js       view routing + focus/announce on change       MTT.ui.router
├── src/ui/views/*.js      home, learn, quiz, explainer, playground      MTT.ui.views.*
├── src/ui/app.js          orchestrator: wires store + router + header   MTT.app
└── src/main.js            browser entry (auto-boot on DOMContentLoaded)
```

**Responsibilities are kept separate:** theory maths lives only in `music.js`, notation
rendering only in `notation.js`, the audio engine only in `audio.js`, and the curriculum
only in `content.js`. The quiz engine is content-agnostic - growing `content.js` grows
the app with no changes elsewhere.

Critical data shapes (`SpelledNote`, `Interval`, `KeySig`, `Question`, `Card`) are
documented as JSDoc typedefs in their modules.

### Why classic scripts and not ES modules?

ES modules don't load over `file://` in most browsers (CORS), which would break the
"just open `index.html`" promise. So each module is a small IIFE attaching to `MTT`. The
same files set `module.exports` when required by Node, so the test suite loads the *exact
same source* the browser runs - no bundler, no second copy.

## Deterministic generation & testing

All randomness flows through a single seeded PRNG (`src/core/rng.js`, Mulberry32). Every
question generator takes an `rng` argument and uses it for every choice; session assembly,
card ordering and shuffling all thread the same instance. Production seeds from the clock
(sessions vary); **tests pass a fixed seed, so a generator's output is exactly
reproducible** and can be asserted on.

`test/generators.test.js` and `npm run validate-content` generate 60 questions from every
generator under a fixed seed and assert each one is schema-valid; a malformed question
fails the build. At runtime, the session builder revalidates each generated question and
**skips** any invalid one (logging a structured warning with the topic id and reason), so
one bad generator can never crash practice.

## Persistence & migration

Progress (streak, totals, per-topic spaced-repetition state, settings) is stored locally,
**per-browser and per-device**. There is no server, by design - so every visitor gets their
own private progress.

Durability without a backend (`src/core/persist.js`):

- **`navigator.storage.persist()`** is requested on load, asking the browser not to evict
  the data under storage pressure.
- An **IndexedDB mirror** (sturdier and larger than `localStorage`) is written on every
  change, so a cleared `localStorage` can recover.
- An optional **linked save-file** (File System Access API): pick a file once and every
  change auto-saves to it. Point it at a Drive/Dropbox folder and progress follows you
  across devices - no accounts, no server. Chromium-only; other browsers fall back to the
  manual **Back up / Restore** file (still available everywhere).

On load, the **newest** copy across `localStorage` / IndexedDB / the linked file wins (each
save stamps `savedAt`), reconciled after first paint so the UI stays instant.

State is **versioned** (`stateVersion`). On load, legacy data is run forward through a
migration pipeline to the current shape, so a returning learner never loses progress:

| Version | Shape | Migration |
| --- | --- | --- |
| v1 (legacy, no `stateVersion`) | `{ boxes: {id:int}, lastSeen: {id:ts}, streak, settings:{sound,grade} }` | → v2 |
| **v2 (current)** | `{ stateVersion:2, savedAt, srs: {id: Card}, streak, bestStreak, daysPracticed, totalAnswered, settings:{sound,grade,mode,reducedMotion,theme} }` | the Leitner box and `lastSeen` become an SRS `Card`; box (the real progress) and scheduling are preserved. New settings default in via `normalize()`, so older v2 data needs no separate migration |

Resilience: corrupt or unreadable stored data falls back to clean defaults; imported
backups are parsed, validated (clear error messages on a bad file) and migrated; partial
or hand-edited state is merged onto defaults so no key is ever missing.

## Accessibility

- **Full keyboard operability** - every control is a real `<button>`/`<select>`;
  clickable cards are buttons, not divs. Quiz answers also accept number-key shortcuts.
- **ARIA-live announcements** for answer feedback and session changes.
- **Text alternatives for notation** - every rendered staff carries an `aria-label`
  describing it, and notation-bearing prompts set a plain-text `a11yText`.
- **Visible focus** via `:focus-visible`, plus a skip-to-content link.
- **Reduced motion** - animations/transitions are disabled under
  `prefers-reduced-motion` (and a stored setting).
- **Light / dark theme** - a header toggle cycles light → dark → system; "system"
  follows (and live-updates with) the OS `prefers-color-scheme`. All colours are CSS
  custom-property tokens themed for both modes.

## Pedagogy

- **Diagnostic feedback**: a wrong answer explains the *likely confusion* (e.g. "right
  number, wrong quality: a major 6th vs a minor 6th differ by a semitone"), not just
  "wrong".
- **Spaced repetition** tracks per-topic accuracy and response time, and resurfaces weak
  or overdue topics first; the home screen surfaces "focus areas".
- **Estimated level** - a constant header badge estimates the highest grade you've
  *demonstrated* (enough topics seen, high enough mastery, all lower grades solid too),
  computed locally from your practice (`analytics.estimatedLevel`). It's an estimate, not
  an assessment.
- **Lower-grade interleaving** - a higher-grade session always mixes in a diagnostic slice
  of lower-grade questions, so the app can see what you *do* know even when the
  grade-level questions are hard. "Learning path" mode still leads with the current grade.
- **Two modes**: *Daily mix* (spaced review across the current grade and below) and a
  *Learning path* that leads with the current grade's new material.
- **The science of music**, tied into practice: interactive explainers for the
  monochord (a string over a box - the origin of pitch and the simple-ratio
  intervals), the harmonic series, the circle of fifths, temperament, the three
  minors and the modes. A "dig deeper" link in the answer reveal threads from a
  question straight into the explainer behind it.
- **First-run onboarding** (a one-step grade picker) and a per-topic **finish-screen
  breakdown** so a session opens and closes with structure.
- **Grades 1-6** carry full practice drills; **Grades 7-8** carry the drillable
  identification items (chromatic chords, augmented sixths, secondary dominants) plus
  clearly-flagged "coming next" topics for the open-ended composition/analysis work that
  isn't suited to multiple-choice drilling.

## Testing

The suite (`test/`, Vitest + jsdom) covers:

- music primitives (intervals incl. compound/inversion, scales, key sigs, enharmonics, roundtrip invariants)
- SRS behaviour (promotion/demotion/due/priority/weakness)
- session assembly (grade filtering, foundational review, determinism, invalid-content skipping)
- deterministic RNG
- schema validation + whole-curriculum validity
- content generators (60 questions/generator, determinism, diagnostic meta)
- storage migration + backup/restore + corruption fallback
- the state store (answers, streaks, persistence)
- DOM quiz flow (boot, navigation, answering, feedback, streak)
- accessibility (live region, staff labels, button choices, number-key select, focus)

## Roadmap

- Operationalise the Grade 6-8 open-ended topics with guided, checkable steps
  (figured-bass realisation, melody continuation, harmonisation) rather than free text.
- Notation-rendered cadences/chords for Grade 6+ (currently description-based for the
  more advanced chromatic chords).
- Audio-first ear-training drills (interval/chord recognition by sound alone).
- Optional per-topic "explain more" links from quiz feedback into the lessons.
- Richer analytics view (progress over time per grade).

## License

MIT - see `LICENSE`.
