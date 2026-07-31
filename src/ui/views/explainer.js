/* ui/views/explainer.js - the interactive "why" explainers.
 *
 * Short, playable teaching pages: the circle of fifths, temperament (hear the
 * comma), the harmonic series, the three forms of minor, and the modes. Each
 * grounds a "why" in sound and notation rather than prose alone.
 *
 * Public surface: global `MTT.ui.views.explainer`.
 */
(function (global) {
  "use strict";

  function render(main, ctx, arg) {
    const C = ctx.C;
    const M = ctx.music;
    const N = ctx.notation;
    const A = ctx.audio;
    const SE = global.MTT.staffEditor;
    const TREBLE_RANGE = { minMidi: M.noteToMidi("A3"), maxMidi: M.noteToMidi("C6") };
    const byPitch = (notes) => notes.slice().sort((a, b) => M.spelledToMidi(a) - M.spelledToMidi(b));

    const playBtn = (label, fn) => C.playButton(label, () => { try { fn(); } catch { /* ignore */ } });
    const controls = () => C.el(`<div class="explainer-controls"></div>`);
    const lessonCard = (html) => C.el(`<div class="card lesson">${html}</div>`);

    // Declared before the deep-link branch below, which can call openExplainer
    // immediately. (The build* functions are hoisted function declarations.)
    const builders = {
      "harmonic-series": buildHarmonicSeries,
      "circle-of-fifths": buildCircleOfFifths,
      temperament: buildTemperament,
      "three-minors": buildThreeMinors,
      modes: buildModes,
      keyboard: buildKeyboard,
      "build-triads": buildBuildTriads,
      "four-clefs": buildFourClefs,
      "note-values": buildNoteValues,
    };

    // Deep-link: open a specific explainer directly (from the hash, or a
    // "dig deeper" link). arg is the explainer id (string) or { open: id }.
    const openId = typeof arg === "string" ? arg : (arg && arg.open) || null;
    if (openId) {
      const target = ctx.content.explainers.find((e) => e.id === openId);
      if (target) { openExplainer(target); return; }
    }

    const view = C.el(`<div class="view"><h1 tabindex="-1">Explainers &amp; labs</h1><p class="muted">Explore the mechanism, history and practice behind the theory. Labs let you predict, listen and compare the result without affecting mastery.</p></div>`);
    main.appendChild(view);
    const grid = C.el(`<div class="grid" style="margin-top:18px"></div>`);
    ctx.content.explainers.forEach((e) => {
      const icon = global.MTT.ui.icons.iconHtml(e.id);
      const hasLab = global.MTT.labs.forExplainer(e.id).length > 0;
      const badge = hasLab ? `<span class="pill outline">lab</span>` : "";
      grid.appendChild(C.cardButton(`<div class="topic-head">${icon}<h3>${e.title}</h3>${badge}</div><div class="why">${e.blurb}</div>`, () => ctx.router.navigate("explore", e.id)));
    });
    view.appendChild(grid);

    function openExplainer(e) {
      C.clear(main);
      const v = C.el(`<div class="view"></div>`);
      v.appendChild(C.button("← Back", () => ctx.router.navigate("explore"), { className: "ghost" }));
      v.appendChild(C.el(`<h1 tabindex="-1" style="margin-top:14px">${e.title}</h1>`));
      const labs = global.MTT.labs.forExplainer(e.id);
      if (labs.length) {
        labs.forEach((lab) => v.appendChild(global.MTT.ui.lab.render(lab, ctx)));
      } else {
        (builders[e.id] || ((host) => host.appendChild(C.el(`<div class="card"><p class="muted">Coming soon.</p></div>`))))(v);
      }
      main.appendChild(v);
      C.focus(v.querySelector("h1"));
    }

    function buildCircleOfFifths(host) {
      host.appendChild(lessonCard(`
        <p><b>What it is.</b> The circle of fifths is a map of all twelve keys, arranged so that each step clockwise rises by a <b>perfect 5th</b>. It gives you every key signature, shows which keys are related, and explains the order sharps and flats appear in.</p>
        <p><b>How to read it.</b> Start at <b>C</b> at the top - no sharps, no flats. Step clockwise to <b>G</b> and you add one sharp; to <b>D</b>, two; each clockwise step adds one more sharp. Go <i>anticlockwise</i> from C - to <b>F</b>, then <b>B♭</b> - and you add one flat at a time.</p>
        <p><b>Why the order never changes.</b> Sharps always appear as F♯ C♯ G♯ D♯ A♯ E♯ B♯, and flats as B♭ E♭ A♭ D♭ G♭ C♭ F♭ - and those orders are themselves circles of fifths. At the bottom of the wheel the two sides meet: F♯ major (6 sharps) is the same set of piano keys as G♭ major (6 flats), <b>enharmonic</b> spellings of one sound.</p>
        <p>Choose any key to see its signature and relative minor, and hear it.</p>`));
      const keys = ["C", "G", "D", "A", "E", "B", "F#", "Db", "Ab", "Eb", "Bb", "F"];
      const card = C.el(`<div class="card center"></div>`);
      const wheel = C.el(`<div class="cof-wheel" role="group" aria-label="Circle of fifths"></div>`);
      keys.forEach((key, i) => {
        const ang = (i * 30 - 90) * Math.PI / 180;
        const x = 150 + 118 * Math.cos(ang), y = 150 + 118 * Math.sin(ang);
        const btn = document.createElement("button");
        btn.className = "cof-key";
        btn.type = "button";
        btn.style.left = x + "px";
        btn.style.top = y + "px";
        btn.textContent = key;
        btn.addEventListener("click", () => selectCofKey(key));
        wheel.appendChild(btn);
      });
      card.appendChild(wheel);
      const infoEl = C.el(`<div class="cof-info" role="region" aria-live="polite"></div>`);
      card.appendChild(infoEl);
      host.appendChild(card);
      host.appendChild(lessonCard(`
        <p><b>Relative minors.</b> Every major key shares its signature with a minor key a <b>minor 3rd below</b> - its <i>relative minor</i> (A minor lives inside C major). One signature, two keys: the same notes, a different home note.</p>
        <p><b>Using it.</b> Keys next to each other on the wheel differ by just one accidental, so they're closely related - which is why pieces modulate to their neighbours (especially the dominant, one step clockwise) so smoothly.</p>`));
      selectCofKey("C");

      function selectCofKey(key) {
        [...wheel.querySelectorAll(".cof-key")].forEach((b) => {
          const on = b.textContent === key;
          b.classList.toggle("active", on);
          b.setAttribute("aria-pressed", on ? "true" : "false");
        });
        const sig = M.keySignature(key, "major");
        const n = Math.abs(sig.count);
        const desc = n === 0 ? "no sharps or flats"
          : `${n} ${sig.type}${n > 1 ? "s" : ""} (${sig.accidentals.map((l) => l + (sig.type === "sharp" ? "♯" : "♭")).join(" ")})`;
        const relMinor = M.spelledName(M.scale(key, "major")[5]);
        infoEl.innerHTML = `<h3 style="margin:0 0 4px">${key} major</h3>`
          + `<p class="muted" style="margin:0 0 10px">${desc} · relative minor: <b>${relMinor} minor</b></p>`
          + N.staffHTML({ clef: "treble", keySignature: sig, notes: M.scale(key, "major") });
        const row = controls();
        row.appendChild(playBtn("Hear the scale", () => A.sequence(M.scale(key, "major"))));
        row.appendChild(playBtn("Hear the tonic chord", () => A.chord(M.triad(key, "major", 1))));
        infoEl.appendChild(row);
      }
    }

    function buildTemperament(host) {
      host.appendChild(lessonCard(`
        <p><b>The idea.</b> Simple ratios such as 2:1, 3:2 and 5:4 align partials in ideal harmonic tones and can reduce beating. <b>Just intonation</b> tunes selected intervals to those ratios. The resulting sensory smoothness is measurable, while a listener's consonance judgement also depends on context and experience.</p>
        <p><b>The problem.</b> Those pure ratios don't agree with each other. Stack enough pure 5ths and you overshoot the octave you should land on (the comma below). So you can't tune a fixed-pitch instrument like a piano to be pure in every key at once - tune it sweet in C and remote keys turn sour.</p>
        <p><b>One solution.</b> <b>12-tone equal temperament</b> divides the octave into twelve equal frequency ratios (each the 12th root of 2). Every interval except the octave departs from its nearest simple ratio, but the interval pattern transposes unchanged to every key. Hear its major 3rd beside 5:4 just intonation:</p>`));
      const f = M.noteToFreq("C4");

      // --- Comma spiral ---
      const spiralCard = C.el(`<div class="card"></div>`);
      spiralCard.appendChild(C.el(`<h3 style="margin-top:0">The Pythagorean comma: why the circle won't close</h3>`));
      spiralCard.appendChild(C.el(`<p class="muted" style="font-size:.9rem">Walk twelve steps of a <b>pure perfect 5th</b> (3:2 ratio) clockwise around the circle. You should land back on C - but you overshoot by about a quarter of a semitone. That gap is the <b>Pythagorean comma</b>.</p>`));
      spiralCard.appendChild(C.el(commaSpiral()));
      spiralCard.appendChild(C.el(`<p class="muted" style="font-size:.84rem;margin-top:6px">The gap is shown here at 20° for visibility. The real comma is ≈ 1.0° (23.46 cents) on this diagram's scale, where each 30° step stands for one perfect 5th.</p>`));
      host.appendChild(spiralCard);
      const card = C.el(`<div class="card"></div>`);
      card.appendChild(C.el(`<h3 style="margin-top:0">Hear a major 3rd, two ways</h3>`));
      card.appendChild(C.el(`<p class="muted">C and E together. The pure version sits still; the equal-tempered version beats slightly (listen for the wobble).</p>`));
      const row1 = controls();
      row1.appendChild(playBtn("Just 3rd (5:4, pure)", () => A.freqChord([f, f * 5 / 4], 2.2)));
      row1.appendChild(playBtn("Equal-tempered 3rd", () => A.freqChord([f, f * Math.pow(2, 4 / 12)], 2.2)));
      card.appendChild(row1);
      card.appendChild(C.el(`<p class="muted" style="font-size:.88rem">In cents: just 3rd ≈ 386, equal-tempered 3rd = 400, Pythagorean 3rd ≈ 408. Detectability depends on duration, register, timbre, presentation and the listener, so the numeric difference does not set one universal hearing threshold.</p>`));
      host.appendChild(card);

      const card2 = C.el(`<div class="card"></div>`);
      card2.appendChild(C.el(`<h3 style="margin-top:0">The comma: why it can't all line up</h3>`));
      card2.appendChild(C.el(`<p class="muted">Twelve pure 5ths (ratio 3:2) should land seven octaves up - but they overshoot by about a quarter of a semitone, the Pythagorean comma. Hear the target octave, then where the stacked 5ths actually arrive.</p>`));
      const base = M.noteToFreq("C2");
      const row2 = controls();
      row2.appendChild(playBtn("Seven octaves (2⁷)", () => A.freqSequence([base, base * 128], 0.6, 0.55)));
      row2.appendChild(playBtn("Twelve pure 5ths", () => A.freqSequence([base, base * Math.pow(3 / 2, 12)], 0.6, 0.55)));
      row2.appendChild(playBtn("Both together (the comma)", () => A.freqChord([base * 128, base * Math.pow(3 / 2, 12)], 2.4)));
      card2.appendChild(row2);
      host.appendChild(card2);
    }

    function buildHarmonicSeries(host) {
      host.appendChild(lessonCard(`
        <p><b>Where the model comes from.</b> An ideal flexible string fixed at both ends supports modes at whole-number multiples of its fundamental. A real plucked string can excite several of these <b>partials</b> at once, although stiffness shifts them slightly and their amplitudes change over time. Other instruments can have harmonic, nearly harmonic or inharmonic spectra.</p>
        <p><b>Multiply the frequency by 1, 2, 3, 4...</b> If the fundamental is <b>A = 110 Hz</b>, the partials sit at 220, 330, 440, 550, 660, 770, 880 Hz. (The 4th partial, 440 Hz, is the A we tune to.) Crucially, the <i>gaps</i> between them <b>shrink</b> as you climb, even though each step adds the same 110 Hz: 110→220 is an octave, 220→330 a perfect 5th, 330→440 a perfect 4th, 440→550 a major 3rd. Your ear judges an interval by the <b>ratio</b> of the two frequencies, and those ratios get closer to 1 as you go up (2:1, 3:2, 4:3, 5:4...), so each step is a smaller interval.</p>
        <p><b>Why the same letters keep returning.</b> Doubling the frequency is always an octave, so partials 1, 2, 4 and 8 are all <b>A</b>. Partial 3 (×3 = 330 Hz) is a 5th above the <i>second</i> partial - i.e. an octave-and-a-fifth above the fundamental - which is why it's a high E, not the E just above the bottom A. Play the partials and watch the steps shrink:</p>`));
      const f = M.noteToFreq("A2"); // 110 Hz, so the numbers match the text exactly
      const partials = [
        { n: 1, note: "A", role: "the fundamental" },
        { n: 2, note: "A", role: "octave above #1" },
        { n: 3, note: "E", role: "5th above #2" },
        { n: 4, note: "A", role: "4th above #3 - this is A440" },
        { n: 5, note: "C♯", role: "major 3rd above #4" },
        { n: 6, note: "E", role: "minor 3rd above #5" },
        { n: 7, note: "G", role: "flatter than a normal G" },
        { n: 8, note: "A", role: "octave above #4" },
      ];
      const card = C.el(`<div class="card"></div>`);
      card.appendChild(C.el(`<h3 style="margin-top:0">The first eight partials of A (110 Hz)</h3>`));
      const list = C.el(`<div class="partial-list"></div>`);
      partials.forEach((p) => {
        const hz = Math.round(f * p.n);
        const b = document.createElement("button");
        b.className = "partial-chip";
        b.type = "button";
        b.innerHTML = `<b>×${p.n}</b> ${p.note} <span class="muted">${hz} Hz · ${p.role}</span>`;
        b.addEventListener("click", () => A.freqSequence([f * p.n], 0, 0.9));
        list.appendChild(b);
      });
      card.appendChild(list);
      const row = controls();
      row.appendChild(playBtn("Play all eight in turn", () => A.freqSequence(partials.map((p) => f * p.n), 0.5, 0.48)));
      row.appendChild(playBtn("Hear the major triad (4:5:6)", () => A.freqChord([4 * f, 5 * f, 6 * f], 2)));
      card.appendChild(row);
      card.appendChild(C.el(`<p class="muted" style="font-size:.88rem">Partials 4, 5 and 6 (A, C♯, E - 440:550:660 Hz) form a 4:5:6 major triad. Their aligned periodicities can reduce sensory roughness; tonal training and musical context also contribute to hearing a major triad as settled.</p>`));
      host.appendChild(card);

      // --- Pitch ruler: show shrinking gaps visually on a log-scale axis ---
      const rulerCard = C.el(`<div class="card"></div>`);
      rulerCard.appendChild(C.el(`<h3 style="margin-top:0">The gaps shrink: pitch ruler (log scale)</h3>`));
      rulerCard.appendChild(C.el(`<p class="muted" style="font-size:.9rem">Each partial adds the same 110 Hz - but on a logarithmic pitch axis the <b>visual gaps shrink</b> because the ear hears ratios, not differences. Each marked gap is a smaller interval than the one below it.</p>`));
      rulerCard.appendChild(C.el(partialRuler()));
      host.appendChild(rulerCard);

      host.appendChild(lessonCard(`
        <p><b>Multiples vs ratios - the thing that trips people up.</b> "×3" and "a perfect 5th" are not the same idea. <b>×3</b> measures a partial against the <i>fundamental</i> (330 Hz is a 12th - an octave <i>plus</i> a 5th - above 110 Hz). A <b>perfect 5th</b> is the <i>ratio between two notes</i>, 3:2 - for example 440 Hz up to 660 Hz. That 3:2 turns up here as the gap between the 2nd and 3rd partials (220→330). It's the same 3:2 that makes <b>two-thirds of a string</b> sound a 5th - see <i>A string over a box</i> for the length side of the story.</p>`));
    }

    function buildThreeMinors(host) {
      host.appendChild(lessonCard(`
        <p><b>The problem minor has to solve.</b> In a major key the 7th note is a semitone below the tonic - a <b>leading note</b> that pulls strongly home. The natural minor's 7th sits a whole tone below, so it lacks that pull. The three forms of minor are three answers to that one problem.</p>
        <p><b>Natural</b> keeps the key signature untouched (no leading note). <b>Harmonic</b> raises the 7th to get the leading note - but that opens a yawning <b>augmented 2nd</b> between the (unraised) 6th and the raised 7th. <b>Melodic</b> raises the 6th as well on the way up to close that gap, then drops both back to natural minor on the way down. Hear all three in A minor:</p>`));

      // --- Comparison grid ---
      const gridCard = C.el(`<div class="card"></div>`);
      gridCard.appendChild(C.el(`<h3 style="margin-top:0">All three forms at a glance (A minor)</h3>`));
      // Rows: [label, deg1..deg7, note about alteration]
      const gridRows = [
        { label: "Natural",   notes: ["A", "B", "C", "D", "E", "F", "G"],  raised: [] },
        { label: "Harmonic",  notes: ["A", "B", "C", "D", "E", "F", "G♯"], raised: [6], aug2: [5, 6] },
        { label: "Melodic ↑", notes: ["A", "B", "C", "D", "E", "F♯", "G♯"], raised: [5, 6] },
      ];
      const DEGREE_HEADS = ["1", "2", "♭3", "4", "5", "6", "7"];
      let tableHTML = `<div class="ref-table-wrap"><table class="scale-grid">
        <thead><tr><th></th>${DEGREE_HEADS.map((d) => `<th>${d}</th>`).join("")}</tr></thead>
        <tbody>`;
      gridRows.forEach(({ label, notes, raised = [], aug2 = [] }) => {
        tableHTML += `<tr><td>${label}</td>`;
        notes.forEach((note, i) => {
          const isRaised = raised.includes(i);
          const isAug2 = aug2.includes(i);
          const cls = isAug2 ? "sg-aug2" : isRaised ? "sg-alt" : "";
          tableHTML += `<td><span class="${cls}">${note}</span></td>`;
        });
        tableHTML += `</tr>`;
      });
      tableHTML += `</tbody></table></div>`;
      tableHTML += `<p class="muted" style="font-size:.82rem;margin:8px 0 0"><span class="sg-alt" style="padding:1px 6px;border-radius:3px">raised</span> &nbsp;<span class="sg-aug2" style="padding:1px 6px;border-radius:3px">aug 2nd gap</span></p>`;
      gridCard.appendChild(C.el(tableHTML));
      host.appendChild(gridCard);
      const forms = [
        { type: "naturalMinor", title: "Natural minor", note: "The 7th (G) is a whole tone below A, so it doesn't lead home." },
        { type: "harmonicMinor", title: "Harmonic minor", note: "The raised 7th (G♯) leads to A - but F to G♯ is an augmented 2nd, the exotic-sounding gap." },
        { type: "melodicMinorAsc", title: "Melodic minor (ascending)", note: "Raising the 6th too (F♯) removes the gap; descending, it reverts to natural minor." },
      ];
      forms.forEach((form) => {
        const card = C.el(`<div class="card"></div>`);
        card.appendChild(C.el(`<h3 style="margin-top:0">${form.title}</h3>`));
        card.appendChild(C.el(`<div class="staff-wrap">${N.staffHTML({ clef: "treble", notes: M.scale("A", form.type) })}</div>`));
        card.appendChild(C.el(`<p class="muted" style="font-size:.9rem">${form.note}</p>`));
        const row = controls();
        row.appendChild(playBtn("Hear it", () => A.sequence(M.scale("A", form.type))));
        card.appendChild(row);
        host.appendChild(card);
      });

      // Do it yourself: raise the 7th of A natural minor to reach harmonic minor.
      const diyCard = C.el(`<div class="card"></div>`);
      diyCard.appendChild(C.el(`<h3 style="margin-top:0">Raise the 7th yourself</h3>`));
      diyCard.appendChild(C.el(`<p class="muted" style="font-size:.9rem">This is <b>A natural minor</b>. Move to the 7th note (G) with ← →, then press <b>Shift+↑</b> to sharpen it. Watch it become the leading note of A harmonic minor.</p>`));
      const diyCaption = C.el(`<div class="iv-display muted" aria-live="polite"></div>`);
      const gSharp = M.scale("A", "harmonicMinor")[6];
      const diyEditor = SE.create({
        clef: "treble",
        columns: M.scale("A", "naturalMinor").map((n) => [n]),
        editableCols: [6],
        range: TREBLE_RANGE,
        label: "The A natural minor scale, with the seventh note editable",
        onChange: describeMinor,
      });
      function describeMinor() {
        const seventh = diyEditor.getNotes()[6];
        if (M.spelledName(seventh) === M.spelledName(gSharp)) {
          diyCaption.innerHTML = `<b>${M.spelledName(seventh)}</b> is now a semitone below A - the <b>leading note</b> of A harmonic minor. But look at the gap to F: an <b>augmented 2nd</b>.`;
        } else {
          diyCaption.innerHTML = `The 7th is <b>${M.spelledName(seventh)}</b>, a whole tone below A - no pull home yet. Sharpen it with Shift+↑.`;
        }
      }
      diyCard.appendChild(diyEditor.el);
      const diyRow = controls();
      diyRow.appendChild(playBtn("Hear it", () => A.sequence(diyEditor.getNotes())));
      diyCard.appendChild(diyRow);
      diyCard.appendChild(diyCaption);
      describeMinor();
      host.appendChild(diyCard);
    }

    function buildBuildTriads(host) {
      host.appendChild(lessonCard(`
        <p><b>A triad is three notes stacked in 3rds.</b> Take a root, add the note a 3rd above, then the note a 3rd above that (a 5th above the root). The <i>quality</i> - major, minor, diminished, augmented - depends only on the size of those two 3rds. Build one below and hear the colour change as you move the notes.</p>`));
      const card = C.el(`<div class="card"></div>`);
      card.appendChild(C.el(`<h3 style="margin-top:0">Stack the thirds</h3>`));
      card.appendChild(C.el(`<p class="muted" style="font-size:.9rem">Three noteheads are stacked in one column. Use ← → to pick one, ↑ ↓ to move it, and Shift+↑ ↓ for sharps and flats. Try turning a major triad minor by lowering the middle note a semitone.</p>`));
      const caption = C.el(`<div class="iv-display muted" aria-live="polite"></div>`);
      const editor = SE.create({
        clef: "treble",
        columns: [M.chordTriad(M.spelled("C", 0, 4), "major")],
        editableCols: [0],
        range: TREBLE_RANGE,
        label: "Three stacked noteheads to build a triad",
        onChange: describeTriad,
      });
      function describeTriad() {
        const notes = byPitch(editor.getNotes());
        const names = notes.map((n) => M.spelledName(n)).join(" - ");
        const quality = M.triadQuality(notes);
        if (quality === "unknown") {
          caption.innerHTML = `<b>${names}</b> - not a recognisable triad yet. Stack the three notes evenly in 3rds.`;
        } else {
          caption.innerHTML = `<b>${names}</b> - a <b>${quality}</b> triad (root ${M.spelledName(notes[0])}).`;
        }
      }
      card.appendChild(editor.el);
      const row = controls();
      row.appendChild(playBtn("Play chord", () => A.chord(editor.getNotes())));
      row.appendChild(playBtn("Arpeggiate", () => A.sequence(byPitch(editor.getNotes()), 0.28, 0.34)));
      card.appendChild(row);
      card.appendChild(caption);
      describeTriad();
      host.appendChild(card);

      host.appendChild(lessonCard(`
        <p><b>The four qualities.</b> A <b>major</b> triad is a major 3rd then a minor 3rd; a <b>minor</b> triad flips them (minor then major); a <b>diminished</b> triad stacks two minor 3rds (both notes pulled in); an <b>augmented</b> triad stacks two major 3rds (both pushed out). Everything harmony does is built from these four shapes.</p>`));
    }

    function buildModes(host) {
      host.appendChild(lessonCard(`
        <p><b>What a mode is.</b> Take the seven white notes and treat a different one as "home" each time. The notes are identical; only the starting point - the tonic - moves. That shift changes which intervals land where, and so changes the whole character. Major (Ionian) and natural minor (Aeolian) are just two of the seven.</p>
        <p><b>The trick to hearing them.</b> Compare each mode to the major or minor scale it's closest to and listen for the one note that differs - its <b>characteristic note</b>. Lydian is major with a sharp 4th; Mixolydian is major with a flat 7th; Dorian is minor with a raised 6th; Phrygian is minor with a flat 2nd. Play them and listen for it:</p>`));
      const modes = [
        { root: "C", type: "ionian", name: "Ionian", char: "the major scale - bright, resolved" },
        { root: "D", type: "dorian", name: "Dorian", char: "minor with a raised 6th - cool, jazzy" },
        { root: "E", type: "phrygian", name: "Phrygian", char: "minor with a flat 2nd - dark, Spanish" },
        { root: "F", type: "lydian", name: "Lydian", char: "major with a sharp 4th - dreamy, floating" },
        { root: "G", type: "mixolydian", name: "Mixolydian", char: "major with a flat 7th - bluesy, folk" },
        { root: "A", type: "aeolian", name: "Aeolian", char: "the natural minor scale" },
        { root: "B", type: "locrian", name: "Locrian", char: "diminished - unstable, rarely a home key" },
      ];
      const card = C.el(`<div class="card"></div>`);
      const out = C.el(`<div class="staff-wrap" id="mode-staff">${N.staffHTML({ clef: "treble", notes: M.scale("C", "ionian") })}</div>`);
      const caption = C.el(`<p class="muted" id="mode-caption" aria-live="polite" style="font-size:.9rem">C Ionian - the major scale - bright, resolved</p>`);
      const list = C.el(`<div class="explainer-controls"></div>`);
      modes.forEach((m) => {
        const b = document.createElement("button");
        b.className = "audio-btn";
        b.type = "button";
        b.textContent = `${m.root} ${m.name}`;
        b.addEventListener("click", () => {
          [...list.children].forEach((c) => c.classList.remove("sel"));
          b.classList.add("sel");
          out.innerHTML = N.staffHTML({ clef: "treble", notes: M.scale(m.root, m.type) });
          caption.innerHTML = `<b>${m.root} ${m.name}</b> - ${m.char}`;
          A.sequence(M.scale(m.root, m.type));
        });
        list.appendChild(b);
      });
      card.appendChild(list);
      card.appendChild(out);
      card.appendChild(caption);
      host.appendChild(card);

      // --- Modes comparison grid (all from C for easy comparison) ---
      const gridCard = C.el(`<div class="card"></div>`);
      gridCard.appendChild(C.el(`<h3 style="margin-top:0">All seven modes from C</h3>`));
      gridCard.appendChild(C.el(`<p class="muted" style="font-size:.9rem">Ionian (C major) is the reference. <span class="sg-char" style="padding:1px 6px;border-radius:3px">characteristic</span> marks the one note that defines each mode's sound. <span class="sg-alt" style="padding:1px 6px;border-radius:3px">altered</span> shows other differences from C major.</p>`));
      // Each mode's notes from C, and which degree is the characteristic note
      const modeGrid = [
        { name: "Ionian",     notes: ["C","D","E","F","G","A","B"],     altered: [],      char: null },
        { name: "Dorian",     notes: ["C","D","E♭","F","G","A","B♭"],   altered: [2, 6],  char: 5 },
        { name: "Phrygian",   notes: ["C","D♭","E♭","F","G","A♭","B♭"], altered: [1,2,5,6], char: 1 },
        { name: "Lydian",     notes: ["C","D","E","F♯","G","A","B"],    altered: [3],     char: 3 },
        { name: "Mixolydian", notes: ["C","D","E","F","G","A","B♭"],    altered: [6],     char: 6 },
        { name: "Aeolian",    notes: ["C","D","E♭","F","G","A♭","B♭"],  altered: [2,5,6], char: 2 },
        { name: "Locrian",    notes: ["C","D♭","E♭","F","G♭","A♭","B♭"], altered: [1,2,4,5,6], char: 4 },
      ];
      const HEADS = ["1","2","3","4","5","6","7"];
      let tHTML = `<div class="ref-table-wrap"><table class="scale-grid">
        <thead><tr><th>Mode</th>${HEADS.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
        <tbody>`;
      modeGrid.forEach(({ name, notes, altered, char }) => {
        tHTML += `<tr><td>${name}</td>`;
        notes.forEach((note, i) => {
          const isChar = i === char;
          const isAltered = altered.includes(i) && !isChar;
          const cls = isChar ? "sg-char" : isAltered ? "sg-alt" : "";
          tHTML += `<td><span class="${cls}">${note}</span></td>`;
        });
        tHTML += `</tr>`;
      });
      tHTML += `</tbody></table></div>`;
      gridCard.appendChild(C.el(tHTML));
      host.appendChild(gridCard);
    }

    function buildNoteValues(host) {
      const piano = global.MTT.audioPiano;
      if (piano && piano.preload) piano.preload();
      host.appendChild(lessonCard(`
        <p><b>Duration as proportion.</b> Note values are a hierarchy: each level is exactly half the one above. A <b>semibreve</b> lasts as long as <b>two minims</b>, four crotchets, eight quavers, or sixteen semiquavers. The diagram below shows this as proportional bars - each row is the same total length. Click any bar to hear a rhythm at that subdivision.</p>`));

      const BASE_NOTE = "A4";

      const rows = [
        { cls: "nt-semi",      count: 1,  label: "Semibreve",    step: 2.4, dur: 2.2 },
        { cls: "nt-minim",     count: 2,  label: "Minim",        step: 1.2, dur: 1.1 },
        { cls: "nt-crot",      count: 4,  label: "Crotchet",     step: 0.6, dur: 0.55 },
        { cls: "nt-quav",      count: 8,  label: "Quaver",       step: 0.3, dur: 0.26 },
        { cls: "nt-semi-quav", count: 16, label: "Semiquaver",   step: 0.15, dur: 0.12 },
      ];
      const SHORT_LABELS = ["Semibreve", "Minim ×2", "Crotchet ×4", "Quaver ×8", "Semiquaver ×16"];

      const card = C.el(`<div class="card"></div>`);
      card.appendChild(C.el(`<h3 style="margin-top:0">Note value tree — click a row to hear it</h3>`));
      const tree = C.el(`<div class="note-tree" role="group" aria-label="Note value tree"></div>`);

      rows.forEach(({ cls, count, label, step, dur }, ri) => {
        const row = C.el(`<div class="nt-row"></div>`);
        const notes = Array(count).fill(BASE_NOTE);
        for (let i = 0; i < count; i++) {
          const bar = document.createElement("button");
          bar.type = "button";
          bar.className = `nt-bar ${cls}`;
          bar.setAttribute("aria-label", `${label} (${count} per semibreve) - click to hear`);
          if (i === 0) bar.textContent = SHORT_LABELS[ri];
          bar.addEventListener("click", () => A.sequence(notes, step, dur));
          row.appendChild(bar);
        }
        tree.appendChild(row);
      });

      card.appendChild(tree);
      card.appendChild(C.el(`<p class="muted" style="font-size:.82rem;margin-top:10px">Each row is the same total duration as the others. Click any row to hear one semibreve worth of that subdivision.</p>`));
      host.appendChild(card);

      // Dotted notes supplement
      const dotCard = C.el(`<div class="card"></div>`);
      dotCard.appendChild(C.el(`<h3 style="margin-top:0">Dotted notes: adding half again</h3>`));
      dotCard.appendChild(C.el(`<p class="muted" style="font-size:.9rem">A dot after a note adds <b>half its value</b>. A dotted crotchet (1½ beats) pairs naturally with a quaver (½ beat) to fill 2 beats. In <b>compound time</b> (6/8, 9/8, 12/8) the beat is a dotted crotchet throughout.</p>`));

      const dotTree = C.el(`<div class="note-tree"></div>`);
      // Row showing: dotted crotchet (3 quaver-lengths) + quaver (1 quaver-length) = 4 quaver-lengths
      const dotRow = C.el(`<div class="nt-dotted-row" style="margin-top:6px"></div>`);

      const dotBar = document.createElement("button");
      dotBar.type = "button";
      dotBar.className = "nt-dotted-bar";
      dotBar.textContent = "Dotted crotchet (1½ beats)";
      dotBar.style.flex = "3 3 0";
      dotBar.addEventListener("click", () => A.note(BASE_NOTE, 0.84));
      dotRow.appendChild(dotBar);

      const qBar = document.createElement("button");
      qBar.type = "button";
      qBar.className = "nt-dotted-bar nt-half";
      qBar.textContent = "Quaver (½)";
      qBar.style.flex = "1 1 0";
      qBar.addEventListener("click", () => A.note(BASE_NOTE, 0.28));
      dotRow.appendChild(qBar);

      dotTree.appendChild(dotRow);

      // Compare: 2 plain crotchets = same total
      const crotRow = C.el(`<div class="nt-dotted-row"></div>`);
      for (let i = 0; i < 2; i++) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "nt-dotted-bar";
        b.textContent = `Crotchet (1 beat)`;
        b.style.flex = "2 2 0";
        b.addEventListener("click", () => A.sequence([BASE_NOTE, BASE_NOTE], 0.6, 0.55));
        crotRow.appendChild(b);
      }
      dotTree.appendChild(crotRow);

      dotCard.appendChild(C.el(`<p class="muted" style="font-size:.84rem">Top row: dotted crotchet + quaver = 2 beats. Bottom row: 2 plain crotchets = 2 beats. Same total length, different feel.</p>`));
      dotCard.appendChild(dotTree);
      const dotRow2 = controls();
      dotRow2.appendChild(playBtn("Hear dotted crotchet + quaver", () => A.sequenceRhythm([BASE_NOTE, BASE_NOTE], [1.5, 0.5], 0.6)));
      dotRow2.appendChild(playBtn("Hear 2 crotchets", () => A.sequenceRhythm([BASE_NOTE, BASE_NOTE], [1, 1], 0.6)));
      dotCard.appendChild(dotRow2);
      host.appendChild(dotCard);
    }

    function buildFourClefs(host) {
      host.appendChild(lessonCard(`
        <p><b>Why four clefs?</b> A clef fixes one line of the staff to a known pitch. Move the clef and middle C moves with it. The treble and bass clefs are fixed (G clef and F clef); the alto and tenor are both C clefs that anchor middle C on different lines.</p>
        <p><b>Middle C is the anchor.</b> It appears on a ledger line below the treble staff, a ledger line above the bass staff, the middle (3rd) line of the alto staff, and the 4th line of the tenor staff. Pick any note below and see where it sits in all four clefs at once.</p>`));

      // Pitches available for comparison (C3 to D5)
      const pickerNotes = [
        { label: "C3", note: M.spelled("C", 0, 3) },
        { label: "G3", note: M.spelled("G", 0, 3) },
        { label: "B3", note: M.spelled("B", 0, 3) },
        { label: "C4 (mid C)", note: M.spelled("C", 0, 4) },
        { label: "E4", note: M.spelled("E", 0, 4) },
        { label: "G4", note: M.spelled("G", 0, 4) },
        { label: "B4", note: M.spelled("B", 0, 4) },
        { label: "C5", note: M.spelled("C", 0, 5) },
        { label: "D5", note: M.spelled("D", 0, 5) },
      ];
      const CLEFS = ["treble", "bass", "alto", "tenor"];
      const CLEF_LABELS = ["Treble", "Bass", "Alto", "Tenor"];

      const card = C.el(`<div class="card"></div>`);
      card.appendChild(C.el(`<h3 style="margin-top:0">Same note, four clefs</h3>`));

      const picker = C.el(`<div class="clef-note-picker" role="group" aria-label="Choose a note"></div>`);
      card.appendChild(picker);

      const stavesDiv = C.el(`<div class="four-clefs"></div>`);
      card.appendChild(stavesDiv);

      const playRow = C.el(`<div class="explainer-controls"></div>`);
      card.appendChild(playRow);

      let currentNote = pickerNotes[3].note; // default: middle C

      function buildStaves(note) {
        C.clear(stavesDiv);
        CLEFS.forEach((clef, i) => {
          const row = C.el(`<div class="clef-row"></div>`);
          row.appendChild(C.el(`<div class="clef-row-label">${CLEF_LABELS[i]}</div>`));
          row.appendChild(C.el(`<div class="staff-wrap">${N.staffHTML({ clef, notes: [note] })}</div>`));
          stavesDiv.appendChild(row);
        });
        C.clear(playRow);
        playRow.appendChild(playBtn("Hear it", () => A.sequence([note])));
      }

      pickerNotes.forEach(({ label, note }) => {
        const btn = document.createElement("button");
        btn.className = "clef-note-btn";
        btn.type = "button";
        btn.textContent = label;
        const isDefault = label === "C4 (mid C)";
        if (isDefault) btn.classList.add("sel");
        btn.addEventListener("click", () => {
          [...picker.querySelectorAll(".clef-note-btn")].forEach((b) => b.classList.remove("sel"));
          btn.classList.add("sel");
          currentNote = note;
          buildStaves(note);
        });
        picker.appendChild(btn);
      });

      buildStaves(currentNote);
      host.appendChild(card);

      // Where the shapes came from: each clef is a stylised letter sitting on
      // the line of the note it names.
      const originCard = C.el(`<div class="card"></div>`);
      originCard.appendChild(C.el(`<h3 style="margin-top:0">The shapes are stylised letters</h3>`));
      originCard.appendChild(C.el(`<p class="muted" style="font-size:.9rem">Medieval scribes fixed pitch by writing a plain letter on one staff line. Over centuries those letters hardened into today's clef symbols - and each one still names a note by sitting on its line. The note shown in each staff below is exactly the letter the clef came from.</p>`));
      const origins = [
        { letter: "G", clef: "treble", note: M.spelled("G", 0, 4), cap: "Treble clef: an ornate <b>G</b>, its curl circling the <b>G</b> line" },
        { letter: "F", clef: "bass", note: M.spelled("F", 0, 3), cap: "Bass clef: an <b>F</b>, its two dots straddling the <b>F</b> line" },
        { letter: "C", clef: "alto", note: M.spelled("C", 0, 4), cap: "C clef: a <b>C</b> centred on <b>middle C</b> (here the alto line)" },
      ];
      const originGrid = C.el(`<div class="clef-origins"></div>`);
      origins.forEach((o) => {
        const row = C.el(`<div class="clef-origin-row"></div>`);
        row.appendChild(C.el(`<div class="clef-origin-letter" aria-hidden="true">${o.letter}</div>`));
        row.appendChild(C.el(`<div class="clef-origin-arrow" aria-hidden="true">→</div>`));
        row.appendChild(C.el(`<div class="staff-wrap clef-origin-staff">${N.staffHTML({ clef: o.clef, notes: [o.note] })}</div>`));
        row.appendChild(C.el(`<div class="clef-origin-cap">${o.cap}</div>`));
        originGrid.appendChild(row);
      });
      originCard.appendChild(originGrid);
      host.appendChild(originCard);

      host.appendChild(lessonCard(`
        <p><b>Which instruments use which clef?</b> Treble: violin, flute, right-hand piano, high voices (soprano, alto). Modern choral tenor also reads treble clef, transposed an octave down. Bass: cello, bassoon, trombone, tuba, left-hand piano, bass voice. Alto (C clef on 3rd line): viola. Tenor (C clef on 4th line): upper range of cello, bassoon, trombone.</p>
        <p><b>The trick.</b> For each clef, find middle C first. Once you know where C4 is, every other note is just counting up or down by letter - the same as treble or bass, just starting from a different anchor.</p>`));
    }

    function buildKeyboard(host) {
      const piano = global.MTT.audioPiano;
      if (piano && piano.preload) piano.preload();
      host.appendChild(lessonCard(`
        <p><b>Semitones are the building blocks.</b> A semitone is the distance between any two adjacent keys on the piano - white or black, no skipping. Count the semitones between two notes and you know the interval. <b>Two semitones</b> = a tone (major 2nd). <b>Seven</b> = a perfect 5th. <b>Twelve</b> = an octave.</p>
        <p><b>How to use this.</b> Click one key to set the lower note, then another to set the upper. The interval name and semitone count appear below the keyboard. Click any highlighted key to hear it, or use the play buttons.</p>`));

      const INTERVAL_NAMES = [
        "unison", "minor 2nd", "major 2nd", "minor 3rd", "major 3rd",
        "perfect 4th", "tritone", "perfect 5th", "minor 6th", "major 6th",
        "minor 7th", "major 7th", "octave", "minor 9th", "major 9th",
        "minor 10th", "major 10th", "perfect 11th", "aug 11th / dim 12th",
        "perfect 12th", "minor 13th", "major 13th", "minor 14th", "major 14th",
        "double octave",
      ];
      const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
      const BLACK_PCS = new Set([1, 3, 6, 8, 10]);

      function midiLabel(midi) {
        const pc = midi % 12, oct = Math.floor(midi / 12) - 1;
        return NOTE_NAMES[pc] + oct;
      }

      const card = C.el(`<div class="card"></div>`);
      card.appendChild(C.el(`<h3 style="margin-top:0">Pick two notes</h3>`));

      const kbWrap = C.el(`<div class="iv-kb-wrap"><div class="iv-kb" role="group" aria-label="Two-octave keyboard for exploring intervals"></div></div>`);
      const kb = kbWrap.querySelector(".iv-kb");
      const keyEls = [];

      for (let midi = 60; midi <= 84; midi++) {
        const isBlack = BLACK_PCS.has(midi % 12);
        const key = document.createElement("button");
        key.type = "button";
        key.className = "iv-key" + (isBlack ? " black" : "");
        key.dataset.midi = String(midi);
        key.setAttribute("aria-label", midiLabel(midi));
        key.addEventListener("click", () => pickMidi(midi));
        kb.appendChild(key);
        keyEls.push(key);
      }
      card.appendChild(kbWrap);

      const display = C.el(`<div class="iv-display muted" aria-live="polite">Click a key to choose a starting note.</div>`);
      card.appendChild(display);

      const btns = C.el(`<div class="explainer-controls"></div>`);
      card.appendChild(btns);

      let fromMidi = null, toMidi = null;

      function pickMidi(midi) {
        if (fromMidi === null || toMidi !== null) {
          fromMidi = midi; toMidi = null;
        } else if (midi !== fromMidi) {
          toMidi = midi;
        }
        refresh();
      }

      function refresh() {
        keyEls.forEach((k) => {
          const m = parseInt(k.dataset.midi, 10);
          k.classList.remove("iv-from", "iv-to", "iv-span");
          if (m === fromMidi) { k.classList.add("iv-from"); }
          else if (m === toMidi) { k.classList.add("iv-to"); }
          else if (fromMidi !== null && toMidi !== null) {
            const lo = Math.min(fromMidi, toMidi), hi = Math.max(fromMidi, toMidi);
            if (m > lo && m < hi) k.classList.add("iv-span");
          }
        });

        C.clear(btns);
        if (fromMidi === null) {
          display.innerHTML = `<span>Click a key to choose a starting note.</span>`;
          return;
        }
        const fromLabel = midiLabel(fromMidi);
        if (toMidi === null) {
          display.innerHTML = `<b>${fromLabel}</b> selected &mdash; now click a second note.`;
          btns.appendChild(playBtn(fromLabel, () => A.note(fromMidi, 1.0)));
          const clearBtn = C.button("Clear", () => { fromMidi = null; toMidi = null; refresh(); }, { className: "btn ghost" });
          btns.appendChild(clearBtn);
          return;
        }
        const semis = Math.abs(toMidi - fromMidi);
        const loMidi = Math.min(fromMidi, toMidi), hiMidi = Math.max(fromMidi, toMidi);
        const loLabel = midiLabel(loMidi), hiLabel = midiLabel(hiMidi);
        const name = INTERVAL_NAMES[semis] || (semis + " semitones");
        display.innerHTML = `<b>${name}</b> &mdash; ${loLabel} to ${hiLabel} &middot; ${semis} semitone${semis !== 1 ? "s" : ""}`;
        btns.appendChild(playBtn(loLabel, () => A.note(loMidi, 0.9)));
        btns.appendChild(playBtn(hiLabel, () => A.note(hiMidi, 0.9)));
        btns.appendChild(playBtn("Together", () => A.chord([loMidi, hiMidi], 1.8)));
        btns.appendChild(playBtn("In turn", () => A.sequence([loMidi, hiMidi], 0.7, 0.7)));
        const clearBtn = C.button("Clear", () => { fromMidi = null; toMidi = null; refresh(); }, { className: "btn ghost" });
        btns.appendChild(clearBtn);
      }

      host.appendChild(card);

      // Build the interval on a staff (the notation counterpart of the keyboard).
      const buildCard = C.el(`<div class="card"></div>`);
      buildCard.appendChild(C.el(`<h3 style="margin-top:0">Now build it on the staff</h3>`));
      buildCard.appendChild(C.el(`<p class="muted" style="font-size:.9rem">Move either notehead with the arrow keys (Shift+↑ ↓ for sharps and flats). The interval is named as you build it - the spelling matters, so C–E♯ and C–F are told apart.</p>`));
      const ivCaption = C.el(`<div class="iv-display muted" aria-live="polite"></div>`);
      const ivEditor = SE.create({
        clef: "treble",
        columns: [[M.spelled("C", 0, 4)], [M.spelled("E", 0, 4)]],
        editableCols: [0, 1],
        range: TREBLE_RANGE,
        label: "Two notes to build an interval on a treble staff",
        onChange: describeInterval,
      });
      function describeInterval() {
        const [a, b] = ivEditor.getNotes();
        if (M.spelledToMidi(a) === M.spelledToMidi(b)) {
          ivCaption.innerHTML = `<b>${M.spelledName(a)}</b> and <b>${M.spelledName(b)}</b> - a <b>unison</b> (0 semitones).`;
          return;
        }
        const lo = M.spelledToMidi(a) < M.spelledToMidi(b) ? a : b;
        const hi = lo === a ? b : a;
        const iv = M.interval(lo, hi);
        ivCaption.innerHTML = `<b>${M.spelledName(lo)}</b> up to <b>${M.spelledName(hi)}</b>: <b>${iv.name}</b> (${Math.abs(iv.semitones)} semitone${Math.abs(iv.semitones) === 1 ? "" : "s"}).`;
      }
      buildCard.appendChild(ivEditor.el);
      const ivRow = controls();
      ivRow.appendChild(playBtn("Play together", () => A.chord(ivEditor.getNotes())));
      ivRow.appendChild(playBtn("Play in turn", () => A.sequence(byPitch(ivEditor.getNotes()))));
      buildCard.appendChild(ivRow);
      buildCard.appendChild(ivCaption);
      describeInterval();
      host.appendChild(buildCard);

      // Quick reference table of all simple intervals
      host.appendChild(lessonCard(`
        <p><b>Simple interval quick reference (within one octave)</b></p>
        <div class="ref-table-wrap"><table class="ref-table">
          <thead><tr><th>Semitones</th><th>Name</th><th>Example</th></tr></thead>
          <tbody>
            <tr><td class="ref-key">0</td><td>Unison</td><td>C – C</td></tr>
            <tr><td class="ref-key">1</td><td>Minor 2nd (semitone)</td><td>C – D♭</td></tr>
            <tr><td class="ref-key">2</td><td>Major 2nd (tone)</td><td>C – D</td></tr>
            <tr><td class="ref-key">3</td><td>Minor 3rd</td><td>C – E♭</td></tr>
            <tr><td class="ref-key">4</td><td>Major 3rd</td><td>C – E</td></tr>
            <tr><td class="ref-key">5</td><td>Perfect 4th</td><td>C – F</td></tr>
            <tr><td class="ref-key">6</td><td>Tritone (aug 4th / dim 5th)</td><td>C – F♯/G♭</td></tr>
            <tr><td class="ref-key">7</td><td>Perfect 5th</td><td>C – G</td></tr>
            <tr><td class="ref-key">8</td><td>Minor 6th</td><td>C – A♭</td></tr>
            <tr><td class="ref-key">9</td><td>Major 6th</td><td>C – A</td></tr>
            <tr><td class="ref-key">10</td><td>Minor 7th</td><td>C – B♭</td></tr>
            <tr><td class="ref-key">11</td><td>Major 7th</td><td>C – B</td></tr>
            <tr><td class="ref-key">12</td><td>Octave</td><td>C – C</td></tr>
          </tbody>
        </table></div>`));
    }

  }

  // ---------------------------------------------------------------------------
  // Shared diagram helpers
  // ---------------------------------------------------------------------------

  function partialRuler() {
    // Vertical log-scale ruler showing 8 partials of A2 (110 Hz).
    // Log scale: pitch height is proportional to log2(freq).
    const partials = [
      { n: 1, note: "A", hz: 110 },
      { n: 2, note: "A", hz: 220 },
      { n: 3, note: "E", hz: 330 },
      { n: 4, note: "A", hz: 440 },
      { n: 5, note: "C♯", hz: 550 },
      { n: 6, note: "E", hz: 660 },
      { n: 7, note: "G", hz: 770 },
      { n: 8, note: "A", hz: 880 },
    ];
    const GAP_LABELS = ["octave", "P5", "P4", "M3", "m3", "~m3", "M2"];

    // Map log2(hz) to y pixel. High pitch = small y (top of SVG).
    const logMin = Math.log2(110), logMax = Math.log2(880); // 3 octaves
    const TOP = 14, BOT = 286, HEIGHT = BOT - TOP;
    const toY = (hz) => TOP + (1 - (Math.log2(hz) - logMin) / (logMax - logMin)) * HEIGHT;
    const r2 = (n) => Math.round(n * 10) / 10;

    const X_AXIS = 52, X_TICK_END = 60, X_DOT = 60, X_NOTE = 44, X_BRACKET = 72, X_HZ = 170;

    let rows = "";
    partials.forEach(({ note, hz }, i) => {
      const y = r2(toY(hz));
      rows += `<line x1="${X_AXIS}" y1="${y}" x2="${X_TICK_END + 4}" y2="${y}" class="prs-tick"/>`;
      rows += `<circle cx="${X_DOT}" cy="${y}" r="5" class="prs-dot"/>`;
      rows += `<text x="${X_NOTE}" y="${y + 4}" text-anchor="end" class="prs-label">${note}</text>`;
      rows += `<text x="${X_HZ}" y="${y + 4}" class="prs-hz">×${i + 1}  ${hz} Hz</text>`;
    });

    // Bracket annotations between consecutive partials
    let brackets = "";
    for (let i = 0; i < 7; i++) {
      const y1 = r2(toY(partials[i].hz));
      const y2 = r2(toY(partials[i + 1].hz));
      const midY = r2((y1 + y2) / 2);
      brackets += `<line x1="${X_BRACKET}" y1="${y1}" x2="${X_BRACKET}" y2="${y2}" class="prs-bracket"/>`;
      brackets += `<line x1="${X_BRACKET}" y1="${y1}" x2="${X_BRACKET - 4}" y2="${y1}" class="prs-bracket"/>`;
      brackets += `<line x1="${X_BRACKET}" y1="${y2}" x2="${X_BRACKET - 4}" y2="${y2}" class="prs-bracket"/>`;
      brackets += `<text x="${X_BRACKET + 4}" y="${midY + 4}" class="prs-interval">${GAP_LABELS[i]}</text>`;
    }

    return `<div class="partial-ruler">
<svg viewBox="0 0 220 300" class="partial-ruler-svg" role="img"
  aria-label="Pitch ruler showing 8 partials on a logarithmic scale. Gaps decrease from octave at bottom to major 2nd at top.">
  <line x1="${X_AXIS}" y1="${TOP}" x2="${X_AXIS}" y2="${BOT}" class="prs-axis"/>
  ${rows}
  ${brackets}
</svg></div>`;
  }

  function commaSpiral() {
    // Static SVG: 12 pitch classes as nodes around a near-circle.
    // The 12th P5 step overshoots C by the Pythagorean comma (exaggerated to 20° for visibility).
    const CX = 150, CY = 148, R = 112;
    // Note names in cycle-of-5ths order
    const KEYS = ["C", "G", "D", "A", "E", "B", "F♯", "D♭", "A♭", "E♭", "B♭", "F"];
    // Nodes at exactly 30° intervals (equal-temperament positions - readable)
    const toRad = (d) => d * Math.PI / 180;
    const nodes = KEYS.map((key, k) => {
      const a = toRad(k * 30 - 90);
      return { key, x: CX + R * Math.cos(a), y: CY + R * Math.sin(a) };
    });

    // Arrival point: 20° clockwise past C (exaggerated comma)
    const GAP_DEG = 20;
    const arrivalA = toRad(-90 + 360 + GAP_DEG);
    const ax = CX + R * Math.cos(arrivalA), ay = CY + R * Math.sin(arrivalA);

    // C position (node 0)
    const { x: cx0, y: cy0 } = nodes[0];

    // Round to 2 dp
    const r2 = (n) => Math.round(n * 100) / 100;

    // Build node circles + labels
    let nodesSVG = "";
    nodes.forEach(({ key, x, y }, k) => {
      const isC = k === 0;
      nodesSVG += `<circle cx="${r2(x)}" cy="${r2(y)}" r="19" class="${isC ? "csp-node csp-c" : "csp-node"}"/>`;
      nodesSVG += `<text x="${r2(x)}" y="${r2(y + 4.5)}" text-anchor="middle" class="csp-label">${key}</text>`;
    });

    // Arrival node (B♯ = C, but sharper)
    nodesSVG += `<circle cx="${r2(ax)}" cy="${r2(ay)}" r="16" class="csp-arrival"/>`;
    nodesSVG += `<text x="${r2(ax)}" y="${r2(ay + 3.8)}" text-anchor="middle" class="csp-arrival-label">B♯</text>`;

    // Gap arc: from arrival (at -90+360+20°) back to C (at -90°), the short 20° counterclockwise arc
    // In SVG sweep-flag=0 = counterclockwise
    const gapArc = `M ${r2(ax)} ${r2(ay)} A ${R} ${R} 0 0 0 ${r2(cx0)} ${r2(cy0)}`;

    // Midpoint of the gap arc (for label placement)
    const midGapA = toRad(-90 + 360 + GAP_DEG / 2);
    const gx = r2(CX + (R + 18) * Math.cos(midGapA));
    const gy = r2(CY + (R + 18) * Math.sin(midGapA));

    return `<div style="display:flex;justify-content:center">
<svg viewBox="0 0 300 310" class="comma-spiral-svg" role="img"
  aria-label="Diagram showing 12 perfect fifth steps that overshoot one full octave circle, creating the Pythagorean comma gap.">
  <circle cx="${CX}" cy="${CY}" r="${R}" class="csp-ref"/>
  <circle cx="${CX}" cy="${CY}" r="28" class="csp-center"/>
  <text x="${CX}" y="${CY + 4}" text-anchor="middle" class="csp-center-label">cycle</text>
  ${nodesSVG}
  <path d="${gapArc}" class="csp-gap"/>
  <text x="${gx}" y="${gy}" text-anchor="middle" class="csp-gap-text">comma</text>
  <text x="${CX}" y="300" text-anchor="middle" class="csp-footnote">← walk 12 pure 5ths clockwise; B♯ overshoots C by the comma →</text>
</svg></div>`;
  }

  const api = { render };

  global.MTT = global.MTT || {};
  global.MTT.ui = global.MTT.ui || {};
  global.MTT.ui.views = global.MTT.ui.views || {};
  global.MTT.ui.views.explainer = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
