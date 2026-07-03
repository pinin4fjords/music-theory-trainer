# Improvement programme

A reviewed, prioritised programme of improvements for the trainer, focused on three axes:
**UX**, **factual accuracy**, and **alignment with ABRSM (UK) exam standards**, with the
aural corpus as the centrepiece. Compiled 2026-07-03 from a full code review plus
verification against the current official ABRSM syllabuses.

**Ground truth used** (stable through at least end of 2028; the 2025/26 practical-syllabus
revision changed repertoire only, and ABRSM has confirmed no aural/supporting-test changes
for 2027/28 either):

- Aural tests: *ABRSM Piano 2025 & 2026 Practical Grades Qualification Specification*,
  aural section pp. 45-52 (aural tests are identical across instruments).
  <https://www.abrsm.org/sites/default/files/2024-06/Piano%202025%20%26%202026%20Prac%20syllabus%2020240524_access.pdf>
- Theory: *ABRSM Music Theory Syllabus from 2020*, Grades 1-5 and 6-8 sheets.
  <https://www.abrsm.org/sites/default/files/2023-09/music-theory-syllabus-outline-grades-1-5-from-2020.pdf>
  <https://www.abrsm.org/sites/default/files/2023-09/theory-syllabus-sheet-2020-g6-8.pdf>
- Note: aural tests belong to **Practical Grades** only. Performance Grades have no aural
  component at all. The Aural view's framing text is broadly right but should say
  "Practical exam", not "performance exam" (the capital-P Performance Grade is precisely
  the exam that *doesn't* include aural).

Severity legend: **P0** = actively teaches something false or is broken now.
**P1** = misaligned with ABRSM or misleading. **P2** = quality/UX improvement.
**P3** = stretch.

---

## Executive summary

The app's architecture is genuinely strong (deterministic generators, validate-and-skip
session assembly, robust persistence, honest self-description). The weaknesses cluster in
three places:

1. **The aural corpus is a fixed, tiny, C-major-centric phrase bank**, and several of its
   stimuli are not just naive but *wrong*: the 6/8 question plays audio identical to 2/4,
   the 2-vs-4-time questions are acoustically undecidable, and the Grade 7/8 sight-singing
   accompaniment plays out-of-key notes against the stated key. The structural fix is a
   **generative stimulus engine** (Workstream A3) rather than more hand-written phrases.
2. **Grade-by-grade task inventory drifts from the real ABRSM aural tests** in specific,
   fixable ways (minor keys a grade early, the Grade 4/5 memory test missing entirely, the
   Grade 7 chord test asking the wrong question, no minor-key starts at Grade 8).
3. **A handful of UX bugs undermine otherwise good flows**: the mic is never released on
   navigation, the advertised number-key shortcuts are dead for most of a session, aural
   drills show "Grade undefined", and the per-grade grading tolerances are configured but
   never read.

Top 10 by impact:

| # | Item | Workstream |
|---|------|------------|
| 1 | 6/8 aural stimulus is byte-identical to 2/4 | A1.1 |
| 2 | 2-vs-4-time questions acoustically undecidable | A1.2 |
| 3 | G7/G8 sight-sing "accompaniment" plays out-of-key notes | A1.3 |
| 4 | Generative aural stimulus engine (kills the memorisable phrase-bank problem) | A3 |
| 5 | Grade task inventory realignment (G2 minors, missing G4A/G5A, G7 chord test, G8 minor-start modulation) | A2 |
| 6 | Mic/audio never released on navigation | C1.1 |
| 7 | Tone/semitone question draws+plays an augmented octave for C→C♯, F→F♯ | B1.1 |
| 8 | Enharmonically-correct distractors marked wrong (transposition questions) | B1.2 |
| 9 | Dead keyboard shortcuts + broken focus management in quiz | C1.2 |
| 10 | Mic grading: tolerances ignored, meter has no target, staff prints the answer | A4 |

---

## Workstream A — the aural corpus

### A1. Correctness bugs in aural stimuli (P0)

