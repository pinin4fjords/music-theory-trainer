# Fact-check pass

A two-layer accuracy check over the curriculum's verifiable claims.

- **Layer 1 - numeric (automated, durable):** `test/facts.test.js` re-derives every
  number shown in the Reference tab from first principles and fails CI on any
  drift. 110 checks, all passing.
- **Layer 2 - prose (one-time, web-verified):** every historical, etymological
  and definitional claim in `src/content.js` and `src/ui/views/explainer.js` was
  checked against authoritative sources. Clear errors and the well-supported
  tightenings were fixed; the remaining judgement calls are listed at the end.

---

## Issue 75 - science and history audit

The music labs add a third, visible accuracy layer. Every lab separates:

- **Measured or calculated:** controlled settings and deterministic model output.
- **Inferred:** a perceptual or real-instrument conclusion drawn from the model.
- **Musical convention:** a learned name, tuning target, notation system or
  stylistic interpretation that the physical result cannot choose.

This separation is important. Acoustics can model interference, spectra and
string motion. It cannot, by itself, explain culturally learned harmony,
metrical categories or emotional meaning.

| Lab or revised explainer | Verified claim | Scope correction |
|---|---|---|
| Frequency, ratios and cents | Interval size in cents is `1200 log2(f2/f1)`; equal ratios map to equal logarithmic distances. | Frequency is the main correlate of pitch, not the complete percept. Detection does not have one universal 5-cent threshold. |
| Beating | Two nearby sine waves produce amplitude beats at `abs(f2-f1)`. | Beating and roughness are contributors to sensory consonance, not a derivation of harmony or preference. |
| Harmonic spectrum | Harmonic components occur at integer multiples in the ideal periodic model; a missing-fundamental pitch can remain when F0 energy is absent. | Spectral and temporal pitch cues both matter. Timbre also depends on onset, decay and other time-varying structure. |
| Stretched string | For an ideal flexible string, `f1 = sqrt(T/mu)/(2L)`. | Real strings have stiffness, end effects and body coupling. Note names require a tuning convention. |
| Metre and entrainment | Acoustic accents can cue pulse grouping, and EEG responses can track beat and an imagined binary or ternary metre. | Neural entrainment is evidence about processing, not a complete definition of metre. Unequal groupings predate their twentieth-century adoption by Western concert composers. |
| Monochord history | Ancient Greek harmonic science used the monochord; Mersenne experimentally connected string vibration to length and tension in the seventeenth century. | The familiar Pythagoras discovery story is later tradition, not a contemporary eyewitness report. |

### Sources used for issue 75

