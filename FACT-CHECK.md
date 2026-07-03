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

## Layer 2 - still flagged (your call, not yet changed)

These are defensible pedagogical simplifications rather than errors; left as-is.

- **Historical tuning range "~415 to ~444"** (A4 constant). The true spread is
  wider (~390 to >450 over history); the "~"/"anywhere from" hedge it. Could
  read "~415 (Baroque) to well above 444 in the 19th century".
- **"Ornaments are relics of the harpsichord"** (`ornaments` note). Ornaments
  predate and outlived the harpsichord (lute, organ, voice) and the organ
  sustains; the decay-compensation rationale holds for plucked/struck keyboards.
  Could broaden to "harpsichord and clavichord".
- **Minor over-generalisations:** "two stacked 3rds is the recipe behind every
  chord" (not quartal/sus/clusters); figured bass "the composer wrote only melody
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
the missing-fundamental and timbre explainers; saxophone-as-woodwind and the
sound-production family rule; all transposing-instrument intervals; every Italian/
French/German term translation; every ornament and voice (SATB) etymology; the
interactive temperament explainer (which avoids the WTC error fixed above).

---

## How to verify

```
npx vitest run test/facts.test.js   # 110 numeric checks
npx vitest run                      # full suite (one pre-existing onboarding
                                    # DOM failure is unrelated to this work)
```