**A1.1 The Grade 7 "6/8" option plays the same audio as 2/4.**
`src/aural-content.js:1003-1018` (`g7TimeSigQuestion`): the 6/8 option calls
`meterNotes(2)`, i.e. two plain undivided beats, identical to the 2/4 option. The
explanation then asserts "That was in 6/8 ... each divided into three - a lilting,
swinging feel" which the audio never demonstrated. Whether "2/4" or "6/8" appears in the
explanation is a coin flip on indistinguishable sound.
*Fix:* play the compound subdivision for 6/8 (strong-weak-weak quaver groups, two per
bar, via `sequenceRhythm`; the metre explainer's `buildMetre` already models `[3,3]`
grouping). Then make "simple 2" vs "compound 2" a real hearable distinction, and consider
asking the ABRSM-style question ("two, three, four or 6/8 time") rather than "how many
main beats".

**A1.2 Two-time vs four-time is acoustically undecidable.**
Two related defects:
- `meterNotes()` (`src/aural-content.js:101-110`) accents only beat 1 (E5 vs E4). Two
  bars of 2/4 are then *identical* to one bar of 4/4. Yet `g3TimeSigQuestion` offers 2 and
  4 as competing answers, and its own explanation claims "beats 1 and 3 are stronger" -
  an accent pattern the audio never plays.
- `g4RhythmTimeSigQuestion` (`src/aural-content.js:582-602`) plays the rhythm at uniform
  velocity with no metric accent, and the random cross-meter distractor can be the exact
  same isochronous pattern (e.g. `[1,1]` in 2/4 over two bars vs `[1,1,1,1]` in 4/4), so
  two answer options can both genuinely match what was played.
*Fix:* give `meterNotes`/`sequenceRhythm` a three-level accent scheme (strong / medium on
beat 3 of 4/4 / weak), and exclude patterns from the cross-meter distractor pool that are
audibly equivalent to the target under the played accents.

**A1.3 Grade 7/8 sight-singing accompaniment is out of key.**
`thirdBelow()` (`src/aural-content.js:718-722`) is C-major-diatonic with a chromatic
`midi - 3` fallback. `g7SightSingQuestion`/`g8SightSingQuestion` apply it to G, D and B♭
major phrases, so the "lower part" contains C♮/E♭/F♮ against a stated D major, F♮ against
F♯ in G major, etc. The prompt announces the key, then plays harmony that contradicts it,
actively misleading the singer. (The two/three-part *echo* tasks are safe; they stay in
C major.)
*Fix:* derive the harmony line diatonically in the phrase's own key (a `scaleIndexOf` per
key, or generate both lines together; see A3.4).

**A1.4 "Gradual" dynamics that are terraced.**
`g1DynamicsQuestion` cresc/dim (`src/aural-content.js:309-322`) plays the phrase twice at
two fixed volumes but the answer says "getting louder/quieter" and names crescendo. Ramp
per-note gain across a single playing (the piano path already supports per-note volume).

**A1.5 Stale header comment.** `src/aural-content.js:1` still says "Grades 1-5"; the file
covers 1-8.

### A2. Grade-by-grade alignment with the real ABRSM aural tests (P1)

The current spec, per grade, against what the app does. "≈" = acceptable adaptation of a
task that can't be replicated exactly in an app.

