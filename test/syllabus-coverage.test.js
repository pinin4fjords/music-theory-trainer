/**
 * Per-grade syllabus coverage audit (issue #13 / IMPROVEMENT-PLAN.md B4).
 *
 * SYLLABUS below is a checklist transcribed from the two official graded-exam
 * theory syllabus sheets this app targets (Grades 1-5 and Grades 6-8 - see
 * IMPROVEMENT-PLAN.md's ground-truth section for the source documents).
 * Each entry is one syllabus requirement, tagged with the grade it is FIRST
 * introduced at (grades are cumulative in both the exam and this app's
 * `gradeTopics(grade)`, so a requirement need not be re-listed at every later
 * grade). `topicIds` names the content.js topic(s) that drill it correctly -
 * left empty when nothing in the app currently drills it at that grade.
 *
 * This turns grade alignment from a one-off review into a regression
 * guarantee, in the spirit of `facts.test.js`.
 */
import { describe, it, expect } from "vitest";

const { content } = globalThis.MTT;

const findTopic = (id) => {
  for (const g of content.grades) {
    const t = g.topics.find((x) => x.id === id);
    if (t) return Object.assign({}, t, { grade: g.grade });
  }
  return null;
};

const SYLLABUS = [
  // --- Grade 1 -----------------------------------------------------------
  { grade: 1, text: "Note values (semibreve/minim/crotchet/quaver/semiquaver) & rests; tied notes; single-dotted notes", topicIds: ["g1-rhythm"] },
  { grade: 1, text: "Simple time signatures 2/4, 3/4, 4/4; bar-lines; grouping of notes/rests", topicIds: ["g1-time"] },
  { grade: 1, text: "The stave; treble (G) & bass (F) clef note names, incl. middle C", topicIds: ["g1-notes"] },
  { grade: 1, text: "Sharp, flat, natural signs and their cancellation", topicIds: ["g1-rhythm"] },
  { grade: 1, text: "Major scale construction (position of tones and semitones)", topicIds: ["g1-keys"] },
  { grade: 1, text: "Keys of C, G, D, F: key signature, tonic triad (root position), degrees (number only), intervals above tonic (number only)", topicIds: ["g1-keys", "g1-triad"] },
  { grade: 1, text: "Everyday tempo/dynamics/performance/articulation terms & signs", topicIds: ["g1-terms"] },

  // --- Grade 2 (as Grade 1, plus:) ----------------------------------------
  { grade: 2, text: "Simple time signatures 2/2, 3/2, 4/2, 3/8; grouping of notes/rests", topicIds: [] },
  { grade: 2, text: "Triplets, and triplet note groups with rests", topicIds: [] },
  { grade: 2, text: "Stave extended to two ledger lines above and below", topicIds: [] },
  { grade: 2, text: "Relative major & minor keys; minor scale construction (harmonic only)", topicIds: ["g2-keys"] },
  { grade: 2, text: "Keys of A, Bb, Eb major and A, E, D minor: key signature, tonic triad (root position), degrees (number only), intervals above tonic (number only)", topicIds: ["g2-keys", "g2-triad"] },
  { grade: 2, text: "More terms and signs in common use", topicIds: ["g2-terms"] },

  // --- Grade 3 (as preceding grades, plus:) -------------------------------
  { grade: 3, text: "Compound time signatures 6/8, 9/8, 12/8; grouping of notes/rests", topicIds: ["g3-compound"] },
  { grade: 3, text: "The demisemiquaver and its equivalent rest", topicIds: ["g3-notation"] },
  { grade: 3, text: "Stave extension beyond two ledger lines", topicIds: [] },
  { grade: 3, text: "Octave transposition, treble clef to bass clef and vice versa", topicIds: ["g3-notation"] },
  { grade: 3, text: "Scales and key signatures of all major/minor keys up to 4 sharps/flats (tonic triad, degrees, intervals above tonic by number and type)", topicIds: [] },
  { grade: 3, text: "Both harmonic and melodic forms of minor scales", topicIds: ["g3-melodic"] },
  { grade: 3, text: "More terms and signs", topicIds: ["g3-terms"] },

  // --- Grade 4 (as preceding grades, plus:) -------------------------------
  { grade: 4, text: "All simple/compound duple, triple, quadruple time signatures; grouping of notes/rests", topicIds: ["g4-time"] },
  { grade: 4, text: "The breve and its equivalent rest", topicIds: ["g4-time"] },
  { grade: 4, text: "Double-dotted notes and rests", topicIds: ["g4-time"] },
  { grade: 4, text: "Duplets", topicIds: ["g4-time"] },
  { grade: 4, text: "Alto clef (C clef centred on 3rd line); notes in the alto clef", topicIds: ["g4-alto-clef"] },
  { grade: 4, text: "Notes of the same pitch in different clefs; octave transposition treble/bass <-> alto", topicIds: [] },
  { grade: 4, text: "Double sharp and double flat signs and their cancellation; enharmonic equivalents", topicIds: ["g4-double-acc"] },
  { grade: 4, text: "Scales and key signatures of major keys up to 5 sharps/flats", topicIds: ["g4-key-signatures"] },
  { grade: 4, text: "Scales and key signatures of minor keys up to 5 sharps/flats", topicIds: [] },
  { grade: 4, text: "Technical names for the notes of the diatonic scale (tonic, supertonic, etc.)", topicIds: ["g4-degree-names"] },
  { grade: 4, text: "Construction of the chromatic scale", topicIds: ["g4-chromatic"] },
  { grade: 4, text: "All intervals not exceeding an octave, between any two diatonic notes", topicIds: ["g4-intervals"] },
  { grade: 4, text: "Triads (root position only) on tonic, subdominant, dominant", topicIds: ["g4-triads"] },
  { grade: 4, text: "Trill, turn, upper/lower mordent, acciaccatura, appoggiatura", topicIds: ["g4-ornaments"] },
  { grade: 4, text: "Simple related questions about standard orchestral instruments", topicIds: [] },
  { grade: 4, text: "More terms and signs", topicIds: ["g4-terms"] },

  // --- Grade 5 (as preceding grades, plus:) -------------------------------
  { grade: 5, text: "Irregular time signatures 5/4, 7/4, 5/8, 7/8; grouping of notes/rests; irregular divisions of simple time values", topicIds: ["g5-irregular"] },
  { grade: 5, text: "Tenor clef (C clef centred on 4th line)", topicIds: ["g5-clefs"] },
  { grade: 5, text: "Identifying notes in all four clefs; octave transposition of a melody between any clef", topicIds: ["g5-clefs"] },
  { grade: 5, text: "Transposition to/from concert pitch for instruments in Bb, A or F", topicIds: ["g5-transposition"] },
  { grade: 5, text: "Scales and key signatures of all major/minor keys up to 6 sharps/flats", topicIds: ["g5-key-id"] },
  { grade: 5, text: "All simple and compound intervals from any note", topicIds: ["g5-intervals"] },
  { grade: 5, text: "Root position (a), 1st inversion (b), 2nd inversion (c) of tonic, supertonic, subdominant, dominant chords", topicIds: ["g5-chords"] },
  { grade: 5, text: "Perfect, plagal and imperfect cadences in the major keys of C, G, D or F", topicIds: ["g5-chords"] },
  { grade: 5, text: "Choice of suitable chords at cadential points of a simple melody (C, G, D or F major)", topicIds: [] },
  { grade: 5, text: "Recognition of ornaments, incl. replacing written-out ornamentation with the correct sign", topicIds: [] },
  { grade: 5, text: "Types of voice, instrument names, clefs they use, family groups, how they produce sound", topicIds: ["g5-instruments"] },
  { grade: 5, text: "More terms and signs", topicIds: ["g5-terms"] },

  // --- Grade 6 (as preceding grades; harmonic vocabulary adds:) -----------
  { grade: 6, text: "5/3, 6/3, 6/4 chords on any degree of the major/minor scale, with figuring", topicIds: ["g6-figured-bass"] },
  { grade: 6, text: "Dominant 7th chord: root position + 1st/2nd/3rd inversion, any major or minor key, with figuring", topicIds: ["g6-chords"] },
  { grade: 6, text: "Supertonic 7th chord: root position + 1st inversion, any major or minor key, with figuring", topicIds: [] },
  { grade: 6, text: "Principles of modulation", topicIds: [] },
  { grade: 6, text: "Melodic decoration: passing notes, auxiliary notes, appoggiaturas, changing notes, anticipation", topicIds: ["g6-non-chord"] },
  { grade: 6, text: "Writing: chords in 4 parts above a given bass; suitable chords/figured bass for a melody; melody composition with modulation", topicIds: ["g6-harmony-write"] },

  // --- Grade 7 (as preceding grades, plus:) -------------------------------
  { grade: 7, text: "Recognition of all diatonic secondary 7th chords and their inversions", topicIds: [] },
  { grade: 7, text: "The Neapolitan 6th and diminished 7th chords", topicIds: ["g7-chromatic"] },
  { grade: 7, text: "Figuring suspensions (4-3, 7-6, 9-8) and other c.1620-1790 bass figures", topicIds: [] },
  { grade: 7, text: "Writing: figuring inner-part movement over a given melody+bass; rewriting with suspensions/decoration; continuing a solo part or composing a melody", topicIds: ["g7-composition"] },

  // --- Grade 8 (as preceding grades; harmonic vocabulary adds:) -----------
  { grade: 8, text: "All standard diatonic and chromatic chords", topicIds: ["g8-aug-sixth", "g8-secondary-dominant"] },
  { grade: 8, text: "Writing: continue a Baroque trio-sonata opening from a figured continuo part; complete a keyboard outline; continue a melody for a specified instrument", topicIds: ["g8-composition"] },
];

