/* core/diagnose.js - diagnostic feedback.
 *
 * Turns a wrong answer into an explanation of the *likely confusion*, not just
 * "wrong". A question carries an optional `meta` describing its structure (an
 * interval's number+quality, a key signature, a chord quality, an inversion);
 * given the learner's picked answer, this infers what they probably mixed up and
 * says so ("a minor 6th vs a major 6th: same letter span, one semitone apart").
 *
 * Returns an HTML string of targeted advice, or null when nothing specific can
 * be inferred (the generic explanation still shows).
 *
 * Public surface: global `MTT.diagnose`.
 */
(function (global) {
  "use strict";

  // Parse an interval name like "minor 6th", "perfect 5th", "augmented 4th",
  // "octave", "unison" into { quality, number }.
  function parseIntervalName(s) {
    const str = String(s).trim().toLowerCase();
    if (str === "octave") return { quality: "perfect", number: 8 };
    if (str === "unison") return { quality: "perfect", number: 1 };
    const m = /^(compound\s+)?(perfect|major|minor|augmented|diminished)\s+(\d+|unison|octave)(?:nd|rd|th)?$/.exec(str);
    if (!m) return null;
    let number;
    if (m[3] === "octave") number = 8;
    else if (m[3] === "unison") number = 1;
    else number = parseInt(m[3], 10);
    return { quality: m[2], number };
  }

  function intervalDiagnosis(picked, answer) {
    const p = parseIntervalName(picked);
    const a = parseIntervalName(answer);
    if (!p || !a) return null;
    if (p.number === a.number && p.quality !== a.quality) {
      return "You had the <b>number</b> right (a " + ordinalWord(a.number) + ") but the <b>quality</b> wrong: "
        + "a <b>" + answer + "</b> and a <b>" + picked + "</b> span the same letter names but differ by a semitone. "
        + "Count the exact semitones, not just the letters.";
    }
    if (p.number !== a.number && p.quality === a.quality) {
      return "Right quality, wrong size: you picked a <b>" + ordinalWord(p.number) + "</b> but it's a <b>"
        + ordinalWord(a.number) + "</b>. The number comes from counting letter names inclusively - recount from the lower note.";
    }
    if (p.number !== a.number && p.quality !== a.quality) {
      return "Both the number and the quality are off. Count the letter names first (that's the number), "
        + "then the semitones (that's the quality).";
    }
    return null;
  }

  function ordinalWord(n) {
    if (n === 1) return "unison";
    if (n === 8) return "octave";
    const SUFFIX = { 2: "nd", 3: "rd" };
    return n + (SUFFIX[n] || "th");
  }

  // Key-signature questions: answers look like "3 sharps", "2 flats", "none".
  function keysigDiagnosis(picked, answer) {
    const parse = (s) => {
      if (/^none$/i.test(s)) return { count: 0, type: null };
      const m = /^(\d+)\s+(sharp|flat)/i.exec(s);
      return m ? { count: parseInt(m[1], 10), type: m[2].toLowerCase() } : null;
    };
    const p = parse(picked);
    const a = parse(answer);
    if (!p || !a) return null;
    if (p.type && a.type && p.type !== a.type) {
      return "You chose the right number but the wrong direction (<b>" + p.type + "s</b> instead of <b>"
        + a.type + "s</b>). Sharp keys sit clockwise of C on the circle of fifths, flat keys anticlockwise.";
    }
    if (p.count !== a.count) {
      return "Miscounted the accidentals (" + p.count + " vs <b>" + a.count + "</b>). Walk the circle of fifths from C, "
        + "adding one accidental per step.";
    }
    return null;
  }

  // Inversion questions: "root position" / "first inversion" / "second inversion".
  function inversionDiagnosis() {
    return "It's the <b>bass note</b> (the lowest) that names the inversion: root in the bass = root position, "
      + "the 3rd in the bass = first inversion, the 5th in the bass = second inversion.";
  }

  // Triad-quality questions: major / minor / diminished / augmented.
  function chordQualityDiagnosis(picked, answer) {
    const tips = {
      major: "a <b>major</b> 3rd (4 semitones) then a perfect 5th",
      minor: "a <b>minor</b> 3rd (3 semitones) then a perfect 5th",
      diminished: "a minor 3rd then a <b>diminished</b> 5th (both intervals small)",
      augmented: "a major 3rd then an <b>augmented</b> 5th (both intervals wide)",
    };
    if (tips[answer] && tips[picked]) {
      return "This triad stacks " + tips[answer] + "; a <b>" + picked + "</b> triad would be " + tips[picked]
        + ". Check the size of the 3rd and the 5th above the root.";
    }
    return null;
  }

  /**
   * @param {object} question - the generated question (may carry `meta`)
   * @param {string} picked - the answer the learner chose
   * @returns {string|null} HTML advice, or null
   */
  function feedback(question, picked) {
    if (!question || !question.meta || picked === question.answer) return null;
    switch (question.meta.type) {
      case "interval": return intervalDiagnosis(picked, question.answer);
      case "keysig": return keysigDiagnosis(picked, question.answer);
      case "inversion": return inversionDiagnosis(picked, question.answer);
      case "chordQuality": return chordQualityDiagnosis(picked, question.answer);
      default: return null;
    }
  }

  const api = { feedback, parseIntervalName };

  global.MTT = global.MTT || {};
  global.MTT.diagnose = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
