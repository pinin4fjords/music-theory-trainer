/* labs.js - deterministic models and teaching content for music labs.
 *
 * The models in this file do not touch the DOM or audio. The lab UI supplies
 * native controls, then passes their values here so calculations stay directly
 * testable and the written alternative always describes the same result.
 *
 * Public surface: global `MTT.labs`.
 */
(function (global) {
  "use strict";

  const round = (value, places) => {
    const scale = Math.pow(10, places == null ? 2 : places);
    return Math.round(value * scale) / scale;
  };
  const centsBetween = (lower, upper) => 1200 * Math.log2(upper / lower);
  const beatFrequency = (first, second) => Math.abs(second - first);
  const stringFrequency = (lengthMetres, tensionNewtons, densityKgPerMetre) =>
    Math.sqrt(tensionNewtons / densityKgPerMetre) / (2 * lengthMetres);

  const SOURCES = {
    pitch: {
      label: "UNSW Music Acoustics: frequency and pitch",
      url: "https://www.animations.physics.unsw.edu.au/jw/frequency-pitch-sound.htm",
    },
    ellis: {
      label: "Ellis and Helmholtz, On the Sensations of Tone",
      url: "https://wellcomecollection.org/works/rby988rq",
    },
    beats: {
      label: "OpenStax University Physics: beats",
      url: "https://openstax.org/books/university-physics-volume-1/pages/17-6-beats",
    },
    pitchReview: {
      label: "Oxenham, Pitch Perception",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3481156/",
    },
    string: {
      label: "OpenStax University Physics: standing waves",
      url: "https://openstax.org/books/university-physics-volume-1/pages/16-6-standing-waves-and-resonance",
    },
    monochord: {
      label: "Whipple Museum: the monochord",
      url: "https://www.whipplemuseum.cam.ac.uk/explore-whipple-collections/acoustics/monochord",
    },
    mersenne: {
      label: "Stanford Encyclopedia of Philosophy: Marin Mersenne",
      url: "https://plato.stanford.edu/entries/mersenne/",
    },
    metre: {
      label: "Nozaradan et al., neural entrainment to beat and meter",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC6623069/",
    },
    metreHistory: {
      label: "Music Theory Online: non-isochronous meters",
      url: "https://mtosmt.org/issues/mto.20.26.1/mto.20.26.1.clayton.html",
    },
  };

  const ratioOptions = [
    { value: "1", label: "Unison (1:1)" },
    { value: String(Math.pow(2, 1 / 12)), label: "Equal-tempered semitone" },
    { value: "1.25", label: "Just major 3rd (5:4)" },
    { value: "1.5", label: "Perfect 5th (3:2)" },
    { value: "2", label: "Octave (2:1)" },
  ];

  const definitions = [
    {
      id: "frequency-cents",
      explainer: "cents",
      title: "Frequency, ratios and cents",
      question: "Does adding the same number of hertz always make the same musical interval?",
      predictionPrompt: "Predict which setting will sound like the largest pitch step, and say why.",
      controls: [
        { id: "base", label: "Starting frequency", type: "range", min: 110, max: 440, step: 10, value: 220, unit: "Hz" },
        { id: "ratio", label: "Frequency ratio", type: "select", value: "1.5", options: ratioOptions },
      ],
      calculate(values) {
        const base = Number(values.base);
        const ratio = Number(values.ratio);
        const upper = base * ratio;
        const cents = centsBetween(base, upper);
        return {
          headline: `${round(base, 1)} Hz → ${round(upper, 2)} Hz`,
          values: [
            ["Frequency ratio", `${round(ratio, 5)}:1`],
            ["Interval size", `${round(cents, 2)} cents`],
            ["Hertz difference", `${round(upper - base, 2)} Hz`],
          ],
          text: `The second tone is ${round(upper, 2)} hertz. It is ${round(cents, 2)} cents above the first tone, although the difference is ${round(upper - base, 2)} hertz.`,
          visual: { kind: "pitch-ratio", lower: base, upper, cents, ratio },
          audio: { kind: "sequence", frequencies: [base, upper] },
        };
      },
      lenses: {
        mechanism: "Your ear responds mainly to the relationship between two frequencies, not the number of hertz between them. Double any starting frequency and you move up one octave. This works for 110 to 220 Hz and for 440 to 880 Hz. Cents give that relationship a number: one octave is always 1,200 cents. Loudness and tone colour can make the pitch seem slightly different.",
        history: "In 1885, Alexander J. Ellis helped make the cent a common unit for comparing musical scales. Researchers could describe very small differences and compare tuning systems without treating one system as the universal standard. The cent measures an interval. It does not say how every musical tradition must divide an octave.",
        practice: "First look at the ratio, then look at the difference in hertz. Move the starting-frequency slider while keeping the same ratio. The distance in cents stays the same, but the difference in hertz changes. This is why equal steps on a piano spread farther apart in hertz as the notes rise.",
      },
      boundaries: {
        measured: "You set both frequencies. The lab calculates their ratio, difference in hertz, and distance in cents.",
        inferred: "The ratio gives a precise interval size. The pitch that you hear can also change slightly with tone colour, volume, and listening conditions.",
        convention: "Musicians choose how to name and tune an interval. Terms such as major 3rd and twelve equal semitones come from particular systems.",
      },
      sources: [SOURCES.pitch, SOURCES.ellis],
    },
    {
      id: "beating",
      explainer: "consonance",
      title: "Tune by listening for beats",
      question: "What happens when two steady tones move closer in frequency?",
      predictionPrompt: "Predict how many loudness pulses you will hear each second.",
      controls: [
        { id: "base", label: "First tone", type: "range", min: 220, max: 500, step: 10, value: 440, unit: "Hz" },
        { id: "offset", label: "Detuning", type: "range", min: 0, max: 12, step: 1, value: 4, unit: "Hz" },
      ],
      calculate(values) {
        const first = Number(values.base);
        const second = first + Number(values.offset);
        const beats = beatFrequency(first, second);
        return {
          headline: beats === 0 ? "Frequencies match" : `${round(beats, 1)} beat${beats === 1 ? "" : "s"} per second`,
          values: [
            ["First tone", `${round(first, 1)} Hz`],
            ["Second tone", `${round(second, 1)} Hz`],
            ["Beat frequency", `${round(beats, 1)} Hz`],
          ],
          text: beats === 0
            ? `Both tones are ${round(first, 1)} hertz, so their combined sound has no beats.`
            : `The tones are ${round(first, 1)} and ${round(second, 1)} hertz. Together, they make ${round(beats, 1)} loudness peak${beats === 1 ? "" : "s"} each second.`,
          visual: { kind: "beats", first, second, beats },
          audio: { kind: "chord", frequencies: [first, second], duration: 2.8 },
        };
      },
      lenses: {
        mechanism: "Play two nearby frequencies together and their waves sometimes line up and sometimes work against each other. The result grows louder and softer in a steady pulse. The number of pulses each second equals the difference between the frequencies. For example, 440 Hz and 444 Hz make four beats each second. Move the tones farther apart and you may hear roughness or two separate pitches instead of clear beats.",
        history: "Musicians have used beats to tune instruments for centuries. As two notes approach a unison, the beats slow down. A tuner can hear this change without an electronic display. Researchers in the nineteenth century also linked beating with roughness. Today, researchers know that roughness is only one part of musical consonance.",
        practice: "Start with enough detuning to hear clear pulses. Move the detuning slowly towards zero and listen as the pulses slow down. They disappear when these two frequencies match. Real instruments contain several partials, so a tuner may listen for beats between selected partials instead.",
      },
      boundaries: {
        measured: "You set the two frequencies. Their difference gives the beat rate in this simple model of two equally loud sine waves.",
        inferred: "You may hear beats, roughness, or two separate pitches. The result depends on pitch range, spacing, volume, tone colour, and your hearing.",
        convention: "Beats can help you reach a chosen tuning. They cannot tell you which tuning system musicians should choose.",
      },
      sources: [SOURCES.beats],
    },
    {
      id: "harmonic-spectrum",
      explainer: "timbre",
      title: "Harmonics and the missing fundamental",
      question: "Can a tone keep its pitch after its lowest frequency component is removed?",
      predictionPrompt: "Predict whether removing the fundamental will change the pitch, the tone colour, both, or neither.",
      controls: [
        {
          id: "fundamental", label: "Implied fundamental", type: "select", value: "110",
          options: [
            { value: "80", label: "80 Hz" },
            { value: "110", label: "110 Hz" },
            { value: "220", label: "220 Hz" },
          ],
        },
        {
          id: "spectrum", label: "Components", type: "select", value: "missing",
          options: [
            { value: "full", label: "Fundamental + harmonics 2–6" },
            { value: "missing", label: "Harmonics 2–6 only" },
            { value: "odd", label: "Odd harmonics 1, 3 and 5" },
          ],
        },
      ],
      calculate(values) {
        const fundamental = Number(values.fundamental);
        const partialNumbers = values.spectrum === "full" ? [1, 2, 3, 4, 5, 6]
          : values.spectrum === "odd" ? [1, 3, 5] : [2, 3, 4, 5, 6];
        const frequencies = partialNumbers.map((n) => fundamental * n);
        const missing = partialNumbers.indexOf(1) === -1;
        return {
          headline: missing ? `${fundamental} Hz is absent but implied` : `${fundamental} Hz is present`,
          values: [
            ["Components", partialNumbers.map((n) => `H${n}`).join(", ")],
            ["Frequencies", frequencies.map((f) => `${f} Hz`).join(", ")],
            ["Pattern spacing", `${fundamental} Hz`],
          ],
          text: `You are hearing harmonics ${partialNumbers.join(", ")} at ${frequencies.join(", ")} hertz. They follow a pattern spaced by ${fundamental} hertz${missing ? `, even though ${fundamental} hertz itself is missing` : ""}.`,
          visual: { kind: "spectrum", fundamental, partialNumbers },
          audio: { kind: "chord", frequencies, duration: 2.4 },
        };
      },
      lenses: {
        mechanism: "A musical tone can contain several frequencies at once. Harmonics are whole-number multiples of the lowest frequency: H1, H2, H3, and so on. Remove H1 while leaving several higher harmonics in place, and you may still hear the same basic pitch. Your hearing uses both the spacing of the harmonics and the timing of the combined wave. The missing pitch is something you perceive. It is not a hidden sound at H1.",
        history: "In the nineteenth century, Hermann von Helmholtz used resonators to pick out separate frequencies inside a complex tone. In the twentieth century, J. F. Schouten and others studied why listeners hear a missing fundamental. Their experiments showed that a simple difference tone could not explain every result. Researchers now use several explanations based on the frequencies and timing in a sound.",
        practice: "Compare the full sound with the version that contains only H2 to H6. Does the basic pitch stay the same? Does the tone become lighter, thinner, or otherwise different? The result can change with the harmonics, their volume and timing, your speakers, and your hearing.",
      },
      boundaries: {
        measured: "The synthesiser plays the frequencies shown in the chart. When the fundamental is absent, the synthesiser adds no energy at that frequency.",
        inferred: "You may hear the missing fundamental as a pitch. A spectrum analyser would not find that frequency in this sound.",
        convention: "Words such as bright, hollow, or thin depend on culture and context. A spectrum does not give a sound one fixed musical meaning.",
      },
      sources: [SOURCES.pitchReview],
    },
    {
      id: "string-pitch",
      explainer: "monochord",
      title: "Length, tension and string pitch",
      question: "Which change raises a stretched string's fundamental most: shortening it or tightening it?",
      predictionPrompt: "Predict the result before moving a control. Look for a proportional rule, not just a direction.",
      controls: [
        { id: "length", label: "Vibrating length", type: "range", min: 30, max: 120, step: 1, value: 60, unit: "cm" },
        { id: "tension", label: "Tension", type: "range", min: 20, max: 120, step: 5, value: 80, unit: "N" },
        { id: "density", label: "Mass per length", type: "range", min: 1, max: 10, step: 0.5, value: 5, unit: "g/m" },
      ],
      presets: [
        { label: "Open (1:1)", values: { length: "120" } },
        { label: "Half (1:2)", values: { length: "60" } },
        { label: "Two-thirds (2:3)", values: { length: "80" } },
        { label: "Three-quarters (3:4)", values: { length: "90" } },
        { label: "Four-fifths (4:5)", values: { length: "96" } },
      ],
      calculate(values) {
        const length = Number(values.length) / 100;
        const tension = Number(values.tension);
        const density = Number(values.density) / 1000;
        const frequency = stringFrequency(length, tension, density);
        return {
          headline: `Fundamental ≈ ${round(frequency, 2)} Hz`,
          values: [
            ["Vibrating length", `${round(length, 2)} m`],
            ["Wave speed", `${round(Math.sqrt(tension / density), 2)} m/s`],
            ["Fundamental wavelength", `${round(2 * length, 2)} m`],
          ],
          text: `With these settings, the ideal-string model gives a fundamental of ${round(frequency, 2)} hertz. Real strings will differ slightly from this result.`,
          visual: {
            kind: "string",
            fraction: length / 1.2,
            label: `${round((length / 1.2) * 100, 1)} percent of the full string is vibrating.`,
          },
          audio: { kind: "chord", frequencies: [frequency], duration: 1.8 },
        };
      },
      lenses: {
        mechanism: "Three things set the main pitch of this ideal string: its length, its tension, and its mass. Halve the vibrating length and the frequency doubles. To double the frequency with tension alone, you must multiply the tension by four. A heavier string vibrates more slowly than a lighter string of the same length and tension.",
        history: "Ancient Greek scholars used the monochord to connect string lengths with musical intervals. A later story credits Pythagoras with discovering these rules, but no account from his lifetime confirms it. In 1636, Marin Mersenne published experiments on frequency, string length, tension, and string mass. This work helped turn the study of strings into a measured science.",
        practice: "Use the fraction buttons to compare familiar string lengths. Then hold the length steady and change the tension or mass. A string player usually raises a note by shortening the vibrating string with a finger. A real instrument also adds string stiffness, fixed ends, and vibrations from its body.",
      },
      boundaries: {
        measured: "You set the length, tension, and mass per metre. The lab uses the ideal-string equation to calculate the frequency.",
        inferred: "A real string follows the same main pattern, but stiffness, fixed ends, and the instrument body change the exact result.",
        convention: "Musicians need a tuning reference and a note system to name the result. The physics does not choose either one.",
      },
      sources: [SOURCES.string, SOURCES.monochord, SOURCES.mersenne],
    },
    {
      id: "metric-entrainment",
      explainer: "metre",
      title: "Hear a pulse become metre",
      question: "Can the same fast pulse support different beat groupings?",
      predictionPrompt: "Predict where you will tap: every pulse, every group, or at another level.",
      controls: [
        {
          id: "metre", label: "Grouping", type: "select", value: "6/8",
          options: [
            { value: "4/4", label: "4/4 as 2+2+2+2" },
            { value: "6/8", label: "6/8 as 3+3" },
            { value: "5/8", label: "5/8 as 3+2" },
            { value: "7/8", label: "7/8 as 2+2+3" },
          ],
        },
        { id: "pulseMs", label: "Fast-pulse duration", type: "range", min: 180, max: 500, step: 20, value: 300, unit: "ms" },
      ],
      calculate(values) {
        const patterns = {
          "4/4": { groups: [2, 2, 2, 2], family: "simple quadruple" },
          "6/8": { groups: [3, 3], family: "compound duple" },
          "5/8": { groups: [3, 2], family: "unequal or additive" },
          "7/8": { groups: [2, 2, 3], family: "unequal or additive" },
        };
        const pattern = patterns[values.metre];
        const pulseMs = Number(values.pulseMs);
        const pulses = pattern.groups.reduce((sum, n) => sum + n, 0);
        const notes = [];
        const velocities = [];
        pattern.groups.forEach((group) => {
          for (let i = 0; i < group; i++) {
            notes.push("A4");
            velocities.push(i === 0 ? 1 : 0.45);
          }
        });
        return {
          headline: `${values.metre}: ${pattern.groups.join("+")}`,
          values: [
            ["Family", pattern.family],
            ["Fast pulse", `${round(60000 / pulseMs, 1)} per minute`],
            ["Pattern duration", `${round((pulses * pulseMs) / 1000, 2)} seconds`],
          ],
          text: `You are hearing ${values.metre} as groups of ${pattern.groups.join(" plus ")} fast pulses. Each group begins with a stronger note.`,
          visual: { kind: "metre", metre: values.metre, groups: pattern.groups, pulseMs },
          audio: { kind: "note-sequence", notes, velocities, gap: pulseMs / 1000, duration: Math.max(0.08, pulseMs / 1000 - 0.08) },
        };
      },
      lenses: {
        mechanism: "Metre is the larger pattern that you hear or feel around a pulse. The pulse alone does not force one pattern. Accents, timing, movement, and expectation can group the same pulse in different ways. Brain activity can follow both a heard beat and a grouping that you imagine. This shows how people process rhythm, but it does not give metre one simple physical definition.",
        history: "European notation often teaches simple and compound metre as groups of two or three. Groupings such as 3+2 and 2+2+3 also have long histories in Balkan, Turkish, and other traditions. Western scholars later used labels such as additive rhythm and aksak. The music existed before those labels and before Western concert composers adopted these patterns.",
        practice: "First listen for the fast pulse. Then tap the larger groups and stress the first pulse of each group. For 3+2, say ONE-two-three ONE-two. Change the grouping without changing the pulse speed. Listen for the accents giving the same pulse a different shape.",
      },
      boundaries: {
        measured: "You set the pulse speed and group sizes. The lab sets the accents and calculates the length of the full pattern.",
        inferred: "Where you feel the beat depends on the tempo, accents, movement, expectations, and experience. Another listener may feel it differently.",
        convention: "Musicians use time signatures, beams, and names to show metre. Different musical traditions can organise and name the same pulses differently.",
      },
      sources: [SOURCES.metre, SOURCES.metreHistory],
    },
  ];

  const byId = (id) => definitions.find((lab) => lab.id === id) || null;
  const forExplainer = (explainerId) => definitions.filter((lab) => lab.explainer === explainerId);

  const api = {
    definitions, byId, forExplainer,
    round, centsBetween, beatFrequency, stringFrequency,
  };

  global.MTT = global.MTT || {};
  global.MTT.labs = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
