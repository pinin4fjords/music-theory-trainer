/* aural-content.js - grade aural trainer topics, Grades 1-5.
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
 *   Grade 2: time sig inc. 6/8, echo sing, pitch or rhythm change, dynamics/tempo/articulation
 *   Grade 3: 2/3/4 time, echo sing, spot change longer phrase, tonality/dynamics/tempo
 *   Grade 4: echo 4-bar, sight-sing 5 notes, features + time sig
 *   Grade 5: echo 4-bar, sight-sing 6 notes, features + style/period
 */
(function (global) {
  "use strict";

  function audio() {
    const piano = global.MTT.audioPiano;
    return (piano && piano.isReady()) ? piano : global.MTT.audio;
  }

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
  function makeSequenceTargets(midiNotes) {
    return midiNotes.map(function (midi) {
      return { midi: midi, name: midiName(midi), staffHtml: noteStaff(midi) };
    });
  }

  // --- Musical constants ---------------------------------------------------

  const MIDI = {
    C3: 48, D3: 50, E3: 52, F3: 53, G3: 55, A3: 57, B3: 59,
    C4: 60, D4: 62, E4: 64, F4: 65, G4: 67, A4: 69, B4: 71,
    C5: 72, D5: 74, E5: 76, F5: 77, G5: 79, A5: 81, B5: 83,
  };

  // NOTE_NAMES indexed by semitone 0-11.
  const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
  function midiName(midi) {
    const octave = Math.floor(midi / 12) - 1;
    return NOTE_NAMES[((midi % 12) + 12) % 12] + octave;
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
  // Play a metrically clear "click track" to establish the pulse.
  // Strong beat: MIDI 76 (E5, bright/high), weak beat: MIDI 64 (E4, muted/low).
  // Playing 3 bars makes the pattern unmistakable.
  function meterNotes(beatsPerBar, bars) {
    bars = bars || 3;
    const notes = [];
    for (let b = 0; b < bars; b++) {
      for (let beat = 0; beat < beatsPerBar; beat++) {
        notes.push(beat === 0 ? MIDI.E5 : MIDI.E4);
      }
    }
    return notes;
  }

  // --- Melodic fragment helpers -------------------------------------------

  // 4-note ascending/descending patterns in C major.
  const MELODY_FRAGMENTS = [
    [MIDI.C4, MIDI.D4, MIDI.E4, MIDI.F4],
    [MIDI.G4, MIDI.F4, MIDI.E4, MIDI.D4],
    [MIDI.E4, MIDI.F4, MIDI.G4, MIDI.E4],
    [MIDI.C4, MIDI.E4, MIDI.G4, MIDI.E4],
    [MIDI.D4, MIDI.E4, MIDI.F4, MIDI.G4],
    [MIDI.G4, MIDI.E4, MIDI.D4, MIDI.C4],
  ];

  // Grade 1 echo phrases: 3 notes, steps only, C major, range C4-E4.
  const G1_ECHO_PHRASES = [
    [MIDI.C4, MIDI.D4, MIDI.C4],
    [MIDI.E4, MIDI.D4, MIDI.C4],
    [MIDI.C4, MIDI.D4, MIDI.E4],
    [MIDI.C4, MIDI.E4, MIDI.D4],
    [MIDI.D4, MIDI.E4, MIDI.D4],
    [MIDI.E4, MIDI.D4, MIDI.E4],
  ];

  // Grade 2 echo phrases: 4 notes, steps + minor 3rd, major or minor.
  const G2_ECHO_PHRASES_MAJOR = [
    [MIDI.C4, MIDI.D4, MIDI.E4, MIDI.C4],
    [MIDI.C4, MIDI.E4, MIDI.D4, MIDI.C4],
    [MIDI.E4, MIDI.D4, MIDI.C4, MIDI.D4],
    [MIDI.C4, MIDI.D4, MIDI.E4, MIDI.D4],
    [MIDI.G4, MIDI.E4, MIDI.D4, MIDI.C4],
  ];
  const G2_ECHO_PHRASES_MINOR = [
    [MIDI.C4, MIDI.D4, 63, MIDI.C4],   // C D Eb C
    [63, MIDI.D4, MIDI.C4, MIDI.D4],   // Eb D C D
    [MIDI.C4, 63, MIDI.D4, MIDI.C4],   // C Eb D C
    [MIDI.C4, MIDI.D4, 63, MIDI.D4],   // C D Eb D
  ];

  // Grade 3 echo phrases: 4 notes, steps + occasional 3rd, range within a full
  // octave (C4-C5) rather than Grade 2's tonic-to-dominant range.
  const G3_ECHO_PHRASES_MAJOR = [
    [MIDI.C4, MIDI.E4, MIDI.D4, MIDI.C4],
    [MIDI.E4, MIDI.G4, MIDI.F4, MIDI.E4],
    [MIDI.G4, MIDI.A4, MIDI.G4, MIDI.E4],
    [MIDI.C5, MIDI.B4, MIDI.G4, MIDI.E4],
    [MIDI.A4, MIDI.G4, MIDI.E4, MIDI.C4],
    [MIDI.C4, MIDI.D4, MIDI.E4, MIDI.G4],
    [MIDI.G4, MIDI.E4, MIDI.C4, MIDI.D4],
  ];
  const G3_ECHO_PHRASES_MINOR = [
    [MIDI.C4, 63, MIDI.D4, MIDI.C4],          // C Eb D C
    [63, MIDI.F4, MIDI.G4, 63],               // Eb F G Eb
    [MIDI.G4, MIDI.F4, 63, MIDI.D4],          // G F Eb D
    [MIDI.C5, 70, MIDI.G4, 63],                // C' Bb G Eb
    [68, MIDI.G4, 63, MIDI.D4],               // Ab G Eb D
    [MIDI.C4, MIDI.D4, 63, MIDI.F4],          // C D Eb F
  ];

  // Grade 4 sight-sing phrases: 5 notes, starts on tonic, 3rd below/above, C/F/G major.
  const G4_SIGHT_PHRASES = [
    { root: MIDI.C4, name: "C major", phrases: [
      [MIDI.C4, MIDI.D4, MIDI.E4, MIDI.D4, MIDI.C4],
      [MIDI.C4, MIDI.B3, MIDI.A3, MIDI.B3, MIDI.C4],
      [MIDI.E4, MIDI.D4, MIDI.C4, MIDI.B3, MIDI.C4],
      [MIDI.C4, MIDI.D4, MIDI.C4, MIDI.B3, MIDI.C4],
    ]},
    { root: 65, name: "F major", phrases: [
      [65, 67, MIDI.A4, 67, 65],           // F G A G F
      [65, MIDI.E4, MIDI.D4, MIDI.E4, 65], // F E D E F
      [MIDI.A4, 67, 65, MIDI.E4, 65],      // A G F E F
      [65, 67, 65, MIDI.E4, 65],           // F G F E F
    ]},
    { root: MIDI.G4, name: "G major", phrases: [
      [MIDI.G4, MIDI.A4, MIDI.B4, MIDI.A4, MIDI.G4],
      [MIDI.G4, 66, MIDI.E4, 66, MIDI.G4],          // G F# E F# G
      [MIDI.B4, MIDI.A4, MIDI.G4, 66, MIDI.G4],     // B A G F# G
      [MIDI.G4, MIDI.A4, MIDI.G4, 66, MIDI.G4],     // G A G F# G
    ]},
  ];

  // Grade 5 sight-sing phrases: 6 notes, wider range (5th above, 4th below), one 4th leap allowed.
  const G5_SIGHT_PHRASES = [
    { root: MIDI.C4, name: "C major", phrases: [
      [MIDI.C4, MIDI.D4, 65, MIDI.E4, MIDI.D4, MIDI.C4],     // C D F E D C (4th leap C→F)
      [MIDI.G4, MIDI.E4, MIDI.D4, MIDI.C4, MIDI.B3, MIDI.C4], // G E D C B C (from 5th above)
      [MIDI.C4, MIDI.E4, 65, MIDI.G4, MIDI.E4, MIDI.C4],      // C E F G E C (to 5th above)
      [MIDI.C4, MIDI.B3, MIDI.A3, MIDI.G3, MIDI.A3, MIDI.C4], // C B A G A C (4th below)
    ]},
    { root: 65, name: "F major", phrases: [
      [65, 67, MIDI.A4, 72, MIDI.A4, 65],                         // F G A C' A F (octave leap)
      [65, MIDI.E4, MIDI.D4, MIDI.C4, MIDI.D4, 65],               // F E D C D F
      [72, MIDI.A4, 67, 65, 67, MIDI.A4],                         // C' A G F G A (from above)
    ]},
    { root: MIDI.G4, name: "G major", phrases: [
      [MIDI.G4, MIDI.A4, MIDI.B4, MIDI.D5, MIDI.B4, MIDI.G4],  // G A B D' B G (4th B→D)
      [MIDI.G4, 66, MIDI.E4, MIDI.D4, MIDI.E4, MIDI.G4],        // G F# E D E G
    ]},
  ];

  // Create a modified copy with one note changed (up a tone = +2 semitones).
  function modifyNote(notes, idx) {
    const out = notes.slice();
    out[idx] = out[idx] + 2;
    return out;
  }

  // =========================================================================
  // Grade 1 generators
  // =========================================================================

  // Test 1A: Identify 2 vs 3 time.
  function g1TimeSigQuestion(rng) {
    const beats = pick(rng, [2, 3]);
    const label = String(beats);
    const notes = meterNotes(beats);
    return {
      prompt: `Listen to this rhythmic pattern — notice which beat sounds <strong>stronger</strong>. How many beats are in each bar?`,
      audio: function () { audio().sequence(notes, 0.5, 0.12); },
      choices: choices(rng, label, ["2", "3", "4"], 2),
      answer: label,
      explanation: `That was in <b>${beats}/4</b> time — ${beats} beats per bar. The first beat of each bar has a stronger accent. Tap along and count: "ONE two, ONE two" for 2, or "ONE two three" for 3.`,
    };
  }

  // Test 1C: Spot where the pitch change is (beginning or end).
  function g1SpotChangeQuestion(rng) {
    const frag = pick(rng, MELODY_FRAGMENTS);
    const pos = rng.bool() ? "beginning" : "end";
    const changeIdx = pos === "beginning" ? 0 : frag.length - 1;
    const original = frag.slice();
    const modified = modifyNote(frag, changeIdx);
    return {
      prompt: `Listen to this short phrase played <strong>twice</strong>. One note is <strong>different</strong> the second time. Where is the change?`,
      audio: function () { audio().sequencePair(original, modified, 0.5, 0.45); },
      choices: choices(rng, "At the " + pos, ["At the beginning", "At the end"], 2),
      answer: "At the " + pos,
      explanation: `The change was <b>at the ${pos}</b>. Compare the ${pos === "beginning" ? "first" : "last"} note of each playing — the second time, that note was a step higher.`,
    };
  }

  // Test 1D: Identify dynamics (loud / quiet).
  function g1DynamicsQuestion(rng) {
    const isDynamic = rng.bool();
    if (isDynamic) {
      // Crescendo (getting louder) vs diminuendo (getting quieter): use same melody,
      // first softly then loudly (or vice versa), ask which direction.
      const isGrow = rng.bool();
      const notes = [MIDI.C4, MIDI.D4, MIDI.E4, MIDI.F4, MIDI.G4];
      const ans = isGrow ? "Getting louder (crescendo)" : "Getting quieter (diminuendo)";
      return {
        prompt: `Listen — does this music get <strong>louder</strong> or <strong>quieter</strong>?`,
        audio: isGrow
          ? function () {
            audio().sequenceAt(notes, 0.15, 0.5, 0.45);
            setTimeout(function () { audio().sequenceAt(notes, 0.7, 0.5, 0.45); }, notes.length * 500 + 400);
          }
          : function () {
            audio().sequenceAt(notes, 0.7, 0.5, 0.45);
            setTimeout(function () { audio().sequenceAt(notes, 0.15, 0.5, 0.45); }, notes.length * 500 + 400);
          },
        choices: choices(rng, ans, ["Getting louder (crescendo)", "Getting quieter (diminuendo)"], 2),
        answer: ans,
        explanation: `That was a <b>${isGrow ? "crescendo" : "diminuendo"}</b> — the music was ${isGrow ? "getting louder (marked <em>cresc.</em> in the score)" : "getting quieter (marked <em>dim.</em> or <em>decresc.</em>)"}.`,
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
  function g1EchoMelodyQuestion(rng) {
    const phrase = pick(rng, G1_ECHO_PHRASES);
    const step = 0.55, dur = 0.5;
    // playback duration + 350 ms buffer before mic opens
    const autoPlayAndRespondMs = Math.round(((phrase.length - 1) * step + dur) * 1000 + 350);
    return {
      prompt: `Listen to this short phrase, then <strong>sing it back</strong>.${sequenceStaff(phrase)}`,
      audio: function () { audio().sequence(phrase, step, dur); },
      micTask: {
        type: "sequence",
        targets: makeSequenceTargets(phrase),
        autoPlayAndRespondMs: autoPlayAndRespondMs,
        toleranceSemitones: 1.0,
      },
      choices: ["I sang the phrase", "I couldn't match it"],
      answer: "I sang the phrase",
      explanation: `Grade 1 echo singing: the examiner plays a short phrase and you sing it back immediately. Focus on the contour — whether each note goes up, stays the same, or goes down.`,
    };
  }

  // =========================================================================
  // Grade 2 generators
  // =========================================================================

  // Test 2C: Identify pitch vs rhythm change AND beginning vs end.
  function g2ChangeTypeQuestion(rng) {
    const isPitch = rng.bool();
    const pos = rng.bool() ? "beginning" : "end";
    const frag = pick(rng, MELODY_FRAGMENTS);
    const changeIdx = pos === "beginning" ? 0 : frag.length - 1;
    let modified;
    if (isPitch) {
      modified = modifyNote(frag, changeIdx);
    } else {
      // Rhythm change: shorten note (played staccato-style at 0.08 vs 0.45)
      modified = frag.slice(); // notes same, but indicate via explanation
    }
    const changeType = isPitch ? "A pitch (note) change" : "A rhythm change";
    const ans = changeType;
    if (!isPitch) {
      // For rhythm change, play modified with very short note duration at change position.
      return {
        prompt: `Listen to this phrase played <strong>twice</strong>. One thing is <strong>different</strong> the second time — is it the <em>pitch</em> (which note) or the <em>rhythm</em> (how long)?`,
        audio: function () {
          const stepMs = 500;
          const durLong = 0.45;
          const durShort = 0.08;
          const a = audio();
          // First: normal phrase.
          a.sequence(frag, stepMs / 1000, durLong);
          // Second: one note has shortened duration — use same MIDI notes, different dur.
          // Approximate by playing two segments: before change + short + after.
          const delay = (frag.length * stepMs + stepMs);
          setTimeout(function () {
            const before = frag.slice(0, changeIdx);
            const after = frag.slice(changeIdx + 1);
            const c = a.ensure();
            if (!c) return;
            // Manually schedule using freqSequence can't do this, so we use sequence twice.
            // This is a reasonable approximation: the changed note plays later.
            if (before.length) a.sequence(before, stepMs / 1000, durLong);
            setTimeout(function () {
              a.note(frag[changeIdx], durShort);
              setTimeout(function () {
                if (after.length) a.sequence(after, stepMs / 1000, durLong);
              }, stepMs);
            }, before.length * stepMs);
          }, delay);
        },
        choices: choices(rng, ans, ["A pitch (note) change", "A rhythm change"], 2),
        answer: ans,
        explanation: `The change was in the <b>rhythm</b> — one note had a different length the second time. Listen for whether a note is longer or shorter, not whether it's higher or lower.`,
      };
    }
    return {
      prompt: `Listen to this phrase played <strong>twice</strong>. One thing is <strong>different</strong> the second time — is it the <em>pitch</em> or the <em>rhythm</em>?`,
      audio: function () { audio().sequencePair(frag, modified, 0.5, 0.45); },
      choices: choices(rng, ans, ["A pitch (note) change", "A rhythm change"], 2),
      answer: ans,
      explanation: `The change was in the <b>pitch</b> — one note moved to a different step the second time. Listen for whether any notes sound higher or lower, not shorter or longer.`,
    };
  }

  // Tempo question: is the piece speeding up, slowing down, or staying the same?
  function g2TempoQuestion(rng) {
    const options = [
      { type: "accelerando", label: "Getting faster", play: function () {
        const notes = [MIDI.C4, MIDI.D4, MIDI.E4, MIDI.F4, MIDI.G4, MIDI.A4];
        // Play at slow step then faster step to simulate accel.
        audio().sequence(notes.slice(0, 3), 0.7, 0.65);
        setTimeout(function () { audio().sequence(notes.slice(3), 0.3, 0.28); }, 3 * 700 + 400);
      }},
      { type: "ritardando", label: "Getting slower", play: function () {
        const notes = [MIDI.C4, MIDI.D4, MIDI.E4, MIDI.F4, MIDI.G4, MIDI.A4];
        audio().sequence(notes.slice(0, 3), 0.3, 0.28);
        setTimeout(function () { audio().sequence(notes.slice(3), 0.7, 0.65); }, 3 * 300 + 400);
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

  // Grade 2 echo melody: 4 notes, major or minor key, range up to dominant.
  // Phrase plays once, then mic opens automatically for an immediate response.
  function g2EchoMelodyQuestion(rng) {
    const isMajor = rng.bool();
    const phrases = isMajor ? G2_ECHO_PHRASES_MAJOR : G2_ECHO_PHRASES_MINOR;
    const phrase = pick(rng, phrases);
    const keyLabel = isMajor ? "major" : "minor";
    const step = 0.52, dur = 0.48;
    const autoPlayAndRespondMs = Math.round(((phrase.length - 1) * step + dur) * 1000 + 350);
    return {
      prompt: `Listen to this ${keyLabel}-key phrase, then <strong>sing it back</strong>.${sequenceStaff(phrase)}`,
      audio: function () { audio().sequence(phrase, step, dur); },
      micTask: {
        type: "sequence",
        targets: makeSequenceTargets(phrase),
        autoPlayAndRespondMs: autoPlayAndRespondMs,
        toleranceSemitones: 1.0,
      },
      choices: ["I sang the phrase", "I couldn't match it"],
      answer: "I sang the phrase",
      explanation: `Grade 2 echo singing: phrases can be in major or minor keys and extend up to the 5th. The lowered 3rd note in minor phrases is the key difference — it gives the darker, more unsettled feeling.`,
    };
  }

  // Grade 3 echo melody: 4 notes, major or minor, range within a full octave.
  function g3EchoMelodyQuestion(rng) {
    const isMajor = rng.bool();
    const phrases = isMajor ? G3_ECHO_PHRASES_MAJOR : G3_ECHO_PHRASES_MINOR;
    const phrase = pick(rng, phrases);
    const keyLabel = isMajor ? "major" : "minor";
    const step = 0.5, dur = 0.46;
    const autoPlayAndRespondMs = Math.round(((phrase.length - 1) * step + dur) * 1000 + 350);
    return {
      prompt: `Listen to this ${keyLabel}-key phrase, then <strong>sing it back</strong>.${sequenceStaff(phrase)}`,
      audio: function () { audio().sequence(phrase, step, dur); },
      micTask: {
        type: "sequence",
        targets: makeSequenceTargets(phrase),
        autoPlayAndRespondMs: autoPlayAndRespondMs,
        toleranceSemitones: 1.0,
      },
      choices: ["I sang the phrase", "I couldn't match it"],
      answer: "I sang the phrase",
      explanation: `Grade 3 echo singing: phrases stay within a single octave and can be in major or minor. Mostly stepwise motion with the occasional leap of a 3rd — hum the shape internally before you sing.`,
    };
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
    const notes = meterNotes(opt.beats);
    const label = String(opt.beats);
    const expl = {
      "2/4": "2/4 has two crotchet beats — a march feel.",
      "3/4": "3/4 has three crotchet beats — a waltz feel.",
      "4/4": "4/4 (common time) has four crotchet beats. Beats 1 and 3 are stronger, beat 1 strongest. Compare: march feels in 4, waltz in 3.",
    };
    return {
      prompt: `Listen to this rhythmic pattern. How many <strong>beats</strong> are in each bar?`,
      audio: function () { audio().sequence(notes, 0.5, 0.12); },
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
    if (type === 1) return g1SpotChangeQuestion(rng);
    if (type === 2) return g3TonalityQuestion(rng);
    if (type === 3) return g1DynamicsQuestion(rng);
    return g1ArticulationQuestion(rng);
  }

  // =========================================================================
  // Grade 4 generators
  // =========================================================================

  // Test 4B: Sight-sing a 5-note phrase from a printed score.
  // Only tonic is played (for pitch reference). Student reads and sings in sequence.
  function g4SightSingQuestion(rng) {
    const keyDef = pick(rng, G4_SIGHT_PHRASES);
    const phrase = pick(rng, keyDef.phrases);
    return {
      prompt: `Listen to the tonic of <b>${keyDef.name}</b>, then <strong>sing each note</strong> shown in order. Start when you\'re ready.${sequenceStaff(phrase)}`,
      audio: function () { audio().note(keyDef.root, 1.2); },
      micTask: {
        type: "sequence",
        targets: makeSequenceTargets(phrase),
        toleranceSemitones: 1.0,
        minHoldMs: 500,
      },
      choices: ["I sang the phrase", "I couldn't manage it"],
      answer: "I sang the phrase",
      explanation: `Grade 4 sight-singing: 5 notes in C, F, or G major, within a 3rd of the tonic. Steps and small skips only. Only the tonic is given — work out each note\'s position relative to the tonic you heard.`,
    };
  }

  // Test 4C part 2: Identify time signature after listening (2/4, 3/4, or 4/4).
  function g4RhythmTimeSigQuestion(rng) {
    return g3TimeSigQuestion(rng);
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

  // Grade 5 sight-singing: 6-note phrase, wider range (5th above, 4th below), one 4th leap.
  function g5SightSingQuestion(rng) {
    const keyDef = pick(rng, G5_SIGHT_PHRASES);
    const phrase = pick(rng, keyDef.phrases);
    return {
      prompt: `Listen to the tonic of <b>${keyDef.name}</b>, then <strong>sing each note</strong> shown in order. Take a moment to look before starting.${sequenceStaff(phrase)}`,
      audio: function () { audio().note(keyDef.root, 1.2); },
      micTask: {
        type: "sequence",
        targets: makeSequenceTargets(phrase),
        toleranceSemitones: 1.0,
        minHoldMs: 500,
      },
      choices: ["I sang the phrase", "I couldn't manage it"],
      answer: "I sang the phrase",
      explanation: `Grade 5 sight-singing: 6 notes, range up to a 5th above and 4th below tonic, one leap of a 4th allowed. Plan the biggest interval (the 4th leap) before you start singing — the rest will usually be steps.`,
    };
  }

  // =========================================================================
  // Grade 6-8 shared harmony helpers
  // =========================================================================
  // Grades 6-8 add cadences, chord progressions, modulation and two/three-part
  // textures. All of it is built in C major so a small, fixed set of chords and
  // a diatonic-scale lookup (for "a third below") can cover every generator
  // below without a full harmony engine.

  // Every C-major diatonic note from C2 to C7, ascending — used to find "the
  // diatonic note two scale-steps below X" (i.e. a 3rd below) for harmonizing
  // a given line, at any octave.
  const C_MAJOR_SCALE = (function () {
    const steps = [0, 2, 4, 5, 7, 9, 11];
    const out = [];
    for (let oct = 24; oct <= 96; oct += 12) steps.forEach((s) => out.push(oct + s));
    return out;
  })();
  function thirdBelow(midi) {
    const idx = C_MAJOR_SCALE.indexOf(midi);
    if (idx < 2) return midi - 3;
    return C_MAJOR_SCALE[idx - 2];
  }

  const CHORDS_C = {
    I: [MIDI.C4, MIDI.E4, MIDI.G4],
    ii: [MIDI.D4, MIDI.F4, MIDI.A4],
    IV: [65, MIDI.A4, 72],
    V: [MIDI.G4, MIDI.B4, MIDI.D5],
    vi: [MIDI.A4, MIDI.C5, MIDI.E5],
  };

  const CADENCES = [
    { type: "perfect", label: "Perfect cadence (V-I)", chords: [CHORDS_C.V, CHORDS_C.I],
      explanation: `A <b>perfect cadence</b> (V-I) — the dominant resolving to the tonic. It's the strongest, most final-sounding close in tonal music.` },
    { type: "imperfect", label: "Imperfect cadence (ending on V)", chords: [CHORDS_C.I, CHORDS_C.V],
      explanation: `An <b>imperfect cadence</b> (ending on V) — it sounds unfinished, like a question rather than an answer.` },
    { type: "interrupted", label: "Interrupted cadence (V-vi)", chords: [CHORDS_C.V, CHORDS_C.vi],
      explanation: `An <b>interrupted cadence</b> (V-vi) — the ear expects the tonic after V, but gets vi instead. A "surprise" resolution.` },
    { type: "plagal", label: "Plagal cadence (IV-I)", chords: [CHORDS_C.IV, CHORDS_C.I],
      explanation: `A <b>plagal cadence</b> (IV-I) — sometimes called the "Amen" cadence from its use at the end of hymns.` },
  ];

  function playCadence(chordPair) {
    return function () {
      const a = audio();
      a.chord(chordPair[0], 0.9);
      setTimeout(function () { a.chord(chordPair[1], 1.1); }, 950);
    };
  }

  // Shared cadence-ID generator: pick from the first `count` cadence types
  // (perfect/imperfect at Grade 6, +interrupted at 7, +plagal at 8).
  function cadenceQuestion(rng, count) {
    const pool = CADENCES.slice(0, count);
    const c = pick(rng, pool);
    return {
      prompt: `Listen to this two-chord cadence. Which type is it?`,
      audio: playCadence(c.chords),
      choices: choices(rng, c.label, pool.map((x) => x.label), count),
      answer: c.label,
      explanation: c.explanation,
    };
  }

  const CHORD_PROGRESSIONS = [
    { label: "I - IV - V", chords: [CHORDS_C.I, CHORDS_C.IV, CHORDS_C.V] },
    { label: "I - V - vi", chords: [CHORDS_C.I, CHORDS_C.V, CHORDS_C.vi] },
    { label: "I - ii - V", chords: [CHORDS_C.I, CHORDS_C.ii, CHORDS_C.V] },
    { label: "vi - IV - V", chords: [CHORDS_C.vi, CHORDS_C.IV, CHORDS_C.V] },
    { label: "I - IV - I", chords: [CHORDS_C.I, CHORDS_C.IV, CHORDS_C.I] },
  ];

  function playChordSequence(chordSeq) {
    return function () {
      const a = audio();
      chordSeq.forEach(function (ch, i) { setTimeout(function () { a.chord(ch, 1.0); }, i * 950); });
    };
  }

  // Shared chord-progression-ID generator: pick from the first `count` progressions.
  function chordProgressionQuestion(rng, count) {
    const pool = CHORD_PROGRESSIONS.slice(0, count);
    const p = pick(rng, pool);
    return {
      prompt: `Listen to this chord progression. Which chords are they, in order?`,
      audio: playChordSequence(p.chords),
      choices: choices(rng, p.label, pool.map((x) => x.label), Math.min(4, count)),
      answer: p.label,
      explanation: `That was <b>${p.label}</b>. Naming chords by their scale-degree number (I, IV, V...) works in any key — I is built on the tonic, IV on the subdominant, V on the dominant, and so on.`,
    };
  }

  const MODULATIONS = [
    { label: "Modulates to the dominant", accidentalNote: "F♯", play: function () {
      const a = audio();
      a.sequence([MIDI.C4, MIDI.E4, MIDI.G4, MIDI.C5], 0.42, 0.4);
      setTimeout(function () { a.sequence([66, MIDI.G4, MIDI.B4, MIDI.D5, MIDI.G4], 0.42, 0.4); }, 1900);
    } },
    { label: "Modulates to the subdominant", accidentalNote: "B♭", play: function () {
      const a = audio();
      a.sequence([MIDI.C4, MIDI.E4, MIDI.G4, MIDI.C5], 0.42, 0.4);
      setTimeout(function () { a.sequence([70, 69, 65, 69, 72], 0.42, 0.4); }, 1900);
    } },
    { label: "Modulates to the relative minor", accidentalNote: "G♯ (leading note of A minor)", play: function () {
      const a = audio();
      a.sequence([MIDI.C4, MIDI.E4, MIDI.G4, MIDI.C5], 0.42, 0.4);
      setTimeout(function () { a.sequence([68, MIDI.A4, MIDI.E4, MIDI.A4, MIDI.C5], 0.42, 0.4); }, 1900);
    } },
  ];

  function modulationQuestion(rng) {
    const m = pick(rng, MODULATIONS);
    return {
      prompt: `Listen — this passage starts in C major, then <strong>modulates</strong> (changes key). Where does it move to?`,
      audio: m.play,
      choices: choices(rng, m.label, MODULATIONS.map((x) => x.label), 3),
      answer: m.label,
      explanation: `${m.label} — listen for <b>${m.accidentalNote}</b>, the note that signals the new key has arrived. Modulation to the dominant, subdominant, or relative minor are the three most common moves from a major key.`,
    };
  }

  // Two-part phrases for the Grade 6-7 two-part echo task: a top line plus a
  // 3rd-below harmony line, played together. Grade 6 echoes the top line,
  // Grade 7 echoes the bottom line — same material, different target.
  const TWO_PART_PHRASES = [
    { top: [MIDI.C4, MIDI.D4, MIDI.E4, MIDI.C4] },
    { top: [MIDI.E4, MIDI.D4, MIDI.C4, MIDI.D4] },
    { top: [MIDI.G4, MIDI.F4, MIDI.E4, MIDI.D4] },
    { top: [MIDI.C4, MIDI.E4, MIDI.D4, MIDI.C4] },
    { top: [MIDI.F4, MIDI.E4, MIDI.D4, MIDI.C4] },
    { top: [MIDI.G4, MIDI.E4, MIDI.F4, MIDI.D4] },
  ].map(function (p) { return { top: p.top, bottom: p.top.map(thirdBelow) }; });

  function twoPartAudio(top, bottom, step, dur) {
    return function () {
      const a = audio();
      a.sequence(top, step, dur);
      a.sequence(bottom, step, dur);
    };
  }

  // Shared two-part echo generator: `voice` selects which line the student
  // must sing back — the other plays purely as harmonic context.
  function twoPartEchoQuestion(rng, voice, gradeLabel) {
    const set = pick(rng, TWO_PART_PHRASES);
    const target = set[voice];
    const step = 0.55, dur = 0.5;
    const autoPlayAndRespondMs = Math.round(((target.length - 1) * step + dur) * 1000 + 350);
    const which = voice === "top" ? "upper" : "lower";
    return {
      prompt: `Listen to this two-part phrase, then sing back <strong>just the ${which} line</strong>.${sequenceStaff(target)}`,
      audio: twoPartAudio(set.top, set.bottom, step, dur),
      micTask: {
        type: "sequence",
        targets: makeSequenceTargets(target),
        autoPlayAndRespondMs: autoPlayAndRespondMs,
        toleranceSemitones: 1.0,
      },
      choices: ["I sang the " + which + " line", "I couldn't match it"],
      answer: "I sang the " + which + " line",
      explanation: `${gradeLabel} echo singing: two lines play together and you sing back only the <b>${which}</b> one, ignoring the other. Listen once through for the whole texture, then lock onto your line before it starts.`,
    };
  }

  // Three-part phrases for the Grade 8 echo task: top line, a 3rd below, and a
  // 3rd below that again — student echoes the lowest (bass) line.
  const THREE_PART_PHRASES = TWO_PART_PHRASES.map(function (p) {
    return { top: p.top, mid: p.bottom, bottom: p.bottom.map(thirdBelow) };
  });

  function threePartEchoQuestion(rng) {
    const set = pick(rng, THREE_PART_PHRASES);
    const step = 0.55, dur = 0.5;
    const autoPlayAndRespondMs = Math.round(((set.bottom.length - 1) * step + dur) * 1000 + 350);
    return {
      prompt: `Listen to this three-part phrase, then sing back <strong>just the lowest line</strong>.${sequenceStaff(set.bottom)}`,
      audio: function () {
        const a = audio();
        a.sequence(set.top, step, dur);
        a.sequence(set.mid, step, dur);
        a.sequence(set.bottom, step, dur);
      },
      micTask: {
        type: "sequence",
        targets: makeSequenceTargets(set.bottom),
        autoPlayAndRespondMs: autoPlayAndRespondMs,
        toleranceSemitones: 1.0,
      },
      choices: ["I sang the lowest line", "I couldn't match it"],
      answer: "I sang the lowest line",
      explanation: `Grade 8 echo singing: three lines play together and you sing back only the <b>lowest</b> one. This is the hardest line to isolate — the ear naturally follows the top, so deliberately listen "underneath" the texture.`,
    };
  }

  // Texture question (Grade 6+): single line, melody+accompaniment, or two
  // independent moving lines. The exam only ever asks the generic "texture"
  // question — these three plain-language options are how a candidate answers it.
  function textureQuestion(rng) {
    const melody = [MIDI.C4, MIDI.D4, MIDI.E4, MIDI.F4, MIDI.G4];
    const options = [
      { type: "single", label: "A single melodic line", play: function () { audio().sequence(melody, 0.42, 0.4); } },
      { type: "accompanied", label: "A melody with a sustained accompaniment", play: function () {
        const a = audio();
        a.sequence(melody, 0.42, 0.4);
        a.note(MIDI.C3, 2.3);
      } },
      { type: "twoLines", label: "Two independent moving lines", play: function () {
        const a = audio();
        a.sequence(melody, 0.42, 0.4);
        a.sequence(melody.map(thirdBelow), 0.42, 0.4);
      } },
    ];
    const opt = pick(rng, options);
    return {
      prompt: `Listen to the <strong>texture</strong> — is it a single line, a melody with accompaniment, or two independent moving lines?`,
      audio: opt.play,
      choices: choices(rng, opt.label, options.map((x) => x.label), 3),
      answer: opt.label,
      explanation: `That was <b>${opt.label.toLowerCase()}</b>. Texture questions ask how many independent things are happening at once — a bare tune, a tune over accompaniment, or several lines moving together.`,
    };
  }

  // =========================================================================
  // Grade 6 generators
  // =========================================================================

  function g6CadenceQuestion(rng) { return cadenceQuestion(rng, 2); }

  function g6FeaturesQuestion(rng) {
    if (rng.bool()) return textureQuestion(rng);
    const pool = [g3TonalityQuestion, g1DynamicsQuestion, g1ArticulationQuestion, g2TempoQuestion, g5StyleQuestion];
    return pick(rng, pool)(rng);
  }

  function g6EchoTwoPartQuestion(rng) { return twoPartEchoQuestion(rng, "top", "Grade 6"); }

  // Grade 6 sight-sing phrases: 6-7 notes, full octave range, up to 2 sharps/flats.
  const G6_SIGHT_PHRASES = G5_SIGHT_PHRASES.concat([
    { root: 62, name: "D major", phrases: [
      [62, 64, 66, 69, 66, 64, 62],   // D E F# A F# E D
      [69, 66, 64, 62, 61, 62, 69],   // A F# E D C# D A (leading tone C#)
      [62, 66, 69, 71, 69, 66, 62],   // D F# A B A F# D
    ]},
  ]);

  function g6SightSingQuestion(rng) {
    const keyDef = pick(rng, G6_SIGHT_PHRASES);
    const phrase = pick(rng, keyDef.phrases);
    return {
      prompt: `Listen to the tonic of <b>${keyDef.name}</b>, then <strong>sing each note</strong> shown in order.${sequenceStaff(phrase)}`,
      audio: function () { audio().note(keyDef.root, 1.2); },
      micTask: {
        type: "sequence",
        targets: makeSequenceTargets(phrase),
        toleranceSemitones: 1.0,
        minHoldMs: 500,
      },
      choices: ["I sang the phrase", "I couldn't manage it"],
      answer: "I sang the phrase",
      explanation: `Grade 6 sight-singing: a longer phrase within an octave, in a major key with up to 2 sharps or flats. In the real exam an accompaniment plays under you — here you get the tonic as a reference before starting.`,
    };
  }

  // =========================================================================
  // Grade 7 generators
  // =========================================================================

  // Time signature including compound time (6/8) — this is the first grade
  // where 6/8 appears in the aural test.
  function g7TimeSigQuestion(rng) {
    const options = [
      { beats: 2, label: "2", sig: "2/4", note: "2/4 has two crotchet beats (march feel)" },
      { beats: 3, label: "3", sig: "3/4", note: "3/4 has three crotchet beats (waltz feel)" },
      { beats: 4, label: "4", sig: "4/4", note: "4/4 (common time) has four crotchet beats — beats 1 and 3 are strong, beat 1 strongest" },
      { beats: 2, label: "2", sig: "6/8", note: "6/8 has two dotted-crotchet beats (two main pulses, each divided into three — a lilting, swinging feel)" },
    ];
    const opt = pick(rng, options);
    const notes = meterNotes(opt.beats);
    return {
      prompt: `Listen to this rhythmic pattern. How many <strong>main beats</strong> are in each bar? (6/8 has 2 main beats.)`,
      audio: function () { audio().sequence(notes, 0.5, 0.12); },
      choices: choices(rng, opt.label, ["2", "3", "4"], 3),
      answer: opt.label,
      explanation: `That was in <b>${opt.sig}</b> time — ${opt.note}.`,
    };
  }

  function g7CadenceQuestion(rng) { return cadenceQuestion(rng, 3); }
  function g7ChordProgressionQuestion(rng) { return chordProgressionQuestion(rng, 3); }
  function g7ModulationQuestion(rng) { return modulationQuestion(rng); }
  function g7EchoTwoPartQuestion(rng) { return twoPartEchoQuestion(rng, "bottom", "Grade 7"); }

  function g7FeaturesQuestion(rng) {
    const pool = [textureQuestion, g3TonalityQuestion, g1DynamicsQuestion, g1ArticulationQuestion, g2TempoQuestion, g5StyleQuestion];
    return pick(rng, pool)(rng);
  }

  // Grade 7 sight-sing phrases: extend G6's set with a key up to 4 sharps/flats
  // (Bb major stays within the notation engine's correctly-spelled accidentals).
  const G7_SIGHT_PHRASES = G6_SIGHT_PHRASES.concat([
    { root: 70, name: "B♭ major", phrases: [
      [70, 72, 74, 75, 74, 72, 70],   // Bb C D Eb D C Bb
      [70, 74, 77, 79, 77, 74, 70],   // Bb D F G F D Bb
      [77, 75, 74, 72, 70, 72, 77],   // F Eb D C Bb C F
    ]},
  ]);

  function g7SightSingQuestion(rng) {
    const keyDef = pick(rng, G7_SIGHT_PHRASES);
    const phrase = pick(rng, keyDef.phrases);
    const bass = phrase.map(thirdBelow);
    return {
      prompt: `Listen to the tonic of <b>${keyDef.name}</b>, then <strong>sing the upper part</strong> shown while the lower part plays underneath.${sequenceStaff(phrase)}`,
      audio: function () {
        const a = audio();
        a.note(keyDef.root, 1.0);
        setTimeout(function () { a.sequence(bass, 0.6, 0.55); }, 1100);
      },
      micTask: {
        type: "sequence",
        targets: makeSequenceTargets(phrase),
        toleranceSemitones: 1.0,
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

  function g8CadenceQuestion(rng) { return cadenceQuestion(rng, 4); }
  function g8ChordProgressionQuestion(rng) { return chordProgressionQuestion(rng, 5); }
  function g8ModulationQuestion(rng) { return modulationQuestion(rng); }
  function g8EchoThreePartQuestion(rng) { return threePartEchoQuestion(rng); }

  function g8FeaturesQuestion(rng) {
    const pool = [textureQuestion, g3TonalityQuestion, g1DynamicsQuestion, g1ArticulationQuestion, g2TempoQuestion, g5StyleQuestion];
    return pick(rng, pool)(rng);
  }

  function g8SightSingQuestion(rng) {
    const keyDef = pick(rng, G7_SIGHT_PHRASES);
    const phrase = pick(rng, keyDef.phrases);
    // A line a 6th above each target note (an octave up, then a 3rd back down).
    const upper = phrase.map(function (m) { return thirdBelow(m + 12); });
    return {
      prompt: `Listen to the tonic of <b>${keyDef.name}</b>, then <strong>sing the lower part</strong> shown while the upper part plays above.${sequenceStaff(phrase)}`,
      audio: function () {
        const a = audio();
        a.note(keyDef.root, 1.0);
        setTimeout(function () { a.sequence(upper, 0.6, 0.55); }, 1100);
      },
      micTask: {
        type: "sequence",
        targets: makeSequenceTargets(phrase),
        toleranceSemitones: 1.0,
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
          why: "In the Grade 1 aural test the examiner plays a short two-bar melody three times and you sing it back each time. The melody is simple — 3 to 4 notes using steps in C major.",
          what: "<p>Listen to the whole phrase first — notice its <b>shape</b> (going up? going down? a step or a skip?). Then sing it back note by note on a comfortable vowel like 'lah'. You can sing in any octave that suits your voice.</p><p class=\"muted\" style=\"font-size:.9em\">The mic detects each note as you hold it and advances to the next automatically.</p>",
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
          why: "Grade 2 echo-singing (Test B) introduces minor-key phrases. The 4-note melodies extend up to the dominant (5th of the scale) and can be in major or minor.",
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
          why: "Grade 3 echo-singing (Test B) phrases stay within one octave. The phrases may be in major or minor and use mostly stepwise motion with occasional leaps no larger than a third.",
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
          why: "Grade 4 Test C (part 2) asks you to clap back the rhythm (not just the pulse) and then identify the time signature. Distinguishing pulse from rhythm is the key skill.",
          what: "<p>The <b>pulse</b> is the steady beat underlying the music. The <b>rhythm</b> is the actual pattern of long and short notes as written. To clap the rhythm you need to reproduce the exact durations of each note, not just an even beat.</p>",
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
          what: "<p><b>Baroque</b>: steady rhythms, ornamental melodic lines (Bach, Handel). <b>Classical</b>: balanced phrases, clear dynamics (Haydn, Mozart). <b>Romantic</b>: expressive, wide dynamics, rubato (Chopin, Schumann). <b>20th century</b>: chromatic or dissonant, irregular rhythms (Bartók, Shostakovich).</p>",
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
          why: "Grade 5 Test B extends sight-singing to 6 notes, with a range up to a 5th above and 4th below the tonic, and one allowed leap of a perfect 4th.",
          what: "<p>Spot the 4th leap before you start — it's the hardest interval to hit accurately. Everything else will be steps. Practice the sound of a perfect 4th (same as the start of 'Here Comes the Bride') so you can leap it confidently.</p>",
          questions: g5SightSingQuestion,
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
          why: "Grade 6 sight-singing extends across a full octave, in a major key with up to 2 sharps or flats, with an accompaniment playing underneath in the real exam.",
          what: "<p>Look through the whole phrase before you start — spot the highest and lowest notes and where the biggest leaps are. Keep your own line steady even if you imagine a moving accompaniment underneath.</p>",
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
          title: "Aural: identify the chords",
          why: "Grade 7 asks you to name a short chord progression by scale-degree number (I, IV, V, vi...) — the same skill as cadence ID, extended to three chords instead of two.",
          what: "<p>Each chord is built on a degree of the scale: I on the tonic, IV on the subdominant, V on the dominant, vi on the submediant. Listen chord by chord rather than trying to hear the whole progression at once.</p>",
          questions: g7ChordProgressionQuestion,
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
          title: "Aural: identify the chords (extended)",
          why: "Grade 8 extends the chord-progression task with a wider pool of progressions, including chords built on the supertonic and submediant alongside the primary triads.",
          what: "<p>Keep naming chords by scale-degree number. The more progressions you've heard, the more each one starts to sound like a distinct, recognisable shape rather than a puzzle to work out from scratch.</p>",
          questions: g8ChordProgressionQuestion,
          tags: ["aural"],
        },
        {
          id: "g8-aural-modulation",
          title: "Aural: spot the modulation",
          why: "Grade 8 repeats the Grade 7 modulation task — identifying a move to the dominant, subdominant, or relative minor — with the real exam presenting two separate passages to test the skill twice.",
          what: "<p>Same listening strategy as Grade 7: find the accidental that doesn't belong to the starting key, and let it tell you where the music has moved to.</p>",
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