- Frequency and logarithmic pitch: [UNSW Music Acoustics](https://www.animations.physics.unsw.edu.au/jw/frequency-pitch-sound.htm).
- Cents and comparative measurement: Alexander J. Ellis,
  [*On the Musical Scales of Various Nations* (1885)](https://soundandscience.net/texts/on-the-musical-scales-of-various-nations/)
  and the Wellcome Collection copy of Ellis's annotated
  [*On the Sensations of Tone*](https://wellcomecollection.org/works/rby988rq).
- Beat-frequency equation and tuning use:
  [OpenStax University Physics, "Beats"](https://openstax.org/books/university-physics-volume-1/pages/17-6-beats).
- Ideal-string modes and wave equation:
  [OpenStax University Physics, "Standing Waves and Resonance"](https://openstax.org/books/university-physics-volume-1/pages/16-6-standing-waves-and-resonance).
- Monochord provenance:
  [Whipple Museum of the History of Science](https://www.whipplemuseum.cam.ac.uk/explore-whipple-collections/acoustics/monochord).
- Mersenne's experiments:
  [Stanford Encyclopedia of Philosophy, "Marin Mersenne"](https://plato.stanford.edu/entries/mersenne/).
- Sensory consonance and critical bandwidth: Plomp and Levelt,
  ["Tonal consonance and critical bandwidth" (1965)](https://pubmed.ncbi.nlm.nih.gov/5831012/).
- Cultural variation in consonance preference: McDermott et al.,
  ["Indifference to dissonance in native Amazonians" (2016)](https://www.nature.com/articles/nature18635).
- Missing-fundamental and pitch mechanisms: Oxenham,
  ["Pitch Perception" (2012)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3481156/)
  and Oxenham,
  ["How We Hear" (2018)](https://pmc.ncbi.nlm.nih.gov/articles/PMC5819010/).
- Neural responses to beat and metre: Nozaradan et al.,
  ["Tagging the neuronal entrainment to beat and meter" (2011)](https://pmc.ncbi.nlm.nih.gov/articles/PMC6623069/).
- Unequal-metre terminology and documented performance practice: Clayton,
  ["Theory and Practice of Long-form Non-isochronous Meters" (2020)](https://mtosmt.org/issues/mto.20.26.1/mto.20.26.1.clayton.html).

`test/labs.test.js` independently checks the cents, beat-rate, ideal-string,
harmonic-component and metre calculations. DOM tests check that the same values
appear in the accessible text alternative.

---

## Layer 1 - what the automated test guards

`test/facts.test.js` reads the live data off `MTT.content.reference` / `MTT.music`
and asserts:

| Area | Check |
|------|-------|
| Interval ratios -> cents | just cents = `1200·log2(a/b)`; equal cents = nearest 12-TET semitone; "Equal is" delta = equal − just |
| Note frequencies | each Hz = `440·2^((n−69)/12)`; A4 = 440.00; octave doubles; "from A4" distances |
| Acoustic constants | equal semitone ≈ 1.0595 / 5.95%; Pythagorean comma ≈ 23.46c; syntonic comma 81:80 ≈ 21.51c; octave 2:1 |
| Interval semitones | each row's count matches its worked example via the engine |
| Order of sharps/flats | each sharp a perfect 5th above the last; flats the exact reverse |
| Key signatures | accidental counts + relative minors vs an independent canon of all 15 keys |
| Scale steps | engine's `SCALE_STEPS` vs canonical T/S patterns; each spans an octave |
| Chord spellings | every printed triad/7th spelling reproduces its named quality via the engine |
| Scale-degree names | reference names match the engine's degree order |

Verified to have teeth: changing a single cents value makes the suite fail.

---

## Layer 2 - prose fixes applied

**1. "Well-Tempered Clavier" was not equal temperament** (`ratios` note).
The text credited equal temperament with making the WTC possible. "Well
temperament" means a *circulating, unequal* temperament; equal temperament became
the keyboard standard only after Bach's death, and the WTC's point is that each
key keeps its own colour - which equal temperament erases. Rewritten to separate
the two. Source: *The Well-Tempered Clavier* / Werckmeister's 1691 coinage.

**2. French-terms note cited German composers** (`french` note).
The note introducing *French* markings illustrated them with Schumann and late
Beethoven, both of whom wrote *German* markings (and already appear, correctly, in
the German note). Examples changed to Debussy, Fauré, Ravel.

**3. "Medieval music heard 3rds as mild dissonances"** (`chordtypes` note).
Medieval theory classified thirds as *imperfect consonances*, not dissonances.
Reworded to "ranked 3rds as unstable *imperfect* consonances".
Source: medieval consonance/dissonance classification (Franco of Cologne onward).

**4. Mode names a "Renaissance" mislabelling** (`scales` note).
The misapplication of the Greek names is a ~9th-century medieval error (misreading
Boethius); the Renaissance contribution was *adding* Ionian/Aeolian. Changed
"Renaissance theorists" to "theorists from around the 9th century".

**5. "the only intervals you could end a phrase on"** (3 places: the
interval-quality contrast text, the g3 quality `why`, and the `intervals`
reference note). Stated as a timeless absolute, and the perfect 4th was later
reclassified as a dissonance. The absolute "only" was dropped and the claim tied
to early cadential practice.

**6. Minim / *minima* gloss** (`values` note). *Minima* means "the smallest";
the note now ties the gloss to the minim being the shortest note written *when it
first appeared* (14th c.), rather than implying notation never went smaller.

---

## Layer 2 - remaining simplifications

These are outside the issue 75 lab scope and remain candidates for a later pass.

- **Historical tuning range "~415 to ~444"** (A4 constant). The true spread is
  wider (~390 to >450 over history); the "~"/"anywhere from" hedge it. Could
  read "~415 (Baroque) to well above 444 in the 19th century".
- **"Ornaments are relics of the harpsichord"** (`ornaments` note). Ornaments
  predate and outlived the harpsichord (lute, organ, voice) and the organ
  sustains; the decay-compensation rationale holds for plucked/struck keyboards.
  Could broaden to "harpsichord and clavichord".
- **Minor over-generalisations:** figured bass "the composer wrote only melody
  and bass" (true for continuo, not Baroque music generally); SATB as "Renaissance
  church choral writing" (origin correct; the teaching tradition runs through the
  Baroque Bach chorale); French/German markings driven by "national pride" (also a
  wish for more precise expressive nuance than Italian convention offered).

---

## Spot-checked and confirmed correct

A large body of claims was verified accurate and left untouched, including: the
"C" time signature as the broken circle of *tempus imperfectum* (not "common");
*tempus perfectum* / Trinity; every note-value etymology (breve, semibreve,
crotchet < *crochet*, quaver); order of sharps as a 5ths chain; clefs as stylised
G/F/C letters; scale-degree name meanings; the dominant-7th's pull; figured-bass
dates; A4 = 440 = ISO 16; Pythagorean and syntonic comma definitions; critical
band ≈ a minor 3rd; JND ≈ 5-10 cents; hearing 20 Hz-20 kHz and piano 27.5-4186 Hz;
the numeric missing-fundamental spectrum examples; saxophone-as-woodwind and the
sound-production family rule; all transposing-instrument intervals; every Italian/
French/German term translation; every ornament and voice (SATB) etymology; the
interactive temperament explainer (which avoids the WTC error fixed above).

---

## How to verify

```
npx vitest run test/facts.test.js test/labs.test.js
npm run check
```
