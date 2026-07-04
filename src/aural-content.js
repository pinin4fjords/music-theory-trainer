/* aural-content.js - grade aural trainer topics, Grades 1-8.
 *
 * Stores aural practice topics in MTT.content.auralGrades after
 * content.js has loaded. Covers:
 *   - Time signature identification (clapping/pulse tasks)
 *   - Spot the change (beginning or end)
 *   - Major/minor tonality
 *   - Dynamics (loud/quiet) and articulation (smooth/detached)
 *   - Singing back notes (mic pitch-detection)
 *
 * All multi-choice questions conform to the existing Question schema and pass
 * through the existing SRS, session, and quiz infrastructure unchanged.
 * Singing questions additionally carry a `micTask` field that the quiz view
 * uses to show a pitch-detection panel instead of numbered choice buttons.
 *
 * Aural test topics by grade:
 *   Grade 1: pulse & time sig, echo sing, spot change, dynamics/articulation
 *   Grade 2: 2 or 3 time, echo sing, pitch or rhythm change, dynamics/tempo/articulation
 *   Grade 3: 2/3/4 time, echo sing, spot change longer phrase, tonality/dynamics/tempo
 *   Grade 4: echo 4-bar, sight-sing 5 notes, features + time sig
 *   Grade 5: echo 4-bar, sight-sing 6 notes, features + style/period
 *   Grade 6: two-part echo (upper), sight-sing, cadences, texture
 *   Grade 7: two-part echo (lower), sight-sing w/ accompaniment, cadences +
 *            interrupted, chord/modulation ID, time sig incl. 6/8
 *   Grade 8: three-part echo (lowest), sight-sing, cadences + plagal,
 *            extended chord/modulation ID
 */