| Grade | ABRSM test | App status | Action |
|-------|-----------|------------|--------|
| Initial | A pulse-clap, B echo-clap rhythms, C sing 1-bar echoes (tonic-mediant), D one feature | absent | P3: optional Initial Grade section |
| 1A | Clap pulse + say two/three time | ≈ (identify-only) | add tap-the-pulse interaction (A5.1) |
| 1B | Sing back **three** 2-bar phrases, major, tonic-mediant | one 3-note phrase per question | generate 2-bar phrases; present three per exercise like the exam (A3) |
| 1C | Pitch change, "near the beginning or near the end", change on 2nd playing | ✓ shape; corpus tiny, change always +2 semitones on first/last note | generative change placement/direction (A3.3) |
| 1D | Two features: dynamics; articulation | ✓ | - |
| 2B | Echoes, **major only**, tonic-dominant | app adds minor phrases at G2 | **move minor echo phrases to G3**; ABRSM introduces minor at 3B |
| 2C | Pitch **or** rhythm change | ✓ | - |
| 2D | Feature 2 = tempo | ✓ | - |
| 3B | Echoes, major or minor, octave range | ✓ | - |
| 3C | Change in a phrase **up to 4 bars**, major or minor | reuses G1's 4-note C-major fragments | longer/minor-capable change stimuli (A3.3) |
| 3D | Feature 2 = tonality | ✓ | - |
| 4A | **Sing back from memory** a melody played twice (octave range, major/minor up to 3♯/♭) | **missing entirely** | add memory-singing task at G4 (and G5) |
| 4B | Sight-sing 5 notes, C/F/G major, within a 3rd of tonic, **begins and ends on the tonic**, no interval > 3rd | ✓ mostly; several bank phrases start off-tonic (e.g. `[E D C B C]`, `[A G F E F]`, `[B A G F♯ G]`) | enforce begin/end-on-tonic in the generator |
| 4C(i) | Features + **character** | ≈ (reuses binary feature questions; no character vocabulary) | add character-description questions (A3.6) |
| 4C(ii) | Clap back rhythm + say the time | ≈ (match-the-notation) | keep adaptation; fix A1.2; optional clap-grading (A5.2) |
| 5A | As 4A | missing | as G4 |
| 5B | Sight-sing 6 notes, major **up to 2♯/♭**, 5th above / 4th below tonic, no interval > 3rd **except the rising 4th dominant→tonic** | app allows a generic "one 4th leap"; bank includes tonic→subdominant 4ths; keys only C/F/G | generator rule: only leap = rising V→I 4th; add D and B♭ major |
| 5C(i) | Feature 2 = style & period | ✓ grade; stimuli are the real problem (A3.7) | replace synthetic pastiches |
| 6A | Sing back **upper part** of a two-part phrase, major/minor up to 3♯/♭ | ✓ task; material = parallel thirds in C major only | real two-part writing, transposed keys (A3.4) |
| 6B | Sight-sing **with accompaniment played** | app plays only the tonic | play a generated accompaniment under the sung line |
| 6C | Cadence: perfect/imperfect, **major or minor key**, root position, key-chord given first, cadence ends a phrase | app: two bare chords, major keys only, no key-chord, no phrase | cadence-in-context generator, minor keys (A3.5) |
| 6D(i) | Feature 1 = **texture or structure** | texture only; "two independent lines" stimulus is parallel thirds (not independent) | fix texture stimuli (A3.4); add structure questions (binary/ternary/rondo cues) |
| 7A | Sing back **lower part** of two-part phrase | ✓ (same parallel-thirds caveat) | A3.4 |
| 7B | Sight-sing upper of two-part while lower plays, up to 4♯/♭ | ✓ shape; A1.3 bug | fix A1.3 |
| 7C(i) | Cadence + interrupted | ✓ | minor keys per A3.5 |
| 7C(ii) | **Name the two chords of the cadence just heard** - pool: tonic, subdominant, dominant, dominant 7th, submediant, all root position | app instead plays generic 3-chord progressions (I-IV-V, vi-IV-V...) including ii, which is not in the G7 pool | rework: after the cadence, ask which two chords; accept ABRSM's three answer vocabularies (technical name / Roman numeral / letter name) |
| 7C(iii) | Modulation to dominant / subdominant / relative minor, **major-key start** | ✓ | richer stimulus (phrase + cadence in new key) per A3.5 |
| 7D(ii) | Time now includes **6/8** | ✓ grade; audio broken | fix A1.1 |
| 8A(i) | Sing back **lowest of three parts** | ✓ (stacked parallel thirds) | A3.4 |
| 8A(ii) | Cadence + plagal; chord vocabulary now includes **inversions** (I a/b/c, ii a/b, IV a, V a/b/c, V7 a, vi a) | app root-position only, no supertonic | extend cadence generator with inversions at G8 |
| 8A(iii) | **Name all three chords incl. positions** of the cadential progression | app's "extended progressions" (e.g. vi-IV-V) are not cadential progressions from the ABRSM set | rework to cadential 3-chord progressions from the G8 chord set, with position naming |
| 8B | Sing lower of two-part while upper plays | ✓ shape; A1.3 bug | fix A1.3 |
| 8C | **Two passages**: first starts major, **second starts minor** (targets incl. relative major) | major-start only | add minor-key-start modulation stimuli with relative-major target |
| 8D | Open-ended "describe the features" | ≈ (single-feature multiple choice) | multi-feature checklist question about one richer stimulus (A3.6) |

