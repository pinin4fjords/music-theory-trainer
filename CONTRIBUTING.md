# Contributing

Thanks for helping improve the trainer. This is a no-build static site with a
real test suite; the bar is "musically correct, accessible, and covered by a
test".

## Setup

```bash
npm install
npm run check     # lint + content validation + tests (what CI runs)
```

Run the app with no build at all: open `index.html` in a browser, or serve the
folder. There is no bundler and no transpile step - the browser loads the source
files in `src/` directly as classic scripts.

## Ground rules

- **Be musically correct.** Correctness is the project's whole point. Build on
  the primitives in `src/music.js` rather than re-deriving pitch maths, and add a
  test for anything subtle (enharmonics, augmented/diminished intervals, minor
  forms, key signatures with many accidentals).
- **Write content in your own words.** All "why"/"what" text and explanations
  must be original prose. Do **not** copy wording from any exam board's syllabus
  or published materials. The curriculum is deliberately board-neutral - describe
  what a learner must be able to *do*, in your own phrasing.
- **Keep it deterministic.** Generators must take the seeded `rng` and use it for
  every random choice (see below). No `Math.random()` / `Date.now()` in content
  or core logic - that's what makes sessions reproducible and testable.
- **Keep it accessible.** Any prompt that includes notation must also set
  `a11yText` (a plain-text alternative). New interactive controls must be real
  `<button>`/`<select>` elements (or carry proper roles + keyboard handlers).
- **No backend, no heavy dependencies.** Everything runs locally and offline.

## Adding a practice topic

Topics live in `src/content.js`. The engine (`session`, `srs`, the UI) is
content-agnostic: add a topic with a `questions` generator and it is
automatically picked up into daily practice for its grade and below.

```js
{
  id: "g5-my-topic",                 // unique, kebab-case, grade-prefixed
  title: "My topic",
  why:  "One sentence on why this matters.",   // the hook
  what: "<p>The concise lesson (HTML).</p>",   // the teaching
  questions: (rng) => myGenerator(rng),        // or null for a non-drillable topic
}
```

A generator returns a **Question**:

```js
{
  prompt: "What is ...?",            // HTML; may embed a staff via staffBlock(spec)
  choices: ["a", "b", "c", "d"],     // 2+ unique, non-empty strings, including the answer
  answer: "b",                       // must be one of choices
  explanation: "Because ...",        // optional, instructional
  audio: () => MTT.audio.sequence(notes), // optional
  a11yText: "Plain text ...",        // REQUIRED when the prompt embeds notation
  meta: { type: "interval", number: 6, quality: "major" }, // optional, drives diagnostics
}
```

Helpers in `src/content.js` (`choices(rng, correct, distractors)`,
`pick(rng, arr)`, `staffBlock(spec)`) keep generators short. `meta.type` (one of
`interval`, `keysig`, `inversion`, `chordQuality`) lets `core/diagnose.js` explain
the *likely confusion* behind a wrong answer - add it where it applies.

Non-drillable, open-ended topics (composition, harmonisation) should set
`questions: null` and `tags: ["comingNext"]`; the UI shows a clear "coming next"
note instead of a broken practice button.

## Testing your topic

Content is validated automatically:

```bash
npm run validate-content   # 60 generated questions per generator + schema checks
npm test                   # full suite
```

`test/generators.test.js` already checks every generator produces 60 valid,
deterministic questions, so a new generator is covered the moment it's added. Add
focused unit tests for any new music theory in `test/music.test.js`.

## Pull requests

- `npm run check` must pass (CI runs the same).
- Keep PRs focused and the change complete.
- Match the surrounding code style; comments explain *why*, not *what*.