(function (global) {
  "use strict";

  function audio() {
    const main = global.MTT.audio;
    // Honour the sound toggle: the sampled-piano engine has no enabled flag of
    // its own, so when sound is off fall back to the synth engine, whose play
    // calls are gated and become no-ops. Otherwise "Hear it" would blast the
    // piano at full volume with sound switched off.
    if (main && main.isEnabled && !main.isEnabled()) return main;
    const piano = global.MTT.audioPiano;
    return (piano && piano.isReady()) ? piano : main;
  }

  // Schedule a later phase of a multi-part stimulus through the audio module's
  // cancellable scheduler, so leaving the view mid-phrase silences it. Falls
  // back to a plain setTimeout where the coordinator isn't present (e.g. tests).
  function later(fn, ms) {
    const a = global.MTT.audio;
    if (a && a.after) return a.after(fn, ms);
    return global.setTimeout(fn, ms);
  }

  function auralGen() { return global.MTT.auralGen; }

  // Per-grade generator specs (see aural-generators.js). These encode the exam-board
  // constraints for each task so echo/memory/spot-change stimuli are generated
  // fresh each time instead of being drawn from a memorisable fixed bank.
  const MELODY_SPECS = {
    g1Echo: { keys: ["C"], mode: "major", range: { above: 2, below: 0 }, bars: 2, beatsPerBar: 2, rhythmPalette: [[1, 1], [2]], maxLeap: 2, startsOn: ["tonic", "mediant"], endsOn: "free" },
    g2Echo: { keys: ["C", "G", "F"], mode: "major", range: { above: 4, below: 0 }, bars: 2, beatsPerBar: 2, rhythmPalette: [[1, 1], [2]], maxLeap: 2, startsOn: "tonic", endsOn: "free" },
    g3Echo: { keys: ["C", "G", "F"], mode: "either", range: { above: 4, below: 3 }, bars: 2, beatsPerBar: 2, rhythmPalette: [[1, 1], [2], [0.5, 0.5, 1]], maxLeap: 2, startsOn: "tonic", endsOn: "free" },
    memory: { keys: ["C", "G", "D"], mode: "either", range: { above: 4, below: 3 }, bars: 2, beatsPerBar: 3, rhythmPalette: [[1, 1, 1], [2, 1], [1, 2]], maxLeap: 2, startsOn: "tonic", endsOn: "tonic" },
    g1Change: { keys: ["C"], mode: "major", range: { above: 4, below: 0 }, bars: 2, beatsPerBar: 2, rhythmPalette: [[1, 1], [2]], maxLeap: 2, startsOn: "tonic", endsOn: "free" },
    g3Change: { keys: ["C", "G", "F"], mode: "either", range: { above: 4, below: 3 }, bars: 4, beatsPerBar: 2, rhythmPalette: [[1, 1], [2], [0.5, 0.5, 1]], maxLeap: 2, startsOn: "tonic", endsOn: "free" },
    // Sight-singing (exam-board 4B/5B/6B): begins and ends on the tonic, per the
    // real syllabus. 5B/6B's only permitted leap is the rising dominant-below
    // -to-tonic 4th (degree -3 -> 0); everything else moves by step.
    g4SightSing: { keys: ["C", "F", "G"], mode: "major", range: { above: 2, below: 2 }, bars: 1, beatsPerBar: 5, rhythmPalette: [[1, 1, 1, 1, 1]], maxLeap: 2, startsOn: "tonic", endsOn: "tonic" },
    g5SightSing: { keys: ["C", "F", "G", "D", "Bb"], mode: "major", range: { above: 4, below: 3 }, bars: 1, beatsPerBar: 6, rhythmPalette: [[1, 1, 1, 1, 1, 1]], maxLeap: 1, startsOn: "tonic", endsOn: "tonic", leap: { from: -3, to: 0, chance: 0.5 } },
    g6SightSing: { keys: ["C", "F", "G", "D", "Bb"], mode: "major", range: { above: 7, below: 3 }, bars: 1, beatsPerBar: 7, rhythmPalette: [[1, 1, 1, 1, 1, 1, 1]], maxLeap: 1, startsOn: "tonic", endsOn: "tonic", leap: { from: -3, to: 0, chance: 0.5 } },
  };

  // Notation helpers — render a treble-clef staff snippet inline in a prompt.
  const PC_NOTE = [
    { letter: "C", alter: 0 }, { letter: "C", alter: 1 }, { letter: "D", alter: 0 },
    { letter: "E", alter: -1 }, { letter: "E", alter: 0 }, { letter: "F", alter: 0 },
    { letter: "F", alter: 1 }, { letter: "G", alter: 0 }, { letter: "A", alter: -1 },
    { letter: "A", alter: 0 }, { letter: "B", alter: -1 }, { letter: "B", alter: 0 },
  ];
  function midiToSpelled(midi) {
    const pc = ((midi % 12) + 12) % 12;
    return Object.assign({}, PC_NOTE[pc], { octave: Math.floor(midi / 12) - 1 });
  }
  function noteStaff(midi) {
    const N = global.MTT.notation;
    if (!N) return "";
    return `<div class="staff-wrap">${N.staffHTML({ clef: "treble", notes: [midiToSpelled(midi)] })}</div>`;
  }
  function sequenceStaff(midiNotes) {
    const N = global.MTT.notation;
    if (!N) return "";
    return `<div class="staff-wrap">${N.staffHTML({ clef: "treble", notes: midiNotes.map(midiToSpelled) })}</div>`;
  }

  function pick(rng, arr) { return rng.pick(arr); }

  function choices(rng, correct, distractors, n) {
    n = n || 4;
    const pool = rng.shuffle([...new Set(distractors)].filter((d) => d !== correct));
    return rng.shuffle([correct, ...pool.slice(0, n - 1)]);
  }

  // Build a targets array for a sequence micTask.
  // Each entry: { midi, name, staffHtml } — quiz.js uses staffHtml to show the
  // current note to sing and midi/name for pitch comparison and meter label.
  // useFlats should be true for flat keys so note names spell correctly
  // (e.g. "B♭4" not "A♯4") in the Expected and You-sang feedback rows.
  function makeSequenceTargets(midiNotes, useFlats) {
    return midiNotes.map(function (midi) {
      return { midi: midi, name: midiName(midi, useFlats), staffHtml: noteStaff(midi) };
    });
  }

  // --- Musical constants ---------------------------------------------------

  const MIDI = {
    C3: 48, D3: 50, E3: 52, F3: 53, G3: 55, A3: 57, B3: 59,
    C4: 60, D4: 62, E4: 64, F4: 65, G4: 67, A4: 69, B4: 71,
    C5: 72, D5: 74, E5: 76, F5: 77, G5: 79, A5: 81, B5: 83,
  };

  // NOTE_NAMES indexed by semitone 0-11 (sharp and flat variants).
  const NOTE_NAMES_SHARP = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
  const NOTE_NAMES_FLAT  = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];
  function midiName(midi, useFlats) {
    const names = useFlats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;
    const octave = Math.floor(midi / 12) - 1;
    return names[((midi % 12) + 12) % 12] + octave;
  }

  // Flat keys: F major and all keys whose names use the ♭ or lowercase-b
  // notation (Bb, Eb, Ab, Db, Gb and their enharmonic equivalents).
  // Used to pick the correct accidental spelling for note names in feedback.
  const FLAT_KEY_RE = /^F(?:\s|$)|[A-G]b|♭/;
  function keyUsesFlats(key) {
    return key != null && FLAT_KEY_RE.test(key);
  }

  // Build a major scale starting at rootMidi (one octave).
  function majorScale(rootMidi) {
    const steps = [0, 2, 4, 5, 7, 9, 11, 12];
    return steps.map((s) => rootMidi + s);
  }

  // Build a natural minor scale starting at rootMidi.
  function minorScale(rootMidi) {
    const steps = [0, 2, 3, 5, 7, 8, 10, 12];
    return steps.map((s) => rootMidi + s);
  }

  // --- Rhythmic meter patterns --------------------------------------------
  // Play a metrically clear "click track" to establish the pulse. Accent is
  // carried by BOTH pitch and loudness so two-time and four-time are actually
  // distinguishable: the downbeat is high (E5) and loudest; in four-time beat 3
  // gets a medium accent (the secondary stress); every other beat is soft and
  // low (E4). Returns parallel `notes` and `velocities` arrays for sequence().
  // Playing 3 bars makes the pattern unmistakable.
  function meterNotes(beatsPerBar, bars) {
    bars = bars || 3;
    const notes = [];
    const velocities = [];
    for (let b = 0; b < bars; b++) {
      for (let beat = 0; beat < beatsPerBar; beat++) {
        if (beat === 0) { notes.push(MIDI.E5); velocities.push(1.0); }
        else if (beatsPerBar === 4 && beat === 2) { notes.push(MIDI.E4); velocities.push(0.66); }
        else { notes.push(MIDI.E4); velocities.push(0.34); }
      }
    }
    return { notes: notes, velocities: velocities };
  }

  // 6/8 compound click: two dotted-crotchet main beats per bar, each divided
  // into three quavers (STRONG-weak-weak, medium-weak-weak). Played at quaver
  // speed so the lilting "1-and-a 2-and-a" grouping is audibly distinct from
  // the two even clicks of simple two-time.
  function compoundSixEightNotes(bars) {
    bars = bars || 3;
    const notes = [];
    const velocities = [];
    for (let b = 0; b < bars; b++) {
      for (let q = 0; q < 6; q++) {
        if (q === 0) { notes.push(MIDI.E5); velocities.push(1.0); }
        else if (q === 3) { notes.push(MIDI.E5); velocities.push(0.66); }
        else { notes.push(MIDI.E4); velocities.push(0.34); }
      }
    }
    return { notes: notes, velocities: velocities };
  }

  // --- Rhythm (note-value) helpers ----------------------------------------
  // Durations are in beats (1 = crotchet, 0.5 = quaver, 1.5 = dotted
  // crotchet, 2 = minim). Used anywhere a phrase needs real mixed note
  // values instead of an isochronous pulse.

  function beatGlyph(beats) {
    const helpers = global.MTT.content && global.MTT.content.helpers;
    const glyph = helpers && helpers.noteValueGlyph;
    if (!glyph) return String(beats);
    if (beats === 0.5) return glyph("quaver");
    if (beats === 1.5) return glyph("crotchet") + `<span aria-hidden="true" style="margin-left:-7px;font-weight:bold">.</span>`;
    if (beats === 2) return glyph("minim");
    return glyph("crotchet");
  }

  function patternGlyphs(pattern) {
    return pattern.map(beatGlyph).join(" ");
  }

  // One-bar rhythm patterns (beats sum to the time signature) for the "clap
  // the rhythm" test at Grade 4+, played on a single repeated pitch since a
  // clapped rhythm carries no pitch information.
  const CLAP_RHYTHM_PATTERNS = {
    2: [[1, 1], [0.5, 0.5, 1], [1, 0.5, 0.5], [1.5, 0.5]],
    3: [[1, 1, 1], [2, 1], [1, 2], [0.5, 0.5, 1, 1], [1.5, 0.5, 1]],
    4: [[1, 1, 1, 1], [2, 1, 1], [1, 1, 2], [0.5, 0.5, 1, 1, 1], [2, 0.5, 0.5, 1]],
  };

  function patternLabel(beatsPerBar, pattern) {
    return `<b>${beatsPerBar}/4</b>: ${patternGlyphs(pattern)}`;
  }

  // A rhythm is isochronous if every note is the same length; two isochronous
  // patterns in different metres can be acoustically identical (the classic
  // "2/4 over two bars vs 4/4" trap), so they must not be offered against each
  // other as answers.
  function isIsochronous(pattern) {
    return pattern.every((d) => d === pattern[0]);
  }

  // Per-note loudness for a clapped rhythm so the bar-lines are audible: the
  // first note of each bar is accented, and four-time gets a lighter secondary
  // accent on beat 3. `durations` is the flat (already bar-repeated) array.
  function rhythmAccents(durations, beatsPerBar) {
    const vel = [];
    let beatPos = 0;
    for (let i = 0; i < durations.length; i++) {
      const inBar = ((beatPos % beatsPerBar) + beatsPerBar) % beatsPerBar;
      if (inBar < 1e-6) vel.push(1.0);
      else if (beatsPerBar === 4 && Math.abs(inBar - 2) < 1e-6) vel.push(0.66);
      else vel.push(0.4);
      beatPos += durations[i];
    }
    return vel;
  }

  // Grades 4-6 sight-sing phrases are generated (see MELODY_SPECS.g4SightSing
  // /g5SightSing/g6SightSing) rather than drawn from a fixed bank.

  // =========================================================================
  // Grade 1 generators
  // =========================================================================

  // Test 1A: Identify 2 vs 3 time.
  function g1TimeSigQuestion(rng) {
    const beats = pick(rng, [2, 3]);
    const label = String(beats);
    const { notes, velocities } = meterNotes(beats);
    return {
      prompt: `Listen to this rhythmic pattern — notice which beat sounds <strong>stronger</strong>. How many beats are in each bar?`,
      audio: function () { audio().sequence(notes, 0.5, 0.12, velocities); },
      choices: choices(rng, label, ["2", "3", "4"], 2),
      answer: label,
      explanation: `That was in <b>${beats}/4</b> time — ${beats} beats per bar. The first beat of each bar has a stronger accent. Tap along and count: "ONE two, ONE two" for 2, or "ONE two three" for 3.`,
    };
  }

  // Test 1C: Spot where the pitch change is (beginning or end).
  // Play a phrase, then its one-note variant, each with its own rhythm.
  function playChangePair(orig, mod, beatSec) {
    const totalMs = orig.durations.reduce(function (s, d) { return s + d; }, 0) * beatSec * 1000;
    return function () {
      const a = audio();
      a.sequenceRhythm(orig.notes, orig.durations, beatSec);
      later(function () { a.sequenceRhythm(mod.notes, mod.durations, beatSec); }, totalMs + 700);
    };
  }

  // Spot-where-the-change-is (exam-board 1C/3C): a generated phrase is played, then
  // repeated with one note altered near the beginning or the end.
  function spotChangeQuestion(rng, specKey) {
    const m = auralGen().generateMelody(rng, MELODY_SPECS[specKey]);
    const c = auralGen().generateChange(rng, m, { allowRhythm: false });
    const dirWord = c.direction === "up" ? "higher" : "lower";
    return {
      prompt: `Listen to this phrase played <strong>twice</strong>. One note is <strong>different</strong> the second time. Where is the change?`,
      audio: playChangePair(c.original, c.modified, 0.5),
      choices: choices(rng, "At the " + c.position, ["At the beginning", "At the end"], 2),
      answer: "At the " + c.position,
      explanation: `The change was <b>near the ${c.position}</b>. Compare the ${c.position === "beginning" ? "opening" : "closing"} notes of each playing — the second time one note was a step ${dirWord}.`,
    };
  }
  function g1SpotChangeQuestion(rng) { return spotChangeQuestion(rng, "g1Change"); }
  function g3SpotChangeQuestion(rng) { return spotChangeQuestion(rng, "g3Change"); }

  // Test 1D: Identify dynamics (loud / quiet).
  function g1DynamicsQuestion(rng) {
    const isDynamic = rng.bool();
    if (isDynamic) {
      // Crescendo (getting louder) vs diminuendo (getting quieter): use same melody,
      // first softly then loudly (or vice versa), ask which direction.
      const isGrow = rng.bool();
      const notes = [MIDI.C4, MIDI.D4, MIDI.E4, MIDI.F4, MIDI.G4, MIDI.A4, MIDI.G4, MIDI.E4];
      const lo = 0.22, hi = 1.0;
      const ramp = notes.map(function (_, i) {
        const frac = i / (notes.length - 1);
        return isGrow ? lo + (hi - lo) * frac : hi - (hi - lo) * frac;
      });
      const ans = isGrow ? "Getting louder (crescendo)" : "Getting quieter (diminuendo)";
      return {
        prompt: `Listen — does this music get <strong>louder</strong> or <strong>quieter</strong>?`,
        audio: function () { audio().sequence(notes, 0.42, 0.4, ramp); },
        choices: choices(rng, ans, ["Getting louder (crescendo)", "Getting quieter (diminuendo)"], 2),
        answer: ans,
        explanation: `That was a <b>${isGrow ? "crescendo" : "diminuendo"}</b> — the volume changed <em>gradually</em> across the phrase, note by note (marked ${isGrow ? "<em>cresc.</em> or a widening hairpin &lt;" : "<em>dim.</em>/<em>decresc.</em> or a narrowing hairpin &gt;"} in the score), not as a sudden step between two levels.`,
      };
    }
    // Straightforward loud vs quiet.
    const isLoud = rng.bool();
    const notes = [MIDI.C4, MIDI.E4, MIDI.G4, MIDI.E4];
    const ans = isLoud ? "Loud (forte)" : "Quiet (piano)";
    return {
      prompt: `Listen — is this music <strong>loud</strong> or <strong>quiet</strong>?`,
      audio: function () { audio().sequenceAt(notes, isLoud ? 0.75 : 0.12, 0.5, 0.45); },
      choices: choices(rng, ans, ["Loud (forte)", "Quiet (piano)"], 2),
      answer: ans,
      explanation: isLoud
        ? `That was <b>forte</b> (f) — loud. The marking <em>f</em> appears at the start of a loud passage.`
        : `That was <b>piano</b> (p) — quiet. The marking <em>p</em> appears at the start of a quiet passage.`,
    };
  }

  // Test 1D (alt): Identify articulation (smooth vs detached).
  function g1ArticulationQuestion(rng) {
    const isLegato = rng.bool();
    const notes = [MIDI.C4, MIDI.D4, MIDI.E4, MIDI.F4, MIDI.G4];
    const ans = isLegato ? "Smooth (legato)" : "Detached (staccato)";
    return {
      prompt: `Listen — are these notes played <strong>smoothly</strong> or <strong>detached</strong>?`,
      audio: function () { audio().sequence(notes, 0.5, isLegato ? 0.55 : 0.08); },
      choices: choices(rng, ans, ["Smooth (legato)", "Detached (staccato)"], 2),
      answer: ans,
      explanation: isLegato
        ? `That was <b>legato</b> — the notes are connected smoothly, flowing into each other. A slur mark (a curved line over the notes) tells a player to do this.`
        : `That was <b>staccato</b> — the notes are clipped short and separated. Dots above or below the noteheads signal staccato in the score.`,
    };
  }

  // Test 1B: Echo a short melody (Grade 1 - 3 notes, C major, C4-E4).
  // Phrase plays once, then the mic opens automatically for an immediate response.
  // Milliseconds until a rhythmic phrase finishes sounding, plus a buffer before
  // the mic opens for the echo response.
  function echoRespondMs(durations, beatSec) {
    const total = durations.reduce(function (s, d) { return s + d; }, 0);
    return Math.round(total * beatSec * 1000 + 350);
  }

  // Multi-phrase echo generator: presents PHRASE_COUNT distinct phrases in
  // sequence, matching the real exam-board exam format where the examiner plays
  // three different phrases and the candidate sings each one back immediately.
  // quiz.js renders these one at a time via the "multiEcho" mic task type.
  const ECHO_PHRASE_COUNT = 3;
  function multiEchoMelodyQuestion(rng, specKey, copy) {
    const beatSec = 0.55;
    const phrases = [];
    for (let i = 0; i < ECHO_PHRASE_COUNT; i++) {
      // Each melody is generated from the shared RNG so the sequence is
      // deterministic for the same seed.
      const m = auralGen().generateMelody(rng, MELODY_SPECS[specKey]);
      const useFlats = keyUsesFlats(m.key);
      // Capture m by value in the IIFE so each audioFn closes over its own notes.
      phrases.push((function (notes, durations, uf) {
        return {
          targets: makeSequenceTargets(notes, uf),
          audioFn: function () { audio().sequenceRhythm(notes, durations, beatSec); },
          autoPlayAndRespondMs: echoRespondMs(durations, beatSec),
          toleranceSemitones: copy.tolerance != null ? copy.tolerance : 1.0,
          useFlats: uf,
          revealStaffHtml: sequenceStaff(notes),
        };
      })(m.notes, m.durations, useFlats));
    }
    return {
      prompt: copy.prompt,
      // No top-level audio: each phrase plays within its own mic panel.
      micTask: {
        type: "multiEcho",
        phrases: phrases,
      },
      choices: copy.choices || ["I sang all three phrases", "I couldn't match some"],
      answer: (copy.choices || ["I sang all three phrases"])[0],
      explanation: copy.explanation,
    };
  }

  function g1EchoMelodyQuestion(rng) {
    return multiEchoMelodyQuestion(rng, "g1Echo", {
      prompt: `Listen to each short phrase, then <strong>sing it back immediately</strong>. Three phrases in turn — the notes stay hidden until you\'re done.`,
      explanation: `Grade 1 echo singing: the examiner plays three different short phrases and you sing each one back immediately after hearing it. Focus on the contour — whether each note goes up, stays the same, or goes down.`,
    });
  }

  // =========================================================================
  // Grade 2 generators
  // =========================================================================

  // Test 2C: Identify pitch vs rhythm change AND beginning vs end.
  function g2ChangeTypeQuestion(rng) {
    const m = auralGen().generateMelody(rng, MELODY_SPECS.g1Change);
    const c = auralGen().generateChange(rng, m, { allowRhythm: true });
    const isPitch = c.kind === "pitch";
    const ans = isPitch ? "A pitch (note) change" : "A rhythm change";
    return {
      prompt: `Listen to this phrase played <strong>twice</strong>. One thing is <strong>different</strong> the second time — is it the <em>pitch</em> (which note) or the <em>rhythm</em> (how long)?`,
      audio: playChangePair(c.original, c.modified, 0.5),
      choices: choices(rng, ans, ["A pitch (note) change", "A rhythm change"], 2),
      answer: ans,
      explanation: isPitch
        ? `The change was in the <b>pitch</b> — near the ${c.position}, one note moved a step ${c.direction === "up" ? "higher" : "lower"} the second time. Listen for whether any note sounds higher or lower, not shorter or longer.`
        : `The change was in the <b>rhythm</b> — near the ${c.position}, one note became ${c.longer ? "longer" : "shorter"} the second time. Listen for whether a note is held longer or cut shorter, not whether it's higher or lower.`,
    };
  }

  // Tempo question: is the piece speeding up, slowing down, or staying the same?
  function g2TempoQuestion(rng) {
    const options = [
      { type: "accelerando", label: "Getting faster", play: function () {
        const notes = [MIDI.C4, MIDI.D4, MIDI.E4, MIDI.F4, MIDI.G4, MIDI.A4];
        // Play at slow step then faster step to simulate accel.
        audio().sequence(notes.slice(0, 3), 0.7, 0.65);
        later(function () { audio().sequence(notes.slice(3), 0.3, 0.28); }, 3 * 700 + 400);
      }},
      { type: "ritardando", label: "Getting slower", play: function () {
        const notes = [MIDI.C4, MIDI.D4, MIDI.E4, MIDI.F4, MIDI.G4, MIDI.A4];
        audio().sequence(notes.slice(0, 3), 0.3, 0.28);
        later(function () { audio().sequence(notes.slice(3), 0.7, 0.65); }, 3 * 300 + 400);
      }},
      { type: "steady", label: "Staying the same", play: function () {
        audio().sequence([MIDI.C4, MIDI.D4, MIDI.E4, MIDI.F4, MIDI.G4, MIDI.A4], 0.45, 0.42);
      }},
    ];
    const opt = pick(rng, options);
    return {
      prompt: `Listen — is the <strong>tempo</strong> (speed) getting faster, slower, or staying the same?`,
      audio: opt.play,
      choices: choices(rng, opt.label, ["Getting faster", "Getting slower", "Staying the same"], 3),
      answer: opt.label,
      explanation: {
        accelerando: `That was an <b>accelerando</b> (accel.) — the music was gradually speeding up.`,
        ritardando: `That was a <b>ritardando</b> (rit.) — the music was gradually slowing down.`,
        steady: `The tempo stayed <b>steady</b> throughout — no acceleration or slowing down.`,
      }[opt.type],
    };
  }

  // Grade 2 echo melody: major only (tonic-to-dominant); minor enters at 3B.
  function g2EchoMelodyQuestion(rng) {
    return multiEchoMelodyQuestion(rng, "g2Echo", {
      prompt: `Listen to each major-key phrase, then <strong>sing it back immediately</strong>. Three phrases in turn — notes hidden until you\'re done.`,
      explanation: `Grade 2 echo singing: three short major-key phrases, each spanning up to a 5th from tonic to dominant. Fix the tonic in your ear first, then follow the shape up and down from it.`,
    });
  }

  // Grade 3 echo melody: major or minor, range within an octave.
  function g3EchoMelodyQuestion(rng) {
    return multiEchoMelodyQuestion(rng, "g3Echo", {
      prompt: `Listen to each phrase (it may be major or minor), then <strong>sing it back immediately</strong>. Three phrases in turn — notes hidden until you\'re done.`,
      explanation: `Grade 3 echo singing: three phrases within a single octave, major or minor. Mostly stepwise motion with the occasional leap of a 3rd — hum the shape internally before you sing.`,
    });
  }

  // =========================================================================
  // Grade 3 generators
  // =========================================================================

  // Test 3A: Identify 2, 3, or 4 time (also reused at Grades 4-6, which repeat
  // this same task — 4 time is new at Grade 3; 6/8 doesn't appear until Grade 7).
  function g3TimeSigQuestion(rng) {
    const options = [
      { beats: 2, sig: "2/4" },
      { beats: 3, sig: "3/4" },
      { beats: 4, sig: "4/4" },
    ];
    const opt = pick(rng, options);
    const { notes, velocities } = meterNotes(opt.beats);
    const label = String(opt.beats);
    const expl = {
      "2/4": "2/4 has two crotchet beats — a march feel. Only beat 1 is accented.",
      "3/4": "3/4 has three crotchet beats — a waltz feel: a strong beat 1, then two lighter beats.",
      "4/4": "4/4 (common time) has four crotchet beats. Beat 1 is strongest and beat 3 has a lighter secondary accent — that extra mid-bar stress is what tells four-time apart from two-time.",
    };
    return {
      prompt: `Listen to this rhythmic pattern. How many <strong>beats</strong> are in each bar?`,
      audio: function () { audio().sequence(notes, 0.5, 0.12, velocities); },
      choices: choices(rng, label, ["2", "3", "4"], 3),
      answer: label,
      explanation: `That was in <b>${opt.sig}</b> time. ${expl[opt.sig]}`,
    };
  }

  // Test 3D: Major or minor?
  function g3TonalityQuestion(rng) {
    const isMajor = rng.bool();
    const root = MIDI.C4;
    const scale = isMajor ? majorScale(root).slice(0, 5) : minorScale(root).slice(0, 5);
    const ans = isMajor ? "Major" : "Minor";
    return {
      prompt: `Listen to this short passage. Is it in a <strong>major</strong> or <strong>minor</strong> key?`,
      audio: function () { audio().sequence(scale, 0.45, 0.42); },
      choices: choices(rng, ans, ["Major", "Minor"], 2),
      answer: ans,
      explanation: isMajor
        ? `That was <b>major</b> — it uses a major scale. Major keys tend to sound bright, confident, and stable. The key note and the 3rd above it (a <em>major</em> 3rd) are the clearest signal.`
        : `That was <b>minor</b> — it uses a minor scale. The lowered 3rd (a semitone closer to the root than in major) gives the characteristic darker sound.`,
    };
  }

  function g3AuralQuestion(rng) {
    const type = rng.int(0, 4);
    if (type === 0) return g3TimeSigQuestion(rng);
    if (type === 1) return g3SpotChangeQuestion(rng);
    if (type === 2) return g3TonalityQuestion(rng);
    if (type === 3) return g1DynamicsQuestion(rng);
    return g1ArticulationQuestion(rng);
  }

  // =========================================================================
  // Grade 4 generators
  // =========================================================================

  // Test 4A/5A: sing back a melody from memory. The melody is played twice, then
  // the singer reproduces it with no printed score. Octave range, major or minor
  // up to 3 sharps/flats, sung register kept within roughly A3-E5.
  const MODE_LABEL = { major: "major", minor: "minor" };
  function memorySingQuestion(rng, gradeLabel) {
    const m = auralGen().generateMelody(rng, MELODY_SPECS.memory);
    const beatSec = 0.5;
    const onePlayMs = m.durations.reduce(function (s, d) { return s + d; }, 0) * beatSec * 1000;
    const gapMs = 900;
    // The mic opens after BOTH playings finish.
    const autoPlayAndRespondMs = Math.round(onePlayMs + gapMs + onePlayMs + 350);
    const useFlats = keyUsesFlats(m.key);
    return {
      prompt: `Listen to this ${MODE_LABEL[m.mode]}-key melody, played <strong>twice</strong>. Then <strong>sing it back from memory</strong> - there is no score to read.`,
      audio: function () {
        const a = audio();
        a.sequenceRhythm(m.notes, m.durations, beatSec);
        later(function () { a.sequenceRhythm(m.notes, m.durations, beatSec); }, onePlayMs + gapMs);
      },
      micTask: {
        type: "sequence",
        useFlats: useFlats,
        targets: makeSequenceTargets(m.notes, useFlats),
        autoPlayAndRespondMs: autoPlayAndRespondMs,
        toleranceSemitones: 1.0,
        revealStaffHtml: sequenceStaff(m.notes),
      },
      choices: ["I sang it back", "I couldn't manage it"],
      answer: "I sang it back",
      explanation: `${gradeLabel} memory singing: a melody spanning up to an octave, major or minor (up to 3 sharps or flats), played twice. Hold the overall shape and the tonic in your head during the gap, then reproduce it - the two hearings are your only reference.`,
    };
  }
  function g4MemorySingQuestion(rng) { return memorySingQuestion(rng, "Grade 4"); }
  function g5MemorySingQuestion(rng) { return memorySingQuestion(rng, "Grade 5"); }

  // Test 4B: Sight-sing a 5-note phrase from a printed score.
  // Only tonic is played (for pitch reference). Student reads and sings in sequence.
  function g4SightSingQuestion(rng) {
    const m = auralGen().generateMelody(rng, MELODY_SPECS.g4SightSing);
    const useFlats = keyUsesFlats(m.key);
    return {
      prompt: `Listen to the tonic of <b>${m.key} major</b>, then <strong>sing each note</strong> shown in order. Start when you\'re ready.${sequenceStaff(m.notes)}`,
      audio: function () { audio().note(m.tonicMidi, 1.2); },
      micTask: {
        type: "sequence",
        useFlats: useFlats,
        targets: makeSequenceTargets(m.notes, useFlats),
        toleranceSemitones: 1.0,
        minHoldMs: 500,
      },
      choices: ["I sang the phrase", "I couldn't manage it"],
      answer: "I sang the phrase",
      explanation: `Grade 4 sight-singing: 5 notes in C, F, or G major, starting and ending on the tonic and staying within a 3rd of it. Steps and small skips only — work out each note\'s position relative to the tonic you heard.`,
    };
  }

  // Test 4C part 2: clap back the rhythm, then say whether it's in 2, 3, or 4
  // time. The app can't grade a clap, so it plays a one-bar rhythm (mixed note
  // values, repeated over two bars on a single pitch, since a clapped rhythm
  // carries no pitch of its own) and asks which notated pattern matches —
  // folding "which rhythm" and "which time signature" into one answer.
  function g4RhythmTimeSigQuestion(rng) {
    const beatsPerBar = pick(rng, [2, 3, 4]);
    const patterns = CLAP_RHYTHM_PATTERNS[beatsPerBar];
    const pattern = pick(rng, patterns);
    const notes = [];
    const durations = [];
    for (let bar = 0; bar < 2; bar++) {
      pattern.forEach((beats) => { notes.push(MIDI.E4); durations.push(beats); });
    }
    const velocities = rhythmAccents(durations, beatsPerBar);
    const ans = patternLabel(beatsPerBar, pattern);
    const sameMeterDistractors = patterns.filter((p) => p !== pattern).map((p) => patternLabel(beatsPerBar, p));
    // A cross-meter distractor is only fair if it can't sound the same as the
    // target: never pit two isochronous patterns (in different metres) against
    // each other, since the metric accents are then the only cue and both labels
    // "match" the pulse equally.
    const otherMeter = pick(rng, [2, 3, 4].filter((b) => b !== beatsPerBar));
    let otherPool = CLAP_RHYTHM_PATTERNS[otherMeter];
    if (isIsochronous(pattern)) otherPool = otherPool.filter((p) => !isIsochronous(p));
    const otherDistractor = patternLabel(otherMeter, pick(rng, otherPool));
    return {
      prompt: `Listen to this rhythm, clapped on a single note (the first beat of each bar is accented). Which pattern matches what you heard, and how many beats are in each bar?`,
      audio: function () { audio().sequenceRhythm(notes, durations, 0.5, velocities); },
      choices: choices(rng, ans, [...sameMeterDistractors, otherDistractor], 3),
      answer: ans,
      explanation: `That was <b>${beatsPerBar}/4</b>: ${patternGlyphs(pattern)}, repeated over two bars. Count the beats between the accented downbeats to fix the metre, then the pattern of long and short notes within the bar gives the rhythm.`,
    };
  }

  // Test 4C part 1: character / features questions.
  function g4CharacterQuestion(rng) {
    const questions = [
      {
        prompt: `Listen — is this passage played <strong>smoothly</strong> or <strong>detached</strong>?`,
        gen: function () { return g1ArticulationQuestion(rng); },
      },
      {
        prompt: `Listen — is this music <strong>loud</strong> or <strong>quiet</strong>?`,
        gen: function () { return g1DynamicsQuestion(rng); },
      },
      {
        prompt: `Listen — is this passage in a <strong>major</strong> or <strong>minor</strong> key?`,
        gen: function () { return g3TonalityQuestion(rng); },
      },
    ];
    return pick(rng, questions).gen();
  }

  // =========================================================================
  // Grade 5 generators
  // =========================================================================

  // Test 5C: Style and period identification.
  function g5StyleQuestion(rng) {
    const periods = [
      {
        name: "Baroque",
        label: "Baroque (c.1600-1750)",
        features: "regular rhythms, ornamental detail, no dynamic swells",
        audio: function () {
          // Ornate stepwise line in steady rhythm.
          audio().sequence([MIDI.C5, MIDI.B4, MIDI.A4, MIDI.G4, MIDI.F4, MIDI.E4, MIDI.D4, MIDI.C4], 0.28, 0.26);
        },
      },
      {
        name: "Classical",
        label: "Classical (c.1750-1820)",
        features: "balanced phrases, clear dynamics, neat cadences",
        audio: function () {
          audio().sequence([MIDI.C4, MIDI.E4, MIDI.G4, MIDI.C5, MIDI.G4, MIDI.E4, MIDI.C4], 0.38, 0.36);
        },
      },
      {
        name: "Romantic",
        label: "Romantic (c.1820-1900)",
        features: "expressive melody, wide dynamic range, rubato",
        audio: function () {
          // Longer, more lyrical phrase.
          audio().sequence([MIDI.C4, MIDI.D4, MIDI.F4, MIDI.E4, MIDI.C4, MIDI.A3, MIDI.B3, MIDI.C4], 0.55, 0.52);
        },
      },
      {
        name: "20th century",
        label: "20th century (after 1900)",
        features: "unexpected harmonies, irregular rhythms, modern sounds",
        audio: function () {
          // Chromatic, irregular pattern.
          audio().sequence([MIDI.C4, 61, 63, MIDI.D4, 66, MIDI.E4, 64, MIDI.C4], 0.32, 0.28);
        },
      },
    ];
    const p = pick(rng, periods);
    return {
      prompt: `Listen to this short passage. Which <strong>musical period</strong> does it most likely come from?`,
      audio: p.audio,
      choices: choices(rng, p.label, periods.map((x) => x.label), 4),
      answer: p.label,
      explanation: `That passage has features typical of the <b>${p.name}</b> period: ${p.features}. Grade 5 Test C asks you to identify whether a piece is Baroque, Classical, Romantic, or 20th-century based on its style.`,
    };
  }

  // Grade 5 sight-singing: 6-note phrase, wider range (5th above, 4th below),
  // begins/ends on the tonic; the only leap it may contain is the rising
  // dominant-to-tonic 4th.
  function g5SightSingQuestion(rng) {
    const m = auralGen().generateMelody(rng, MELODY_SPECS.g5SightSing);
    const useFlats = keyUsesFlats(m.key);
    return {
      prompt: `Listen to the tonic of <b>${m.key} major</b>, then <strong>sing each note</strong> shown in order. Take a moment to look before starting.${sequenceStaff(m.notes)}`,
      audio: function () { audio().note(m.tonicMidi, 1.2); },
      micTask: {
        type: "sequence",
        useFlats: useFlats,
        targets: makeSequenceTargets(m.notes, useFlats),
        toleranceSemitones: 1.0,
        minHoldMs: 500,
      },
      choices: ["I sang the phrase", "I couldn't manage it"],
      answer: "I sang the phrase",
      explanation: `Grade 5 sight-singing: 6 notes in C, F, G, D, or B♭ major, starting and ending on the tonic, range up to a 5th above and a 4th below it. The only leap allowed is the rising 4th from the dominant below up to the tonic — everything else moves by step.`,
    };
  }

  // =========================================================================
  // Grade 6-8 shared harmony helpers
  // =========================================================================
  // Grades 6-8 add cadences, chord progressions, modulation and two/three-part
  // textures. The two/three-part echo tasks stay in C major (a diatonic-scale
  // lookup below finds "a third below" for harmonizing a given line). Cadences,
  // chord progressions and modulation are transposed to a different major key
  // per question, so students don't only ever hear C major.

  function music() { return global.MTT.music; }

  // Semitone offset from C for each key the harmony tasks can appear in.
  const CHORD_KEYS = { C: 0, G: 7, F: 5, D: 2 };

  // Semitone offset from A3 (=57) for each supported minor key.  These are the
  // relative minors of the CHORD_KEYS major keys, so they share key signatures.
  const MINOR_CHORD_KEYS = { Am: 0, Em: 7, Dm: 5, Bm: 2 };
  // Human-readable names for display in prompts.
  const MINOR_KEY_NAMES = { Am: "A minor", Em: "E minor", Dm: "D minor", Bm: "B minor" };

  // Diatonic "3rd below" within an arbitrary major key. The sight-singing
  // accompaniment must stay in the phrase's own key (a plain -3 semitones or a
  // C-major lookup would sound out-of-key against G, D or B♭ major). Builds the
  // major scale of `tonicMidi`'s key across octaves and steps two scale-degrees
  // down from the given note.
  function majorScaleMidis(tonicPc) {
    const steps = [0, 2, 4, 5, 7, 9, 11];
    const out = [];
    for (let oct = 24; oct <= 96; oct += 12) {
      steps.forEach((s) => { const m = oct + tonicPc + s; if (m >= 24 && m <= 96) out.push(m); });
    }
    return out.sort((a, b) => a - b);
  }
  function diatonicThirdBelow(midi, tonicMidi) {
    const scale = majorScaleMidis(((tonicMidi % 12) + 12) % 12);
    const idx = scale.indexOf(midi);
    if (idx < 2) return midi - 3;
    return scale[idx - 2];
  }

  // Diatonic triads (root position) transposed to any of CHORD_KEYS by shifting
  // the C-major voicing wholesale — the voicing (spacing/register) stays fixed,
  // only the absolute pitch moves, which is all that matters for audio-only
  // (no notation) listening questions.
  function chordsForKey(key) {
    const shift = CHORD_KEYS[key];
    const t = (notes) => notes.map((m) => m + shift);
    return {
      I: t([MIDI.C4, MIDI.E4, MIDI.G4]),
      ii: t([MIDI.D4, MIDI.F4, MIDI.A4]),
      IV: t([65, MIDI.A4, 72]),
      V: t([MIDI.G4, MIDI.B4, MIDI.D5]),
      V7: t([MIDI.G4, MIDI.B4, MIDI.D5, MIDI.F5]),
      vi: t([MIDI.A4, MIDI.C5, MIDI.E5]),
    };
  }

  // exam-board chord-answer vocabulary: every naming (Roman numeral, technical name)
  // is accepted in the exam, so labels carry both.
  const CHORD_TECHNICAL = { I: "tonic", ii: "supertonic", IV: "subdominant", V: "dominant", V7: "dominant 7th", vi: "submediant" };
  function chordNameLabel(roman) {
    return `${roman} (${CHORD_TECHNICAL[roman]})`;
  }

  function cadencesForKey(chords) {
    return [
      { type: "perfect", label: "Perfect cadence (V-I)", chords: [chords.V, chords.I],
        explanation: `A <b>perfect cadence</b> (V-I) — the dominant resolving to the tonic. It's the strongest, most final-sounding close in tonal music.` },
      { type: "imperfect", label: "Imperfect cadence (ending on V)", chords: [chords.I, chords.V],
        explanation: `An <b>imperfect cadence</b> (ending on V) — it sounds unfinished, like a question rather than an answer.` },
      { type: "interrupted", label: "Interrupted cadence (V-vi)", chords: [chords.V, chords.vi],
        explanation: `An <b>interrupted cadence</b> (V-vi) — the ear expects the tonic after V, but gets vi instead. A "surprise" resolution.` },
      { type: "plagal", label: "Plagal cadence (IV-I)", chords: [chords.IV, chords.I],
        explanation: `A <b>plagal cadence</b> (IV-I) — sometimes called the "Amen" cadence from its use at the end of hymns.` },
    ];
  }

  // Minor-key voicings transposed from an A-minor base (A3=57). The V chord
  // uses the raised leading note from harmonic minor, making it a major
  // dominant (E-G♯-B in A minor). VI is the major submediant used in the
  // minor-key interrupted cadence (V→VI rather than V→vi).
  function chordsForKeyMinor(key) {
    const shift = MINOR_CHORD_KEYS[key];
    const t = (notes) => notes.map((m) => m + shift);
    return {
      i:  t([MIDI.A3, MIDI.C4, MIDI.E4]),   // minor tonic
      iv: t([MIDI.D4, MIDI.F4, MIDI.A4]),   // minor subdominant
      V:  t([MIDI.E4, 68,      MIDI.B4]),   // major dominant (G♯ = harmonic minor)
      VI: t([MIDI.F4, MIDI.A4, MIDI.C5]),   // major submediant (for interrupted)
    };
  }

  function cadencesForKeyMinor(chords) {
    return [
      { type: "perfect", label: "Perfect cadence (V-i)",
        chords: [chords.V, chords.i],
        explanation: `A <b>perfect cadence</b> (V-i) — the major dominant (raised 7th from harmonic minor) resolving to the minor tonic. The strongest, most final close in a minor key.` },
      { type: "imperfect", label: "Imperfect cadence (ending on V)",
        chords: [chords.i, chords.V],
        explanation: `An <b>imperfect cadence</b> (ending on V) — it sounds unfinished, like a question, in minor as in major.` },
      { type: "interrupted", label: "Interrupted cadence (V-VI)",
        chords: [chords.V, chords.VI],
        explanation: `An <b>interrupted cadence</b> (V-VI) — in a minor key V moves to the major submediant (VI) instead of the expected tonic: a sudden bright, surprising sound.` },
      { type: "plagal", label: "Plagal cadence (iv-i)",
        chords: [chords.iv, chords.i],
        explanation: `A <b>plagal cadence</b> (iv-i) — the minor subdominant resolving to the minor tonic; the "Amen" cadence in its minor form.` },
    ];
  }

  // Play a cadence the way exam-board presents it: sound the key chord (the tonic)
  // first to establish the tonality, a short gap, then the cadence chords. Pass
  // keyChord to prepend it; omit for a bare cadence.
  function playCadence(chordPair, keyChord) {
    return function () {
      const a = audio();
      let t = 0;
      if (keyChord) { a.chord(keyChord, 0.85); t = 1250; }
      later(function () { a.chord(chordPair[0], 0.9); }, t);
      later(function () { a.chord(chordPair[1], 1.1); }, t + 950);
    };
  }

  // Shared cadence-ID generator: pick from the first `count` cadence types
  // (perfect/imperfect at Grade 6, +interrupted at 7, +plagal at 8), in a
  // randomly-chosen key — major or minor — so students hear cadences in both
  // modes, as required by the exam-board Grade 6–7 syllabus.
  function auralCadenceQuestion(rng, count) {
    const minor = rng.bool();
    let tonicChord, keyLabel, pool;
    if (minor) {
      const key = pick(rng, Object.keys(MINOR_CHORD_KEYS));
      const chords = chordsForKeyMinor(key);
      tonicChord = chords.i;
      keyLabel = MINOR_KEY_NAMES[key];
      pool = cadencesForKeyMinor(chords).slice(0, count);
    } else {
      const key = pick(rng, Object.keys(CHORD_KEYS));
      const chords = chordsForKey(key);
      tonicChord = chords.I;
      keyLabel = `${key} major`;
      pool = cadencesForKey(chords).slice(0, count);
    }
    const c = pick(rng, pool);
    return {
      prompt: `Listen: the key chord of <b>${keyLabel}</b> sounds first, then a two-chord cadence. Which cadence is it?`,
      audio: playCadence(c.chords, tonicChord),
      choices: choices(rng, c.label, pool.map((x) => x.label), count),
      answer: c.label,
      explanation: c.explanation,
    };
  }

  function playChordSequence(chordSeq, keyChord) {
    return function () {
      const a = audio();
      let t0 = 0;
      if (keyChord) { a.chord(keyChord, 0.85); t0 = 1250; }
      chordSeq.forEach(function (ch, i) { later(function () { a.chord(ch, 1.0); }, t0 + i * 950); });
    };
  }

  // exam-board 7C(ii): a cadence is played, then the candidate names the TWO chords
  // that formed it. The chord pool is the official Grade 7 set (tonic,
  // subdominant, dominant, dominant 7th, submediant), all root position; the
  // two-chord pairs are genuine cadential progressions rather than the generic
  // I-IV-V strings the old chord-progression question used.
  const G7_CADENCE_PAIRS = [
    { pair: ["V", "I"], gloss: "a perfect cadence" },
    { pair: ["V7", "I"], gloss: "a perfect cadence with a dominant 7th" },
    { pair: ["I", "V"], gloss: "an imperfect cadence" },
    { pair: ["IV", "V"], gloss: "an imperfect cadence approached from the subdominant" },
    { pair: ["V", "vi"], gloss: "an interrupted cadence" },
  ];
  function pairLabel(pair) {
    return `${chordNameLabel(pair[0])} - ${chordNameLabel(pair[1])}`;
  }
  function g7ChordCadenceQuestion(rng) {
    const key = pick(rng, Object.keys(CHORD_KEYS));
    const chords = chordsForKey(key);
    const chosen = pick(rng, G7_CADENCE_PAIRS);
    const distractors = G7_CADENCE_PAIRS.filter((p) => p !== chosen).map((p) => pairLabel(p.pair));
    const ans = pairLabel(chosen.pair);
    return {
      prompt: `Listen: the key chord of <b>${key} major</b> sounds first, then a cadence. Which two chords formed the cadence, in order?`,
      audio: playCadence([chords[chosen.pair[0]], chords[chosen.pair[1]]], chords.I),
      choices: choices(rng, ans, distractors, 4),
      answer: ans,
      explanation: `That was <b>${ans}</b> - ${chosen.gloss}. In the exam you may answer with the Roman numerals (${chosen.pair[0]}-${chosen.pair[1]}), the technical names (${CHORD_TECHNICAL[chosen.pair[0]]}, ${CHORD_TECHNICAL[chosen.pair[1]]}), or the letter-name chords - all three are accepted.`,
    };
  }

  // The note that signals each modulation is always the same *scale-degree*
  // relative to the starting key: a raised 4th announces the dominant's
  // leading note, a lowered 7th (the flat 7th of the home key, which is the 4th
  // of the new key) announces the subdominant, and a raised 5th announces the
  // relative minor's leading note — true in any key.
  function modulationsForKey(key) {
    const shift = CHORD_KEYS[key];
    const t = (notes) => notes.map((m) => m + shift);
    const M = music();
    const sc = M.scale(key, "major");
    const alter = (n, delta) => M.spelled(n.letter, n.accidental + delta, n.octave);
    const dominantNote = M.spelledName(alter(sc[3], 1));
    const subdominantNote = M.spelledName(alter(sc[6], -1));
    const relativeMinorNote = M.spelledName(alter(sc[4], 1));
    const relativeMinorName = M.relativeMinorOf(key);
    return [
      { label: "Modulates to the dominant", accidentalNote: dominantNote, play: function () {
        const a = audio();
        a.sequence(t([MIDI.C4, MIDI.E4, MIDI.G4, MIDI.C5]), 0.42, 0.4);
        later(function () { a.sequence(t([66, MIDI.G4, MIDI.B4, MIDI.D5, MIDI.G4]), 0.42, 0.4); }, 1900);
      } },
      { label: "Modulates to the subdominant", accidentalNote: subdominantNote, play: function () {
        const a = audio();
        a.sequence(t([MIDI.C4, MIDI.E4, MIDI.G4, MIDI.C5]), 0.42, 0.4);
        later(function () { a.sequence(t([70, 69, 65, 69, 72]), 0.42, 0.4); }, 1900);
      } },
      { label: "Modulates to the relative minor", accidentalNote: `${relativeMinorNote} (leading note of ${relativeMinorName} minor)`, play: function () {
        const a = audio();
        a.sequence(t([MIDI.C4, MIDI.E4, MIDI.G4, MIDI.C5]), 0.42, 0.4);
        later(function () { a.sequence(t([68, MIDI.A4, MIDI.E4, MIDI.A4, MIDI.C5]), 0.42, 0.4); }, 1900);
      } },
    ];
  }

  function modulationQuestion(rng) {
    const key = pick(rng, Object.keys(CHORD_KEYS));
    const pool = modulationsForKey(key);
    const m = pick(rng, pool);
    return {
      prompt: `Listen — this passage starts in <b>${key} major</b>, then <strong>modulates</strong> (changes key). Where does it move to?`,
      audio: m.play,
      choices: choices(rng, m.label, pool.map((x) => x.label), 3),
      answer: m.label,
      explanation: `${m.label} — listen for <b>${m.accidentalNote}</b>, the note that signals the new key has arrived. Modulation to the dominant, subdominant, or relative minor are the three most common moves from a major key.`,
    };
  }

  // exam-board 8C: a passage that *starts in a minor key* and modulates. The two most
  // common destinations from minor are the relative major (no new accidental -
  // the music simply brightens) and the dominant (announced by the sharpened
  // leading note of the new key). Minor keys are chosen so the relative major is
  // one of the app's keys. Notes are given in MIDI so the cadences are exact.
  const MINOR_START_MODS = [
    { minor: "A minor", establish: [57, 60, 64, 69],
      toRelative: { chords: [[67, 71, 74], [60, 64, 67]] },          // G -> C
      toDominant: { chords: [[59, 63, 66], [64, 68, 71]], signal: "D♯" } }, // B -> E, D♯ leads to E
    { minor: "D minor", establish: [62, 65, 69, 74],
      toRelative: { chords: [[60, 64, 67], [65, 69, 72]] },          // C -> F
      toDominant: { chords: [[64, 68, 71], [69, 73, 76]], signal: "G♯" } }, // E -> A
    { minor: "E minor", establish: [64, 67, 71, 76],
      toRelative: { chords: [[62, 66, 69], [67, 71, 74]] },          // D -> G
      toDominant: { chords: [[66, 70, 73], [71, 75, 78]], signal: "A♯" } }, // F♯ -> B
  ];
  function minorModulationQuestion(rng) {
    const k = pick(rng, MINOR_START_MODS);
    const toRelative = rng.bool();
    const target = toRelative ? k.toRelative : k.toDominant;
    const ans = toRelative ? "Modulates to the relative major" : "Modulates to the dominant";
    const play = function () {
      const a = audio();
      a.sequence(k.establish, 0.32, 0.3);
      later(function () { a.chord(target.chords[0], 0.9); }, 1500);
      later(function () { a.chord(target.chords[1], 1.2); }, 2450);
    };
    const explanation = toRelative
      ? `Modulates to the <b>relative major</b> — the minor's brighter partner a minor 3rd above, sharing the same key signature (so no new accidental appears; the music just turns from dark to bright as it settles onto the major chord).`
      : `Modulates to the <b>dominant</b> — listen for <b>${target.signal}</b>, the sharpened leading note of the new key. From a minor key, the relative major and the dominant are the two commonest destinations.`;
    return {
      prompt: `Listen — this passage starts in <b>${k.minor}</b>, then <strong>modulates</strong>. Where does it move to?`,
      audio: play,
      choices: choices(rng, ans, ["Modulates to the relative major", "Modulates to the dominant", "Modulates to the subdominant"], 3),
      answer: ans,
      explanation: explanation,
    };
  }

  // Spec for the generated multi-part material (Grade 6-8 two/three-part echo and
  // the texture question): a singable melodic line to which a real, independent
  // companion line is added by the counterpoint generator.
  const MULTI_PART_SPEC = { keys: ["C", "G", "D"], mode: "either", range: { above: 4, below: 0 }, bars: 2, beatsPerBar: 2, rhythmPalette: [[1, 1], [2]], maxLeap: 2, startsOn: "tonic", endsOn: "free" };
  const MULTI_BEAT = 0.55;

  // Play several note-against-note lines together with a shared rhythm.
  function playParts(lines, durations) {
    return function () {
      const a = audio();
      lines.forEach(function (line) { a.sequenceRhythm(line, durations, MULTI_BEAT); });
    };
  }

  // Shared two-part echo generator: `voice` selects which line the student sings
  // back; the other plays as harmonic context. The two lines are generated as
  // real first-species counterpoint (consonant, independent contour, no parallel
  // perfect 5ths/octaves) rather than locked parallel thirds.
  function twoPartEchoQuestion(rng, voice, gradeLabel) {
    const m = auralGen().generateMelody(rng, MULTI_PART_SPEC);
    const bottom = auralGen().generateCompanion(rng, m, { direction: "below" });
    const target = voice === "top" ? m.notes : bottom;
    const which = voice === "top" ? "upper" : "lower";
    const useFlats = keyUsesFlats(m.key);
    return {
      prompt: `Listen to this two-part phrase, then sing back <strong>just the ${which} line</strong>. Your line stays hidden until afterwards - isolate it by ear.`,
      audio: playParts([m.notes, bottom], m.durations),
      micTask: {
        type: "sequence",
        useFlats: useFlats,
        targets: makeSequenceTargets(target, useFlats),
        autoPlayAndRespondMs: echoRespondMs(m.durations, MULTI_BEAT),
        toleranceSemitones: gradeLabel === "Grade 7" ? 0.5 : 1.0,
        revealStaffHtml: sequenceStaff(target),
      },
      choices: ["I sang the " + which + " line", "I couldn't match it"],
      answer: "I sang the " + which + " line",
      explanation: `${gradeLabel} echo singing: two lines play together and you sing back only the <b>${which}</b> one, ignoring the other. Listen once through for the whole texture, then lock onto your line before it starts.`,
    };
  }

  function threePartEchoQuestion(rng) {
    const m = auralGen().generateMelody(rng, MULTI_PART_SPEC);
    const mid = auralGen().generateCompanion(rng, m, { direction: "below" });
    const bottom = auralGen().generateCompanion(rng, { notes: mid, key: m.key, mode: m.mode }, { direction: "below" });
    const useFlats = keyUsesFlats(m.key);
    return {
      prompt: `Listen to this three-part phrase, then sing back <strong>just the lowest line</strong>. It stays hidden until afterwards - track it by ear.`,
      audio: playParts([m.notes, mid, bottom], m.durations),
      micTask: {
        type: "sequence",
        useFlats: useFlats,
        targets: makeSequenceTargets(bottom, useFlats),
        autoPlayAndRespondMs: echoRespondMs(m.durations, MULTI_BEAT),
        toleranceSemitones: 0.5,
        revealStaffHtml: sequenceStaff(bottom),
      },
      choices: ["I sang the lowest line", "I couldn't match it"],
      answer: "I sang the lowest line",
      explanation: `Grade 8 echo singing: three lines play together and you sing back only the <b>lowest</b> one. This is the hardest line to isolate — the ear naturally follows the top, so deliberately listen "underneath" the texture.`,
    };
  }

  // Texture question (Grade 6+): single line, melody+accompaniment, or two
  // independent moving lines. The "two independent lines" option now plays a
  // genuine counterpoint (independent contour), not parallel thirds.
  function textureQuestion(rng) {
    const m = auralGen().generateMelody(rng, MULTI_PART_SPEC);
    const companion = auralGen().generateCompanion(rng, m, { direction: "below" });
    const totalSec = m.durations.reduce(function (s, d) { return s + d; }, 0) * MULTI_BEAT;
    const drone = m.tonicMidi - 12;
    const options = [
      { type: "single", label: "A single melodic line", play: function () { audio().sequenceRhythm(m.notes, m.durations, MULTI_BEAT); } },
      { type: "accompanied", label: "A melody with a sustained accompaniment", play: function () {
        const a = audio();
        a.sequenceRhythm(m.notes, m.durations, MULTI_BEAT);
        a.note(drone, totalSec + 0.3);
      } },
      { type: "twoLines", label: "Two independent moving lines", play: playParts([m.notes, companion], m.durations) },
    ];
    const opt = pick(rng, options);
    return {
      prompt: `Listen to the <strong>texture</strong> — is it a single line, a melody with accompaniment, or two independent moving lines?`,
      audio: opt.play,
      choices: choices(rng, opt.label, options.map((x) => x.label), 3),
      answer: opt.label,
      explanation: `That was <b>${opt.label.toLowerCase()}</b>. Texture questions ask how many independent things are happening at once — a bare tune, a tune over a held accompaniment, or two lines moving independently against each other.`,
    };
  }

  // =========================================================================
  // Grade 6 generators
  // =========================================================================

  function g6CadenceQuestion(rng) { return auralCadenceQuestion(rng, 2); }

  function g6FeaturesQuestion(rng) {
    if (rng.bool()) return textureQuestion(rng);
    const pool = [g3TonalityQuestion, g1DynamicsQuestion, g1ArticulationQuestion, g2TempoQuestion, g5StyleQuestion];
    return pick(rng, pool)(rng);
  }

  function g6EchoTwoPartQuestion(rng) { return twoPartEchoQuestion(rng, "top", "Grade 6"); }

  function g6SightSingQuestion(rng) {
    const m = auralGen().generateMelody(rng, MELODY_SPECS.g6SightSing);
    const companion = auralGen().generateCompanion(rng, m, { direction: "below" });
    const beatSec = 0.6;
    const tonicDurSec = 1.2;
    const accompDelayMs = tonicDurSec * 1000 + 100;
    const useFlats = keyUsesFlats(m.key);
    return {
      prompt: `Listen to the tonic of <b>${m.key} major</b>, then <strong>sing each note</strong> shown while the accompaniment plays underneath.${sequenceStaff(m.notes)}`,
      audio: function () {
        const a = audio();
        a.note(m.tonicMidi, tonicDurSec);
        later(function () { a.sequenceRhythm(companion, m.durations, beatSec); }, accompDelayMs);
      },
      micTask: {
        type: "sequence",
        useFlats: useFlats,
        targets: makeSequenceTargets(m.notes, useFlats),
        toleranceSemitones: 1.0,
        minHoldMs: 500,
      },
      choices: ["I sang the phrase", "I couldn't manage it"],
      answer: "I sang the phrase",
      explanation: `Grade 6 sight-singing: a longer phrase within an octave, in a major key with up to 2 sharps or flats, starting and ending on the tonic. The only leap allowed is the same rising dominant-to-tonic 4th as Grade 5. A generated accompaniment plays underneath — listen to the tonic as your reference, then sing as the accompaniment begins.`,
    };
  }

  // =========================================================================
  // Grade 7 generators
  // =========================================================================

  // Time signature including compound time (6/8) — this is the first grade
  // where 6/8 appears in the aural test.
  function g7TimeSigQuestion(rng) {
    const options = [
      { label: "Two time (2/4)", sig: "2/4", compound: false, beats: 2, note: "two even crotchet beats, only beat 1 accented (march feel)" },
      { label: "Three time (3/4)", sig: "3/4", compound: false, beats: 3, note: "three crotchet beats, a strong beat 1 then two lighter beats (waltz feel)" },
      { label: "Four time (4/4)", sig: "4/4", compound: false, beats: 4, note: "four crotchet beats with a strong beat 1 and a lighter accent on beat 3" },
      { label: "Compound time (6/8)", sig: "6/8", compound: true, beats: 2, note: "two main beats, but each divides into <em>three</em> quavers — a lilting 1-and-a 2-and-a swing" },
    ];
    const opt = pick(rng, options);
    const played = opt.compound ? compoundSixEightNotes() : meterNotes(opt.beats);
    const step = opt.compound ? 0.28 : 0.5;
    return {
      prompt: `Listen to this rhythmic pattern. Is it in <strong>two, three, four or 6/8 time</strong>? Listen for whether each beat divides in two (simple) or three (compound).`,
      audio: function () { audio().sequence(played.notes, step, 0.12, played.velocities); },
      choices: choices(rng, opt.label, options.map((o) => o.label), 4),
      answer: opt.label,
      explanation: `That was in <b>${opt.sig}</b> time — ${opt.note}. The tell for 6/8 is the triple subdivision: you can count "1-and-a, 2-and-a" against just two main pulses.`,
    };
  }

  function g7CadenceQuestion(rng) { return auralCadenceQuestion(rng, 3); }
  function g7ModulationQuestion(rng) { return modulationQuestion(rng); }
  function g7EchoTwoPartQuestion(rng) { return twoPartEchoQuestion(rng, "bottom", "Grade 7"); }

  function g7FeaturesQuestion(rng) {
    const pool = [textureQuestion, g3TonalityQuestion, g1DynamicsQuestion, g1ArticulationQuestion, g2TempoQuestion, g5StyleQuestion];
    return pick(rng, pool)(rng);
  }

  // Grade 7/8 sight-sing phrases: a two-part texture (the companion part comes
  // from diatonicThirdBelow below), so these stay a hand-written bank rather
  // than a single generated line - keys up to 4 sharps/flats.
  const G7_SIGHT_PHRASES = [
    { root: MIDI.C4, name: "C major", phrases: [
      [MIDI.C4, MIDI.D4, 65, MIDI.E4, MIDI.D4, MIDI.C4],     // C D F E D C
      [MIDI.G4, MIDI.E4, MIDI.D4, MIDI.C4, MIDI.B3, MIDI.C4], // G E D C B C
      [MIDI.C4, MIDI.E4, 65, MIDI.G4, MIDI.E4, MIDI.C4],      // C E F G E C
      [MIDI.C4, MIDI.B3, MIDI.A3, MIDI.G3, MIDI.A3, MIDI.C4], // C B A G A C
    ]},
    { root: 65, name: "F major", phrases: [
      [65, 67, MIDI.A4, 72, MIDI.A4, 65],                         // F G A C' A F
      [65, MIDI.E4, MIDI.D4, MIDI.C4, MIDI.D4, 65],               // F E D C D F
      [72, MIDI.A4, 67, 65, 67, MIDI.A4],                         // C' A G F G A
    ]},
    { root: MIDI.G4, name: "G major", phrases: [
      [MIDI.G4, MIDI.A4, MIDI.B4, MIDI.D5, MIDI.B4, MIDI.G4],  // G A B D' B G
      [MIDI.G4, 66, MIDI.E4, MIDI.D4, MIDI.E4, MIDI.G4],        // G F# E D E G
    ]},
    { root: 62, name: "D major", phrases: [
      [62, 64, 66, 69, 66, 64, 62],   // D E F# A F# E D
      [69, 66, 64, 62, 61, 62, 69],   // A F# E D C# D A (leading tone C#)
      [62, 66, 69, 71, 69, 66, 62],   // D F# A B A F# D
    ]},
    { root: 70, name: "B♭ major", phrases: [
      [70, 72, 74, 75, 74, 72, 70],   // Bb C D Eb D C Bb
      [70, 74, 77, 79, 77, 74, 70],   // Bb D F G F D Bb
      [77, 75, 74, 72, 70, 72, 77],   // F Eb D C Bb C F
    ]},
  ];

  function g7SightSingQuestion(rng) {
    const keyDef = pick(rng, G7_SIGHT_PHRASES);
    const phrase = pick(rng, keyDef.phrases);
    const bass = phrase.map(function (m) { return diatonicThirdBelow(m, keyDef.root); });
    const useFlats = keyUsesFlats(keyDef.name);
    return {
      prompt: `Listen to the tonic of <b>${keyDef.name}</b>, then <strong>sing the upper part</strong> shown while the lower part plays underneath.${sequenceStaff(phrase)}`,
      audio: function () {
        const a = audio();
        a.note(keyDef.root, 1.0);
        later(function () { a.sequence(bass, 0.6, 0.55); }, 1100);
      },
      micTask: {
        type: "sequence",
        useFlats: useFlats,
        targets: makeSequenceTargets(phrase, useFlats),
        toleranceSemitones: 0.5,
        minHoldMs: 500,
      },
      choices: ["I sang the phrase", "I couldn't manage it"],
      answer: "I sang the phrase",
      explanation: `Grade 7 sight-singing: you sing the upper part of a two-part phrase while the lower part is played underneath — up to 4 sharps or flats. Hold your line steady even as the other part moves against it.`,
    };
  }

  // =========================================================================
  // Grade 8 generators
  // =========================================================================

  function g8CadenceQuestion(rng) { return auralCadenceQuestion(rng, 4); }

  // exam-board 8A(iii): name all three chords of a cadential progression (approach
  // chord + the two cadence chords), drawn from the Grade 8 vocabulary.
  const G8_CADENTIAL_PROGRESSIONS = [
    { seq: ["ii", "V", "I"], gloss: "a perfect cadence approached through the supertonic" },
    { seq: ["IV", "V", "I"], gloss: "a perfect cadence approached through the subdominant" },
    { seq: ["I", "IV", "V"], gloss: "ending on an imperfect cadence" },
    { seq: ["I", "ii", "V"], gloss: "ending on an imperfect cadence" },
    { seq: ["I", "V", "vi"], gloss: "ending on an interrupted cadence" },
  ];
  function g8ChordProgressionQuestion(rng) {
    const key = pick(rng, Object.keys(CHORD_KEYS));
    const chords = chordsForKey(key);
    const chosen = pick(rng, G8_CADENTIAL_PROGRESSIONS);
    const label = (seq) => seq.map(chordNameLabel).join(" - ");
    const ans = label(chosen.seq);
    const distractors = G8_CADENTIAL_PROGRESSIONS.filter((p) => p !== chosen).map((p) => label(p.seq));
    return {
      prompt: `Listen: the key chord of <b>${key} major</b> sounds first, then a three-chord progression ending with a cadence. Name the three chords in order.`,
      audio: playChordSequence(chosen.seq.map((r) => chords[r]), chords.I),
      choices: choices(rng, ans, distractors, 4),
      answer: ans,
      explanation: `That was <b>${ans}</b> - ${chosen.gloss}. Follow the bass to find each chord's root, then confirm the cadence formed by the last two chords.`,
    };
  }
  // exam-board 8C presents two passages, one starting major and one starting minor,
  // so Grade 8 mixes the major-start and minor-start modulation stimuli.
  function g8ModulationQuestion(rng) { return rng.bool() ? minorModulationQuestion(rng) : modulationQuestion(rng); }
  function g8EchoThreePartQuestion(rng) { return threePartEchoQuestion(rng); }

  function g8FeaturesQuestion(rng) {
    const pool = [textureQuestion, g3TonalityQuestion, g1DynamicsQuestion, g1ArticulationQuestion, g2TempoQuestion, g5StyleQuestion];
    return pick(rng, pool)(rng);
  }

  function g8SightSingQuestion(rng) {
    const keyDef = pick(rng, G7_SIGHT_PHRASES);
    const phrase = pick(rng, keyDef.phrases);
    // A line a 6th above each target note (an octave up, then a diatonic 3rd
    // back down), kept in the phrase's own key.
    const upper = phrase.map(function (m) { return diatonicThirdBelow(m + 12, keyDef.root); });
    const useFlats = keyUsesFlats(keyDef.name);
    return {
      prompt: `Listen to the tonic of <b>${keyDef.name}</b>, then <strong>sing the lower part</strong> shown while the upper part plays above.${sequenceStaff(phrase)}`,
      audio: function () {
        const a = audio();
        a.note(keyDef.root, 1.0);
        later(function () { a.sequence(upper, 0.6, 0.55); }, 1100);
      },
      micTask: {
        type: "sequence",
        useFlats: useFlats,
        targets: makeSequenceTargets(phrase, useFlats),
        toleranceSemitones: 0.5,
        minHoldMs: 500,
      },
      choices: ["I sang the phrase", "I couldn't manage it"],
      answer: "I sang the phrase",
      explanation: `Grade 8 sight-singing: you sing the lower part of a two-part phrase while the upper part is played above — up to 4 sharps or flats. Trust your own line rather than following the part above it.`,
    };
  }

  // =========================================================================
  // Inject topics into MTT.content.grades
  // =========================================================================

  const auralTopics = [
    {
      grade: 1,
      topics: [
        {
          id: "g1-aural-time",
          title: "Aural: pulse & time signature",
          why: "In the Grade 1 aural test the examiner plays a short piece and you clap the pulse, then say whether it is in 2 or 3 beats per bar. This is the foundation of all rhythmic awareness.",
          what: "<p>Listen for the <b>strong beat</b> — the beat that sounds slightly heavier or more accented. Count how many beats pass before the next strong beat arrives. That count is the time signature's top number.</p><p class=\"muted\" style=\"font-size:.9em\">In 2/4 the pattern feels like a <em>march</em> (ONE two, ONE two). In 3/4 it feels like a <em>waltz</em> (ONE two three, ONE two three).</p>",
          questions: g1TimeSigQuestion,
          tags: ["aural"],
        },
        {
          id: "g1-aural-change",
          title: "Aural: spot the change",
          why: "In the Grade 1 aural test the examiner plays a two-bar phrase twice; the second time one note is different. You say whether the change was at the beginning or the end.",
          what: "<p>Listen to the whole phrase the first time, then on the second playing focus on whether the <b>first</b> note sounds different or the <b>last</b> note. The change is always a single step (up or down).</p><p class=\"muted\" style=\"font-size:.9em\">Tip: hum along with the first phrase to lock it in memory, then compare as you listen to the repeat.</p>",
          questions: g1SpotChangeQuestion,
          tags: ["aural"],
        },
        {
          id: "g1-aural-features",
          title: "Aural: dynamics & articulation",
          why: "In the Grade 1 aural test the examiner asks two questions about a short piece — they come from dynamics (loud/quiet) and articulation (smooth/detached). This trains you to hear how music is performed, not just which notes are played.",
          what: "<p><b>Dynamics:</b> forte (f) = loud; piano (p) = quiet; crescendo = getting louder; diminuendo = getting quieter.<br><b>Articulation:</b> legato = smooth and connected; staccato = short and detached.</p>",
          questions: (rng) => rng.bool() ? g1DynamicsQuestion(rng) : g1ArticulationQuestion(rng),
          tags: ["aural"],
        },
        {
          id: "g1-aural-sing",
          title: "Aural: echo singing",
          why: "In the Grade 1 aural test the examiner plays three different short phrases in turn and you sing each one back immediately after hearing it. The melodies are simple — 3 to 4 notes using steps in C major.",
          what: "<p>Listen for each phrase's <b>shape</b> (going up? going down? a step or a skip?) and sing it back on a comfortable vowel like 'lah'. You can sing in any octave that suits your voice. There are three different phrases — sing each one straight back after you hear it.</p><p class=\"muted\" style=\"font-size:.9em\">Sing the whole phrase, then pause — the mic records your attempt and scores all the notes together once you stop.</p>",
          questions: g1EchoMelodyQuestion,
          tags: ["aural"],
        },
      ],
    },
    {
      grade: 2,
      topics: [
        {
          id: "g2-aural-time",
          title: "Aural: pulse & time signature",
          why: "Grade 2 tests the same two-beat/three-beat recognition as Grade 1 — the skill needs to become automatic before new time signatures are added at Grade 3.",
          what: "<p>Keep listening for the <b>strong beat</b> and counting how many beats pass before it repeats. This should now feel quick and confident, since new tasks this grade — tempo changes and pitch/rhythm change spotting — need that spare attention.</p>",
          questions: g1TimeSigQuestion,
          tags: ["aural"],
        },
        {
          id: "g2-aural-change",
          title: "Aural: pitch or rhythm change?",
          why: "Grade 2 Test C asks not just <em>where</em> the change was, but <em>what kind</em> — pitch (which note) or rhythm (how long). This sharpens listening focus.",
          what: "<p>Pitch change: a note moves higher or lower. Rhythm change: a note becomes shorter or longer. Listen twice before deciding — on the first listening just absorb the phrase; on the second, listen for <em>what specifically</em> is different.</p>",
          questions: g2ChangeTypeQuestion,
          tags: ["aural"],
        },
        {
          id: "g2-aural-tempo",
          title: "Aural: tempo changes",
          why: "Grade 2 Test D adds tempo to the list of features you can be asked about. You should be able to hear whether the speed is steady, speeding up (accelerando), or slowing down (ritardando).",
          what: "<p><b>Accelerando</b> (accel.): gradually getting faster. <b>Ritardando</b> (rit.) or rallentando (rall.): gradually slowing down. A <b>steady</b> tempo maintains the same speed throughout.</p>",
          questions: g2TempoQuestion,
          tags: ["aural"],
        },
        {
          id: "g2-aural-sing",
          title: "Aural: echo singing (major & minor)",
          why: "Grade 2 echo-singing (Test B) introduces minor-key phrases. The examiner plays three different phrases in turn; each spans up to the dominant (5th of the scale) and can be in major or minor.",
          what: "<p>Listen for the <b>3rd note</b> — in minor phrases it will feel lower or darker than you might expect. Sing back on any syllable ('lah', 'dah') in any comfortable octave. Hold each note briefly before moving to the next.</p>",
          questions: g2EchoMelodyQuestion,
          tags: ["aural"],
        },
      ],
    },
    {
      grade: 3,
      topics: [
        {
          id: "g3-aural-time",
          title: "Aural: 2, 3, or 4 beats per bar",
          why: "Grade 3 adds 4-time to the 2-time and 3-time from Grades 1-2. The challenge is quickly distinguishing all three: the march of 2, the waltz of 3, and the broad stride of 4.",
          what: "<p>In 4/4, there are two 'groups' of two within each bar: a strong-weak-strong-weak pattern. Compare: 2/4 = march (ONE two), 3/4 = waltz (ONE two three), 4/4 = strong stride (ONE two THREE four). Compound time (6/8) doesn't appear until much later.</p>",
          questions: g3TimeSigQuestion,
          tags: ["aural"],
        },
        {
          id: "g3-aural-tonality",
          title: "Aural: major or minor?",
          why: "Grade 3 Test D introduces tonality as a listening question. Major keys sound bright and stable; minor keys darker and more tense — and the difference comes down to one key semitone: the 3rd.",
          what: "<p>The <b>3rd of the scale</b> is the giveaway: a major 3rd (4 semitones) sounds open and settled; a minor 3rd (3 semitones) sounds darker. Listen also for the 6th and 7th degrees — minor keys have lowered versions of these too.</p>",
          questions: g3TonalityQuestion,
          tags: ["aural"],
        },
        {
          id: "g3-aural-features",
          title: "Aural: musical features",
          why: "Grade 3 Test D continues asking about dynamics, tempo, and articulation — now with tonality added. Developing quick recognition of all these saves thinking time in the exam.",
          what: "<p>Focus on one element at a time as you listen. On a first hearing you might catch dynamics and articulation; a second play can confirm tonality and tempo.</p>",
          questions: g3AuralQuestion,
          tags: ["aural"],
        },
        {
          id: "g3-aural-sing",
          title: "Aural: echo singing (within octave)",
          why: "Grade 3 echo-singing (Test B) presents three different phrases in turn, each within one octave. The phrases may be in major or minor and use mostly stepwise motion with occasional leaps no larger than a third.",
          what: "<p>Before singing, hum the first note internally. Stepwise phrases are easiest to echo — start on the first note and think through each step. If you miss a note, keep going rather than stopping.</p>",
          questions: g3EchoMelodyQuestion,
          tags: ["aural"],
        },
      ],
    },
    {
      grade: 4,
      topics: [
        {
          id: "g4-aural-time",
          title: "Aural: time signature & rhythm",
          why: "Grade 4 Test C (part 2) asks you to clap back the rhythm (not just the pulse) and then identify the time signature. Distinguishing pulse from rhythm is the key skill. Since typing can't grade a clap, this app instead asks you to pick the notated pattern that matches what you heard.",
          what: "<p>The <b>pulse</b> is the steady beat underlying the music. The <b>rhythm</b> is the actual pattern of long and short notes as written — a mix of note values, not just an even beat. Compare the played rhythm against each notated option before choosing.</p>",
          questions: g4RhythmTimeSigQuestion,
          tags: ["aural"],
        },
        {
          id: "g4-aural-features",
          title: "Aural: musical character",
          why: "Grade 4 Test C (part 1) asks two questions about a piece's character and features — things like tonality, dynamics, tempo, and articulation. These are now combined questions where you describe what creates the character.",
          what: "<p>At Grade 4 you are expected to go beyond just naming 'loud' or 'staccato' and begin to describe <em>how</em> the musical feature contributes to the character. E.g.: 'the staccato notes and fast tempo make it sound playful and light.'</p>",
          questions: g4CharacterQuestion,
          tags: ["aural"],
        },
        {
          id: "g4-aural-sight-sing",
          title: "Aural: sight-sing a phrase",
          why: "Grade 4 Test B is the first sight-singing task: you sing a 5-note phrase from a printed score in C, F, or G major. The range is within a 3rd of the tonic; intervals are steps and small skips only.",
          what: "<p>Only the tonic is played for you. Look at each note's position on the staff relative to the tonic line, plan the direction (up or down) and size (step or skip) of each move, then sing all 5 notes in sequence.</p>",
          questions: g4SightSingQuestion,
          tags: ["aural"],
        },
        {
          id: "g4-aural-memory",
          title: "Aural: sing from memory",
          why: "Grade 4 Test A introduces memory singing: a melody spanning up to an octave (major or minor, up to 3 sharps or flats) is played twice, and you sing it back with no printed score.",
          what: "<p>Nothing is written down - the two hearings are all you get. During the gap, keep the tonic and the melody's overall shape (where it rose and fell) fixed in your head, then reproduce it.</p>",
          questions: g4MemorySingQuestion,
          tags: ["aural"],
        },
      ],
    },
    {
      grade: 5,
      topics: [
        {
          id: "g5-aural-time",
          title: "Aural: time signature & rhythm",
          why: "Grade 5 repeats the Grade 4 clap-the-rhythm and time-signature task — by now it should be reliable, freeing attention for the new style/period question below.",
          what: "<p>Same task as Grade 4: identify whether an extract is in 2, 3, or 4 time by ear. Aim for near-instant recognition so it doesn't cost you thinking time elsewhere in the test.</p>",
          questions: g4RhythmTimeSigQuestion,
          tags: ["aural"],
        },
        {
          id: "g5-aural-style",
          title: "Aural: musical style & period",
          why: "Grade 5 Test C introduces style and period identification: Baroque, Classical, Romantic, or 20th century. Each period has characteristic textures, rhythms, and expressive devices.",
          what: "<p><b>Baroque</b>: steady rhythms, ornamental melodic lines (Bach, Handel). <b>Classical</b>: balanced phrases, clear dynamics (Haydn, Mozart). <b>Romantic</b>: expressive, wide dynamics, rubato (Chopin, Schumann). <b>20th century</b>: chromatic or dissonant, irregular rhythms (Bartók, Shostakovich). This app's audio examples are short, simplified mnemonics for each label, not real excerpts - the actual exam plays a full piano recording, so also listen to real repertoire from each period to train your ear properly.</p>",
          questions: g5StyleQuestion,
          tags: ["aural"],
        },
        {
          id: "g5-aural-features",
          title: "Aural: features & tonality",
          why: "Grade 5 continues all the listening-feature questions from earlier grades. Regular practice across dynamics, articulation, tempo, and tonality means you can handle any two questions the examiner chooses.",
          what: "<p>By Grade 5 you should be able to answer feature questions quickly and confidently, leaving more mental energy for the new style/period question and the sight-singing task.</p>",
          questions: (rng) => {
            const type = rng.int(0, 2);
            if (type === 0) return g3TonalityQuestion(rng);
            if (type === 1) return g1DynamicsQuestion(rng);
            return g1ArticulationQuestion(rng);
          },
          tags: ["aural"],
        },
        {
          id: "g5-aural-sight-sing",
          title: "Aural: sight-sing (wider range)",
          why: "Grade 5 Test B extends sight-singing to 6 notes, with a range up to a 5th above and 4th below the tonic. The only leap it may contain is a rising 4th from the dominant below up to the tonic.",
          what: "<p>Scan the staff for a leap before you start — if there is one, it's a rising 4th from the dominant below to the tonic (same interval as the start of 'Here Comes the Bride'), the hardest interval to hit accurately. Everything else moves by step.</p>",
          questions: g5SightSingQuestion,
          tags: ["aural"],
        },
        {
          id: "g5-aural-memory",
          title: "Aural: sing from memory",
          why: "Grade 5 Test A repeats the memory-singing task: a melody up to an octave (major or minor, up to 3 sharps or flats) played twice, sung back from memory.",
          what: "<p>Same skill as Grade 4, and worth drilling until it is automatic - fix the tonic and shape in your head during the gap between the two hearings, then sing it straight back.</p>",
          questions: g5MemorySingQuestion,
          tags: ["aural"],
        },
      ],
    },
    {
      grade: 6,
      topics: [
        {
          id: "g6-aural-time",
          title: "Aural: time signature & rhythm",
          why: "Grade 6 repeats the clap-the-rhythm and time-signature task from Grades 4-5 — still 2, 3, or 4 time, with compound time (6/8) still a grade away.",
          what: "<p>Same task as before: identify 2, 3, or 4 time by ear. This should now be close to instant.</p>",
          questions: g4RhythmTimeSigQuestion,
          tags: ["aural"],
        },
        {
          id: "g6-aural-cadence",
          title: "Aural: cadences (perfect or imperfect)",
          why: "From Grade 6 the aural test asks you to identify cadences — the two-chord harmonic 'punctuation marks' that end a phrase. Grade 6 covers the two most common: perfect and imperfect.",
          what: "<p>A <b>perfect cadence</b> (V-I) sounds final and settled — a full stop. An <b>imperfect cadence</b> (ending on V) sounds unfinished — a comma, not a full stop. Play both several times in a row until the difference in finality is obvious.</p>",
          questions: g6CadenceQuestion,
          tags: ["aural"],
        },
        {
          id: "g6-aural-features",
          title: "Aural: texture & musical features",
          why: "Grade 6 adds a texture question — is it a single line, a melody with accompaniment, or two independent lines? — alongside the dynamics, articulation, tempo, tonality, and style questions from earlier grades.",
          what: "<p><b>Texture</b> is about how many independent musical things are happening at once, not which notes are played. Listen for whether you can follow more than one moving line, or whether there's a tune sitting over a static accompaniment.</p>",
          questions: g6FeaturesQuestion,
          tags: ["aural"],
        },
        {
          id: "g6-aural-sing-echo-two-part",
          title: "Aural: echo the upper line",
          why: "From Grade 6 the echo-singing task uses a two-part texture: two lines play together and you sing back just one of them. Grade 6 asks for the upper line.",
          what: "<p>Two lines will sound at once. Focus your ear on the <b>top</b> line as it plays — it's usually easier to track since it's the highest, most prominent sound — then sing back just that line, ignoring the other.</p>",
          questions: g6EchoTwoPartQuestion,
          tags: ["aural"],
        },
        {
          id: "g6-aural-sight-sing",
          title: "Aural: sight-sing (octave range)",
          why: "Grade 6 sight-singing extends across a full octave, in a major key with up to 2 sharps or flats, with an accompaniment playing underneath in the real exam. As in Grade 5, the only leap it may contain is the rising dominant-to-tonic 4th.",
          what: "<p>Look through the whole phrase before you start — spot the highest and lowest notes and, if there's a leap, confirm it's the rising 4th from the dominant below to the tonic. Keep your own line steady even if you imagine a moving accompaniment underneath.</p>",
          questions: g6SightSingQuestion,
          tags: ["aural"],
        },
      ],
    },
    {
      grade: 7,
      topics: [
        {
          id: "g7-aural-time",
          title: "Aural: time signature (inc. 6/8)",
          why: "Grade 7 finally adds compound time (6/8) to the time-signature options — the first appearance of 6/8 in the aural test.",
          what: "<p>6/8 has two main beats, each divided into three quavers — a lilting, swinging feel, quite different from the even subdivision of 2/4 or 4/4. Count two slow beats, not six fast ones.</p>",
          questions: g7TimeSigQuestion,
          tags: ["aural"],
        },
        {
          id: "g7-aural-cadence",
          title: "Aural: cadences (+ interrupted)",
          why: "Grade 7 adds the interrupted cadence (V-vi) to perfect and imperfect — a deliberate 'surprise' where the ear expects the tonic but gets the submediant instead.",
          what: "<p>An <b>interrupted cadence</b> sets up the same expectation as a perfect cadence (a V chord about to resolve) but then resolves to <b>vi</b> instead of I — a swerve rather than the expected landing.</p>",
          questions: g7CadenceQuestion,
          tags: ["aural"],
        },
        {
          id: "g7-aural-chords",
          title: "Aural: name the cadence chords",
          why: "Grade 7 plays a cadence and asks you to name the two chords that formed it, chosen from tonic, subdominant, dominant, dominant 7th and submediant — all in root position.",
          what: "<p>Answer with Roman numerals (V-I), technical names (dominant to tonic), or letter-name chords — the exam accepts all three. Hear the bass move first (it carries the root of each chord), then check the quality above it.</p>",
          questions: g7ChordCadenceQuestion,
          tags: ["aural"],
        },
        {
          id: "g7-aural-modulation",
          title: "Aural: spot the modulation",
          why: "Grade 7 introduces modulation — a passage that changes key partway through. You're asked whether it moves to the dominant, subdominant, or relative minor.",
          what: "<p>Listen for the note that doesn't belong to the original key — that accidental is the signpost that a new key has arrived. Moving to the dominant sharpens a note; moving to the subdominant flattens one; moving to the relative minor keeps the same key signature but shifts the tonal centre.</p>",
          questions: g7ModulationQuestion,
          tags: ["aural"],
        },
        {
          id: "g7-aural-sing-echo-two-part",
          title: "Aural: echo the lower line",
          why: "Grade 7's echo-singing task is the mirror of Grade 6's: two lines play together and you sing back the lower one, which is harder to isolate since the ear naturally follows the top line.",
          what: "<p>Deliberately shift your attention to the <b>bottom</b> line as the two parts play. It helps to hum the bass line's shape internally the moment you hear it, before it fades from memory.</p>",
          questions: g7EchoTwoPartQuestion,
          tags: ["aural"],
        },
        {
          id: "g7-aural-features",
          title: "Aural: texture, structure & style",
          why: "Grade 7 keeps the full pool of feature questions — texture, tonality, dynamics, articulation, tempo, and style/period — with texture and structure now asked as distinct options rather than one combined question.",
          what: "<p>By this grade you should recognise all these features quickly enough to spend your remaining attention on the harder cadence, chord, and modulation tasks above.</p>",
          questions: g7FeaturesQuestion,
          tags: ["aural"],
        },
        {
          id: "g7-aural-sight-sing",
          title: "Aural: sight-sing the upper part",
          why: "Grade 7 sight-singing becomes genuinely two-part: you sing the upper line from a printed score while the lower line plays underneath, in a key with up to 4 sharps or flats.",
          what: "<p>The lower part moving independently underneath is the real challenge — it will pull your ear if you let it. Commit to your own line mentally before the lower part starts.</p>",
          questions: g7SightSingQuestion,
          tags: ["aural"],
        },
      ],
    },
    {
      grade: 8,
      topics: [
        {
          id: "g8-aural-features",
          title: "Aural: describe the features",
          why: "Grade 8's final feature question is fully open-ended: describe the characteristic features of a piece — texture, structure, character, style and period — rather than answering a single fixed prompt.",
          what: "<p>Run through the checklist mentally: texture (how many lines?), tonality (major or minor?), tempo and dynamics, articulation, and style/period. A confident Grade 8 answer touches more than one of these.</p>",
          questions: g8FeaturesQuestion,
          tags: ["aural"],
        },
        {
          id: "g8-aural-cadence",
          title: "Aural: cadences (+ plagal)",
          why: "Grade 8 completes the cadence ladder with the plagal cadence (IV-I) — sometimes called the 'Amen' cadence — alongside perfect, imperfect, and interrupted.",
          what: "<p>A <b>plagal cadence</b> also lands on the tonic like a perfect cadence, but arrives from IV rather than V, giving a softer, more devotional close (think of the 'Amen' at the end of a hymn) rather than the strong pull of V-I.</p>",
          questions: g8CadenceQuestion,
          tags: ["aural"],
        },
        {
          id: "g8-aural-chords",
          title: "Aural: name the cadential chords",
          why: "Grade 8 plays a three-chord cadential progression - an approach chord plus the two cadence chords - and asks you to name all three, drawn from the tonic, supertonic, subdominant, dominant and submediant.",
          what: "<p>Answer with Roman numerals, technical names or letter-name chords. Hear the bass to fix each root, then identify the cadence at the end (the last two chords) and work back to the approach chord.</p>",
          questions: g8ChordProgressionQuestion,
          tags: ["aural"],
        },
        {
          id: "g8-aural-modulation",
          title: "Aural: spot the modulation",
          why: "Grade 8 presents two passages: one starting in a major key and one starting in a minor key. From minor, the relative major and the dominant are the commonest destinations.",
          what: "<p>For a major-key start, find the accidental that doesn't belong and let it name the new key. For a minor-key start, listen for the brightening onto the relative major, or the sharpened leading note that signals a move to the dominant.</p>",
          questions: g8ModulationQuestion,
          tags: ["aural"],
        },
        {
          id: "g8-aural-sing-echo-three-part",
          title: "Aural: echo the lowest line",
          why: "Grade 8's echo-singing task adds a third simultaneous line: three parts play together and you sing back only the lowest one — the hardest line to isolate by ear.",
          what: "<p>With three lines sounding at once, deliberately listen \"underneath\" the texture rather than following the top line, which will otherwise dominate your attention. Anchor on the bass line's rhythm as much as its pitch.</p>",
          questions: g8EchoThreePartQuestion,
          tags: ["aural"],
        },
        {
          id: "g8-aural-sight-sing",
          title: "Aural: sight-sing the lower part",
          why: "Grade 8 sight-singing mirrors Grade 7: you now sing the lower part of a two-part phrase while the upper part plays above, still up to 4 sharps or flats.",
          what: "<p>Singing the lower part while a higher, more attention-grabbing line plays above is a different skill from Grade 7's task — practise trusting your own line rather than drifting up toward the one you can hear more clearly.</p>",
          questions: g8SightSingQuestion,
          tags: ["aural"],
        },
      ],
    },
  ];

  // Store aural topics separately so they don't appear in regular theory quiz
  // sessions. The dedicated Aural view accesses MTT.content.auralGrades directly.
  global.MTT.content.auralGrades = auralTopics.map(function (ag) {
    return { grade: ag.grade, title: "Grade " + ag.grade, topics: ag.topics };
  });

})(typeof globalThis !== "undefined" ? globalThis : this);