Terminology note: in the pulse tests ABRSM asks for "two time / three time / four time /
6/8 time" and explicitly does **not** require a numeric time signature; the app's "how
many beats per bar" phrasing is fine, but the G7 question should adopt the "or is it
6/8?" formulation rather than mapping 6/8 onto "2".

### A3. The generative stimulus engine (P1, the flagship investment)

The root cause of "naive corpus" is that every stimulus is hand-picked from a bank of
4-7 items, all rooted on C, all isochronous. Learners will memorise the bank long before
they've trained the skill, and the SRS accelerates that by design. The durable fix is to
generate stimuli the way the theory side already generates questions: seeded RNG in,
schema-valid stimulus out, constrained by a per-grade spec.

**A3.1 Grade-parameterised melody generator.** One `generateMelody(rng, spec)` where
`spec` captures exactly the ABRSM constraints table above:

```
{
  keys: ["C","G","F","D","Bb", ...],       // per grade, both modes where allowed
  mode: "major" | "minor" | "either",
  range: { above: 2, below: 0 },           // scale degrees relative to tonic
  bars: 2, timeSig: [4,4],
  rhythmPalette: [[1,1,1,1],[2,1,1],...],  // per grade; quavers/dotted at higher grades
  intervals: { maxLeap: 2, allowed: [...], exceptions: ["V->I asc 4th"] },
  startsOn: "tonic|mediant|dominant", endsOn: "tonic",
  contour: "arch|fall|rise|free",
}
```

Implementation notes:
- Constrained random walk over scale degrees with tonal anchoring (start/end constraints,
  a cadential final move, leap-then-step-back tendency) produces musically plausible
  phrases without any ML.
- Transpose the *singable register* independently of the key: pick the octave placement
  that keeps the phrase within roughly A3-E5, and keep octave-agnostic scoring so any
  voice type can respond.
- Keep the whole thing seeded-RNG-threaded so `validate-content` and the generator tests
  keep their determinism guarantees.
- Add a facts-test-style suite asserting generated stimuli obey their spec (range,
  interval set, key membership, rhythm sums to the bar, begins/ends where claimed). This
  is the same "layer 1" trick `test/facts.test.js` already plays for the reference tables.

**A3.2 Rhythm in melodies.** Echo and memory phrases should draw durations from the
grade's rhythm palette instead of the fixed 0.5 s step. ABRSM echo phrases have real
rhythm from Initial Grade onwards; the app's isochronous phrases both under-train the
skill and make the phrases easier to memorise. The scorer needs no change for pitch
(sequence matching is order-based), but see A5.2 for rhythm scoring.

**A3.3 Spot-the-change generator.** Replace `modifyNote` (always +2 semitones, always
first or last note) with: change position sampled from {near beginning, near end} but not
always note 0/n-1; direction up or down; magnitude a diatonic step (or a rhythm change per
G2C+); phrase length up to 4 bars at G3; major or minor at G3. Keep "played twice, change
on the second playing" (matches the exam).

**A3.4 Real two- and three-part writing.** Replace `thirdBelow`-parallelism with a tiny
first-species-style counterpoint generator: given the target line, build the companion
line from consonances (3rds, 6ths, 5ths, octaves) preferring contrary and oblique motion,
forbidding parallel 5ths/octaves, cadencing 6→8 or 3→1. This simultaneously fixes:
the G6/7/8 echo material, the texture question's "two independent moving lines" option
(currently parallel thirds, i.e. *not* independent), and the G7/G8 sight-sing
accompaniment key bug (A1.3), since lines are generated together in-key. Give the two
parts different registers (and ideally velocities) so they are separable by ear.

