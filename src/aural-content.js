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

  const M = global.MTT.music;
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

  // Wrap a MIDI note list in a call to audio().sequence().
  function seqFn(midiNotes, step, dur) {
    step = step || 0.42;
    dur = dur || 0.46;
    return function () { audio().sequence(midiNotes, step, dur); };
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
  // The examiner plays the phrase three times; the candidate sings it back each time.
  function g1EchoMelodyQuestion(rng) {
    const phrase = pick(rng, G1_ECHO_PHRASES);
    const step = 0.55;
    return {
      prompt: `Listen to this short phrase — it plays <strong>three times</strong>. Then <strong>sing it back</strong> note by note.${sequenceStaff(phrase)}`,
      audio: function () {
        const a = audio();
        const gap = phrase.length * step * 1000 + 700;
        a.sequence(phrase, step, 0.5);
        setTimeout(function () { a.sequence(phrase, step, 0.5); }, gap);
        setTimeout(function () { a.sequence(phrase, step, 0.5); }, gap * 2);
      },
      micTask: {
        type: "sequence",
        targets: makeSequenceTargets(phrase),
        toleranceSemitones: 1.0,
        minHoldMs: 450,
      },
      choices: ["I sang the phrase", "I couldn't match it"],
      answer: "I sang the phrase",
      explanation: `Grade 1 echo singing: the examiner plays a short 2-bar phrase three times and you sing it back. Focus on the shape — whether the melody goes up, down, or stays the same — rather than trying to name the notes.`,
    };
  }

  function g1AuralQuestion(rng) {
    const type = rng.int(0, 3);
    if (type === 0) return g1TimeSigQuestion(rng);
    if (type === 1) return g1SpotChangeQuestion(rng);
    if (type === 2) return g1DynamicsQuestion(rng);
    return g1ArticulationQuestion(rng);
  }


  // =========================================================================
  // Grade 2 generators
  // =========================================================================

  // Test 2A: Identify 2 or 3 time (6/8 = "2 time" because 2 main beats).
  function g2TimeSigQuestion(rng) {
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
            const t0Offset = 0.04;
            const c = a.ensure();
            if (!c) return;
            const t0 = c.currentTime + t0Offset;
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
  function g2EchoMelodyQuestion(rng) {
    const isMajor = rng.bool();
    const phrases = isMajor ? G2_ECHO_PHRASES_MAJOR : G2_ECHO_PHRASES_MINOR;
    const phrase = pick(rng, phrases);
    const keyLabel = isMajor ? "major" : "minor";
    const step = 0.52;
    return {
      prompt: `Listen to this ${keyLabel}-key phrase — it plays <strong>three times</strong>. Then <strong>sing it back</strong> note by note.${sequenceStaff(phrase)}`,
      audio: function () {
        const a = audio();
        const gap = phrase.length * step * 1000 + 700;
        a.sequence(phrase, step, 0.48);
        setTimeout(function () { a.sequence(phrase, step, 0.48); }, gap);
        setTimeout(function () { a.sequence(phrase, step, 0.48); }, gap * 2);
      },
      micTask: {
        type: "sequence",
        targets: makeSequenceTargets(phrase),
        toleranceSemitones: 1.0,
        minHoldMs: 450,
      },
      choices: ["I sang the phrase", "I couldn't match it"],
      answer: "I sang the phrase",
      explanation: `Grade 2 echo singing: phrases can be in major or minor keys and extend up to the 5th (dominant). Listen to whether the 3rd note feels higher or lower than you expected — that's often the clue to major vs minor.`,
    };
  }

  function g2AuralQuestion(rng) {
    const type = rng.int(0, 4);
    if (type === 0) return g2TimeSigQuestion(rng);
    if (type === 1) return g2ChangeTypeQuestion(rng);
    if (type === 2) return g2TempoQuestion(rng);
    if (type === 3) return g1DynamicsQuestion(rng);
    return g1ArticulationQuestion(rng);
  }

  // =========================================================================
  // Grade 3 generators
  // =========================================================================

  // Test 3A: Identify 2, 3, or 4 time.
  function g3TimeSigQuestion(rng) {
    const options = [
      { beats: 2, sig: "2/4" },
      { beats: 3, sig: "3/4" },
      { beats: 4, sig: "4/4" },
      { beats: 2, sig: "6/8" },
    ];
    const opt = pick(rng, options);
    const notes = meterNotes(opt.beats);
    const label = String(opt.beats);
    const expl = {
      "2/4": "2/4 has two crotchet beats — a march feel.",
      "3/4": "3/4 has three crotchet beats — a waltz feel.",
      "4/4": "4/4 (common time) has four crotchet beats. Beats 1 and 3 are stronger, beat 1 strongest. Compare: march feels in 4, waltz in 3.",
      "6/8": "6/8 has two main beats, each divided into three quavers — a lilting, swinging feel. Count two slow beats, not six fast ones.",
    };
    return {
      prompt: `Listen to this rhythmic pattern. How many <strong>main beats</strong> are in each bar? (6/8 has 2 main beats.)`,
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

  function g4AuralQuestion(rng) {
    const type = rng.int(0, 2);
    if (type === 0) return g4SightSingQuestion(rng);
    if (type === 1) return g4RhythmTimeSigQuestion(rng);
    return g4CharacterQuestion(rng);
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

  function g5AuralQuestion(rng) {
    const type = rng.int(0, 3);
    if (type === 0) return g5SightSingQuestion(rng);
    if (type === 1) return g5StyleQuestion(rng);
    if (type === 2) return g3TimeSigQuestion(rng);
    return g3TonalityQuestion(rng);
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
          title: "Aural: pulse & time signature (inc. 6/8)",
          why: "Grade 2 introduces 4/4 and 6/8 alongside 2/4 and 3/4. In 6/8 there are six quavers per bar, but you feel two main beats. In 4/4 (common time) there are four crotchet beats with beats 1 and 3 stronger.",
          what: "<p>In 6/8 each of the two beats is a <b>dotted crotchet</b> (= three quavers), giving a lilting, triplet feel. Listen for the swing or bounce of two groups-of-three rather than the march of two-crotchet or waltz of three-crotchet.</p>",
          questions: g2TimeSigQuestion,
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
          why: "Grade 3 reinforces all four time signatures introduced in Grade 2 — 2/4, 3/4, 4/4, and 6/8. The challenge is quickly distinguishing all four: the march of 2, the waltz of 3, the broad stride of 4, and the lilting swing of 6/8.",
          what: "<p>In 4/4, there are two 'groups' of two within each bar: a strong-weak-strong-weak pattern. 6/8 also has 2 main beats but each divides into three quavers, giving a lilt rather than a march. Compare: 2/4 = march (ONE two), 3/4 = waltz (ONE two three), 4/4 = strong stride (ONE two THREE four), 6/8 = lilting (ONE-and-a TWO-and-a).</p>",
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
          questions: g2EchoMelodyQuestion,
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
  ];

  // Store aural topics separately so they don't appear in regular theory quiz
  // sessions. The dedicated Aural view accesses MTT.content.auralGrades directly.
  global.MTT.content.auralGrades = auralTopics.map(function (ag) {
    return { grade: ag.grade, title: "Grade " + ag.grade, topics: ag.topics };
  });

})(typeof globalThis !== "undefined" ? globalThis : this);