describe("syllabus coverage - checklist encodes grade placement", () => {
  it.each(SYLLABUS.filter((item) => item.topicIds.length).flatMap((item) => item.topicIds.map((id) => [item.grade, id, item.text])))(
    "grade %i: %s is introduced by %s, not drilled earlier or later",
    (grade, id) => {
      const topic = findTopic(id);
      expect(topic, `no such topic id: ${id}`).toBeTruthy();
      expect(topic.grade, `${id} should be introduced at grade ${grade}`).toBe(grade);
    },
  );

  it("every topic id referenced by the checklist actually exists in content.grades", () => {
    const ids = new Set(SYLLABUS.flatMap((i) => i.topicIds));
    for (const id of ids) expect(findTopic(id), id).toBeTruthy();
  });
});

describe("syllabus coverage - uncovered items (report, not a hard failure)", () => {
  it("lists syllabus items with no drill at their syllabus grade", () => {
    const uncovered = SYLLABUS.filter((item) => item.topicIds.length === 0);
    if (uncovered.length) {
      const report = uncovered.map((i) => `  G${i.grade}: ${i.text}`).join("\n");
      console.log(`Syllabus items with no drill at their introducing grade (${uncovered.length}):\n${report}`);
    }
    // Informational: absence from the curriculum is not itself a bug (some of
    // these are open-ended composition/analysis tasks tracked on the README
    // roadmap instead of single-answer drills). This assertion just keeps the
    // report live in every run.
    expect(Array.isArray(uncovered)).toBe(true);
  });
});

describe("syllabus coverage - every grade has at least one drilled topic", () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])("grade %i has at least one quizable topic", (grade) => {
    const g = content.grades.find((x) => x.grade === grade);
    expect(g, `no grade ${grade} in content.grades`).toBeTruthy();
    expect(g.topics.some((t) => typeof t.questions === "function")).toBe(true);
  });
});