**A3.5 Cadence, chord and modulation stimuli in context.** ABRSM plays a *phrase* whose
last two (or three) chords form the cadence, with the key-chord sounded first. Generator:
key-chord, then a 2-4 chord approach (e.g. I-IV-V-?, I-ii(b)-V-?), then the target
cadence; major and minor keys; imperfect cadences approached variously (I-V, ii-V, IV-V),
not always I-V; at G8, draw chords and positions from the official set (I a/b/c, ii a/b,
IV a, V a/b/c, V7 a, vi a). The G7 chord question then becomes ABRSM's actual question:
"name the two chords that formed that cadence". Modulation stimuli similarly: establish
the home key with a mini phrase, pivot, cadence in the new key; add the G8 minor-key-start
variant with relative-major target.

**A3.6 Character, structure and describe-the-features.** Add a character vocabulary
question at G4+ (ABRSM asks "describe the character": march-like, playful, songful,
solemn...) driven by controllable stimulus parameters (tempo, articulation, mode,
register). At G6+, add structure stimuli (AB vs ABA vs AABA micro-forms built from two
contrasting generated phrases: "did the opening return?"). At G8, present one richer
stimulus and ask 2-3 feature questions about it (closest drillable approximation of the
open-ended 8D).

**A3.7 Style & period (G5C): stop synthesising pastiches.** The current 8-note synthetic
sequences labelled Baroque/Classical/Romantic/20th-century teach false associations (the
`what` text already half-apologises for this). Two viable fixes, in preference order:
1. **A small real-repertoire bank**: 8-16 public-domain excerpts per period encoded as
   note-event arrays (no audio files needed; the piano soundfont plays them). 10-20
   seconds each, chosen for period-typical texture (Alberti bass, ground bass + ornament,
   rubato-friendly chromatic melody, quartal/whole-tone colour). Deterministic pick per
   question.
2. Failing that, reframe the question so it doesn't claim period identification:
   "which *description* matches what you heard" (features, not period labels).

### A4. Mic grading and echo-task honesty (P1)

- **Per-grade tolerances are dead config.** `toleranceSemitones: 0.5` (G7/8) and
  `minHoldMs` are never read; `renderMicSequence` hardcodes pitch-class distance ≤ 1
  semitone (`src/ui/views/quiz.js:215-220`). So Grade 8 grades like Grade 1, and singing a
  semitone off *counts as correct* while the meter shows red beyond ±25 cents, visibly
  contradictory. Thread the task's tolerance into the matcher and state the tolerance in
  the result panel.
- **The prompt prints the answer.** Every echo task embeds the target staff in the prompt,
  turning an ear test into a sight-singing test for anyone who reads notation. Hide the
  staff until the reveal ("here's what it was"). Fix the G1 lesson copy that promises
  note-by-note auto-advance the implementation doesn't do (batch-records, segments after).
- **The pitch meter has no target during sequences.** `setTarget` is never called and the
  prepared per-note `staffHtml` is never consumed; the needle is relative to the nearest
  chromatic note, not the expected one. Either show the current expected note or replace
  the meter with a plain level/recording indicator in sequence mode.
- **Hesitation mis-scoring and no timeout.** ~560 ms of low-clarity input triggers scoring
  (a breath mid-phrase scores an incomplete take); if the user never sings, the mic stays
  open forever. Lengthen the silence window (~1.2 s), show a "scoring in..." countdown,
  auto-stop after ~20 s.
- **Mic failure messages don't aid recovery.** Branch on `err.name`
  (`NotAllowedError` → point at browser site settings; `NotFoundError` → no device).
- **Spelling of sung-note feedback** is sharps-only (`src/audio-input.js:170-175`), so a
  flat-key task can report "You sang D♯4" against an E♭ staff. Pass the target's spelling
  preference through.

### A5. New interaction types (P2-P3)

- **A5.1 Tap the pulse (G1A's actual task).** Play a generated phrase; the learner taps
  space/screen along with it; grade tempo stability and beat alignment, and require the
  louder-tap-on-the-strong-beat judgement via "which taps did you accent?" or a two-key
  scheme. This is the first test of every ABRSM aural exam and the app currently has no
  version of it.
- **A5.2 Clap-back grading.** The mic already captures audio; onset detection (energy
  envelope) is enough to grade a clapped rhythm against the target inter-onset intervals,
  enabling honest 4C(ii)/echo-clapping tasks instead of the match-the-notation adaptation.
- **A5.3 Initial Grade.** Small addition once A3 exists (its specs are subsets of G1's).

---

## Workstream B — factual accuracy (theory side)

Status note: the `worktree-fact-check` branch is already merged into main; its 6 prose
fixes and the 110-check `test/facts.test.js` are live. However **FACT-CHECK.md itself is
uncommitted**, sitting untracked in `.claude/worktrees/fact-check/`. Commit that document
(it's the record of what was verified) before removing the stale worktree. Findings below
are all new, on current main.

### B1. High: wrong content shown, or a correct answer marked wrong (P0)

1. **Tone/semitone question renders an augmented octave.**
   `src/content.js:150-159`: the octave-wrap uses `<=`, so same-letter pairs (C→C♯, F→F♯)
   produce a 13-semitone span; staff, audio and keyboard highlight all depict it (and the
   upper note falls outside `keyboardHTML`'s C4-C5 range so the second key isn't lit).
   Fix: wrap only when `indexOf(bBase) < indexOf(aBase)`.
2. **Transposing-instrument question offers an enharmonically-identical distractor.**
   `src/content.js:798-810`: clarinet in A + concert E♭ → correct "G♭" with "F♯" in the
   pool - the same pitch, and the more idiomatic spelling for an A-clarinet part. Exclude
   enharmonic equivalents of the answer from distractor pools generally (helper in
   `choices()`), or avoid the ambiguous combinations.
3. **Aural clap-rhythm ambiguity** - see A1.2 (same fix).

### B2. Medium: misleading or unsupported (P1)

1. **Augmented-6th naming** (`src/content.js:1419`): "19th-century German theorists'
   labels" is unsupported; standard references treat the national names as conventional
   nicknames of unknown origin (earliest attestations are English-language). Keep the
   "names don't reflect national usage" point, drop the attribution.
2. **Neapolitan-6th naming** (`src/content.js:1395`): the chord predates the Neapolitan
   school (Carissimi, Corelli, Purcell) and the naming story ("German theorists who
   imported and systematised Italian style named it") is a just-so story. Soften to:
   name conventionally links it to the 18th-century Neapolitan opera school; the chord is
   older and the name's origin is unknown.
3. **Note-transposition question** (`src/content.js:813-829`): enharmonic distractor
   collisions (E+M3=G♯ vs A♭ etc.) without any "spelled correctly for the interval"
   instruction in the prompt. Add the instruction or filter the pool.
4. **G1 aural echo topic misdescribes the exam** (`src/aural-content.js:1137`): 1B is
   three different phrases echoed in turn, not one melody played three times. (Also fold
   into A2's three-phrases-per-exercise change.)

### B3. Low (P2)

- "Slur" is labelled `It.` (`src/content.js:879`); it's English. "Tacet" (`:900`) is Latin.
- "V7 has four inversions (V7, V7b, V7c, V7d)" (`src/content.js:1371`): root position
  isn't an inversion; say "four positions (root + three inversions)" (the quiz explanation
  at `:1042` already gets this right).
- "the minor 2nd does not appear between the tonic and 2nd degree of any standard scale"
  (`src/content.js:83`): Phrygian and Locrian, both in the app's own scales table, do.
  Qualify as "any major or minor scale".
- Comma-spiral footnote "the real comma is ≈ 0.84°" (`src/ui/views/explainer.js:193`)
  matches neither of the diagram's plausible mappings (≈1.0° at 30°/fifth; 7.04° on a
  1200-cent circle). Recompute from the diagram's actual scale.
- Bass-clef "used by ... low voices (tenor, bass)" (`src/content.js:1514`,
  `explainer.js:616`): modern choral tenor is octave-transposing treble clef; also
  "trombone, tenor trombone" is redundant in the same list.
- Comment-only: `src/aural-content.js:812-813` mislabels B♭ in a C→F modulation as "the
  subdominant's flat 7th" (it's the flattened 7th of the old key / 4th of the new). The
  user-visible text and notes are correct.

### B4. Theory syllabus placement (P1)

- **Grade 2 minor keys over-reach**: `src/content.js:1175` drills minors E, A, D, G, C.
  ABRSM Grade 2 minors are **A, E, D only**; G minor (2♭) and C minor (3♭) belong at
  Grade 3 (which covers up to 4♯/♭). The G2 `what` text implying F♯/G/C minors needs the
  same trim.
- **Confirmed correctly placed** (checked against the syllabus, no action): ornament
  recognition at G4 (trill, turn, mordents, acciaccatura, appoggiatura are explicitly
  G4), instruments & voices at G5, alto clef G4 / tenor clef G5, technical degree names
  G4, double sharps/flats and enharmonics G4, irregular time signatures G5, cadences
  (perfect/plagal/imperfect in C/G/D/F major) at G5.
- **Coverage audit task**: build a per-grade syllabus checklist from the two official
  sheets and assert (a content test, not runtime) that every drilled topic's grade
  matches, and report syllabus items with no drill at all (e.g. check G4 duplets,
  double-dotted notes, breve; G5 "choice of suitable chords at cadential points"; the
  G6-8 SATB/figured-bass items are on the README roadmap already). This turns grade
  alignment from a one-off review into a regression guarantee, in the same spirit as
  `facts.test.js`.

---

## Workstream C — UX

### C1. Bugs that undermine existing flows (P0-P1)

1. **Mic and scheduled audio survive navigation.** No view-teardown lifecycle: leaving a
   live mic task keeps the stream + 80 ms poll loop running (recording indicator stays
   red); `setTimeout`-scheduled second phrases of spot-the-change/cadence questions play
   over the next view. Fix: views return a cleanup function that the router calls before
   clearing; interim: unconditionally `MTT.audioInput.stop()` + `MTT.audioPiano.cancel()`
   at the top of `router.navigate()`.
2. **Number-key shortcuts are dead most of the time; focus is lost every question.** The
   keydown listener sits on the view element, but the quiz view has no heading for the
   router to focus and every `nextQuestion()` destroys the focused element, dropping focus
   to `<body>` (`src/ui/views/quiz.js:522,438`; `src/ui/router.js:62-63`). Attach the
   listener to `document` for the question's lifetime and focus a `tabindex="-1"` prompt
   heading on each question. (The a11y test passes only because it dispatches keydown
   directly on the view - tighten the test too.)
3. **"Grade undefined · Aural: ..." on every drill launched from the Aural tab.**
   `aural.js:46` passes the topic without a grade; fix with
   `Object.assign({}, t, { grade: ag.grade })`.
4. **Aural/single-topic sessions never count toward the streak** (`quiz.js:615` gates on
   `!single`). A learner doing daily aural practice keeps a taunting "🔥 0". Count any
   completed session of ≥ N questions, or say on the finish screen why it didn't count.
5. **Sound toggle not honored by the piano path**, and sound-off in Aural is a silent dead
   end (auto-play suppressed, no explanation, "Hear it" plays anyway at full volume).
   Gate `aural-content.js`'s `audio()` on `MTT.audio.isEnabled()` and show an inline
   "Sound is off" notice with one-tap enable on audio questions.

### C2. Flow improvements (P1-P2)

- **Back/refresh destroys a session silently**: serialize session state (seed + index +
  score) to `sessionStorage` for resume, or at minimum confirm before leaving mid-session.
- **Mic-task double-"Next"**: the sequence panel's "Next →" actually reveals, then a
  second Next appears. Label it "Score it", or auto-reveal on completion.
- **"Hear it" layers overlapping playback** on repeated clicks (setTimeout chains, no
  cancellation): disable during known playback duration or schedule via the AudioContext
  clock with cancel.
- **Progress view is nearly unreachable on mobile** (level chip hidden, only a home
  card). Add it to the bottom nav or settings menu.
- **1 MB piano soundfont blocks first paint** (blocking classic scripts before all app
  modules). `defer` the whole ordered chain or lazy-inject on first audio use; the synth
  fallback already handles not-ready.
- **Aural tab ignores your grade**: current grade renders mid-list with no mastery hints.
  Render the learner's grade first and add per-card accuracy chips from the SRS map.
- **Disclaimer over-weighted**: red alert box on every visit forever, above the primary
  CTA (below the fold on mobile). Keep red for first run, then a dismissible/muted
  one-liner (footer already carries it).
- **Grade picker assumes exam familiarity**: add "Not sure? Start at 1 - the app
  estimates your real level as you practise."
- Smaller: no-op tab clicks re-render and reset scroll; session length (5/10/20) invisible
  at session start; "dig deeper" absent for topics without an explainer (fall back to the
  topic's Learn page); `No aural topics loaded.` is developer-speak.

### C3. Visual, a11y, robustness (P2)

- **Undefined CSS custom properties**: `--muted`, `--surface`, `--surface-alt` are used
  but never defined (transparent pitch-meter track and `.seq-compare` in dark mode).
- **Contrast**: `--ink-faint` ≈ 3.0:1 on light background, used at small sizes (quiz topic
  label, footer, reference group headers); lift to ≥ 4.5:1.
- **Reference pane is `aria-live` on the whole region**: every search keystroke re-renders
  entire tables into a live region (announcement flood). Announce only the result count.
- **Meter accessible name**: the `role="meter"` bar lacks its own label.
- **Settings menu focus**: opening doesn't move focus in; Escape doesn't return focus.
- **Theme flash on load**: stamp stored theme from a tiny inline head script.
- **Touch targets**: header icon buttons 30-34 px; pad to ≥ 40 px.
- **`sequenceAt` mutates the shared master gain** with a timed restore, corrupting the
  volume of any concurrent sound; use a per-note gain node like the piano path.
- **Aural view framing text**: say "Practical exam" rather than "performance exam"
  (see ground-truth note above), and name the tests as ABRSM does ("test 1A" style is
  fine once the inventory matches A2).

---

## Phasing

**Phase 1 - correctness hotfixes (small diffs, ship immediately).**
A1.1-A1.5, B1.1-B1.2, B2.1-B2.4, B3 batch, C1.1-C1.5. Also: commit FACT-CHECK.md from the
stale worktree, then remove the worktree.

**Phase 2 - ABRSM realignment (moderate).**
A2 table actions that don't need the generator: move G2 minor echoes to G3; add G4A/G5A
memory-singing (reuses the echo machinery with longer phrases); rework G7 chord question
to "name the two cadence chords"; add G8 minor-start modulation and inversion vocabulary;
B4 Grade 2 minors trim; the A4 grading fixes; C2 flow items.

**Phase 3 - the generative aural corpus (the big one).**
A3.1-A3.5 with the spec-conformance test suite. Retire the hand-written phrase banks as
each generator lands. This is what converts the aural trainer from a memorisable demo
into a practice tool.

**Phase 4 - stimulus quality and new interactions.**
A3.6-A3.7 (character/structure, real-repertoire period bank), A5.1 tap-the-pulse,
A5.2 clap grading, C3 polish batch, B4 coverage-audit test.

**Phase 5 - stretch.**
Initial Grade; richer G8 "describe the piece" multi-question stimulus; the README
roadmap's guided figured-bass/harmonisation work for theory G6-8.

---

## Appendix: ABRSM aural progression quick-reference

| Feature | First appears |
|---|---|
| Clap the pulse | Initial |
| Sing back echoes | Initial (1 bar) → G1-G3 (2 bars) |
| Minor keys in sung tests | Grade 3 |
| Sing/play a melody from memory | Grade 4 |
| Sight-sing from score | G4 (5 notes) → G5 (6 notes) → G6 (melody + accompaniment) |
| Two-part memory (upper / lower) | G6 / G7 |
| Three-part memory (lowest) | Grade 8 |
| Cadences | G6 perfect/imperfect → G7 +interrupted → G8 +plagal |
| Name cadence chords | G7 (two, root position) → G8 (three, with inversions) |
| Modulation | G7 (major start) → G8 (two passages, major + minor start) |
| Time identification | two/three (G1) → +four (G3) → +6/8 (G7) |
| Character / style & period / texture-structure | G4 / G5 / G6 |

Cadence and answer vocabulary: perfect / imperfect / interrupted / plagal (never
authentic/half/deceptive); leading *note*; semibreve/minim/crotchet/quaver; chord answers
accepted as technical names, Roman numerals (with a/b/c positions), or letter names.
"Plausible" is theory-marking vocabulary for harmonisation choices, not an aural cadence
category.
