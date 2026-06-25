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

    const playBtn = (label, fn) => C.playButton(label, () => { try { fn(); } catch { /* ignore */ } });
    const controls = () => C.el(`<div class="explainer-controls"></div>`);
    const lessonCard = (html) => C.el(`<div class="card lesson">${html}</div>`);

    // Declared before the deep-link branch below, which can call openExplainer
    // immediately. (The build* functions are hoisted function declarations.)
    const builders = {
      monochord: buildMonochord,
      "harmonic-series": buildHarmonicSeries,
      consonance: buildConsonance,
      cents: buildCents,
      timbre: buildTimbre,
      "circle-of-fifths": buildCircleOfFifths,
      temperament: buildTemperament,
      "three-minors": buildThreeMinors,
      modes: buildModes,
      keyboard: buildKeyboard,
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

    const view = C.el(`<div class="view"><h1 tabindex="-1">Explainers</h1><p class="muted">Short interactive explainers - the <i>why</i> behind the theory. Open one and use the buttons to hear it.</p></div>`);
    main.appendChild(view);
    const grid = C.el(`<div class="grid" style="margin-top:18px"></div>`);
    ctx.content.explainers.forEach((e) => {
      grid.appendChild(C.cardButton(`<h3>${e.title}</h3><div class="why">${e.blurb}</div>`, () => ctx.router.navigate("explore", e.id)));
    });
    view.appendChild(grid);

    function openExplainer(e) {
      C.clear(main);
      const v = C.el(`<div class="view"></div>`);
      v.appendChild(C.button("← Back", () => ctx.router.navigate("explore"), { className: "ghost" }));
      v.appendChild(C.el(`<h1 tabindex="-1" style="margin-top:14px">${e.title}</h1>`));
      (builders[e.id] || ((host) => host.appendChild(C.el(`<div class="card"><p class="muted">Coming soon.</p></div>`))))(v);
      main.appendChild(v);
      C.focus(v.querySelector("h1"));
    }

    function buildMonochord(host) {
      host.appendChild(lessonCard(`
        <p><b>Where it all starts.</b> Stretch a single string over a box and pluck it: one note. Now stop the string partway and pluck again - a different note. That's the whole of pitch in one object. The ancient Greeks built exactly this - a <b>monochord</b> - and discovered that the notes that sound <i>good</i> together are the ones where the string is divided into <b>simple whole-number fractions</b>.</p>
        <p><b>Shorter string, higher pitch - length and frequency are inverses.</b> Say the open string sounds <b>A = 220 Hz</b>. Stop it exactly in the middle and the vibrating half goes <b>twice as fast: 440 Hz</b>, an octave up (the 2:1 ratio - the simplest there is, and the most consonant interval). Take <b>two-thirds</b> of the length and the frequency rises to <b>3/2 = 330 Hz</b> - a <b>perfect 5th</b>. Three-quarters of the length gives 4/3 (≈293 Hz, a perfect 4th); four-fifths gives 5/4 (275 Hz, a major 3rd). The simple fractions of <i>length</i> are just the simple <i>frequency ratios</i> turned upside down.</p>
        <p><b>A ratio, not a multiple.</b> A "perfect 5th" is the <b>ratio 3:2 between two notes</b> (220→330 Hz here). Don't confuse it with the harmonic series, where multiplying by 3 (220→660 Hz) lands a whole octave higher - a 12th, not a 5th. Same number, different question. Pick a fraction and watch the string divide:</p>`));

      const base = M.noteToFreq("A3"); // 220 Hz - clean numbers that match the harmonic-series page
      const stops = [
        { label: "Open (1:1)", ratio: 1, note: "A3, 220 Hz - the fundamental" },
        { label: "½ (2:1)", ratio: 2, note: "A4, 440 Hz - an octave up" },
        { label: "⅔ (3:2)", ratio: 3 / 2, note: "E4, 330 Hz - a perfect 5th" },
        { label: "¾ (4:3)", ratio: 4 / 3, note: "D4, ≈293 Hz - a perfect 4th" },
        { label: "⅘ (5:4)", ratio: 5 / 4, note: "C♯4, 275 Hz - a major 3rd" },
      ];

      // The vibrating fraction of the string is 1/ratio; pitch rises as it shortens.
      function diagram(s) {
        const X0 = 40, X1 = 520, Y = 46, L = X1 - X0, amp = 17;
        const f = 1 / s.ratio;
        const stopX = X0 + f * L, mid = X0 + (f * L) / 2;
        const arch = `M ${X0} ${Y} Q ${r(mid)} ${Y - amp} ${r(stopX)} ${Y}`;
        const echo = `M ${X0} ${Y} Q ${r(mid)} ${Y + amp} ${r(stopX)} ${Y}`;
        const damped = f < 1 ? `<line class="damped" x1="${r(stopX)}" y1="${Y}" x2="${X1}" y2="${Y}"/>` : "";
        const bridge = f < 1 ? `<polygon class="bridge" points="${r(stopX - 6)},${Y + 9} ${r(stopX + 6)},${Y + 9} ${r(stopX)},${Y - 1}"/>` : "";
        const label = `Monochord: the vibrating ${s.label.split(" ")[0]} of the string sounds ${s.note}.`;
        return `<svg class="monochord" viewBox="0 0 560 132" role="img" aria-label="${label}">
          <rect class="box" x="26" y="60" width="508" height="56" rx="9"/>
          <circle class="peg" cx="${X0}" cy="${Y}" r="4.5"/><circle class="peg" cx="${X1}" cy="${Y}" r="4.5"/>
          <path class="vibrate echo" d="${echo}"/>
          <path class="vibrate" d="${arch}"/>
          ${damped}${bridge}
          <text x="${X0}" y="128" text-anchor="start">nut</text>
          <text x="${X1}" y="128" text-anchor="end">bridge</text>
        </svg>`;
      }
      function r(n) { return Math.round(n * 10) / 10; }

      const card = C.el(`<div class="card"></div>`);
      card.appendChild(C.el(`<h3 style="margin-top:0">Pluck &amp; divide the string</h3>`));
      const stage = C.el(`<div id="mono-stage">${diagram(stops[0])}</div>`);
      card.appendChild(stage);
      const out = C.el(`<p class="muted" id="mono-caption" aria-live="polite" style="font-size:.92rem">Pick a fraction: watch the string shorten and hear the pitch rise.</p>`);
      const list = C.el(`<div class="explainer-controls"></div>`);
      stops.forEach((s) => {
        const b = playBtn(s.label, () => {
          stage.innerHTML = diagram(s);
          out.innerHTML = `<b>${s.label}</b> &rarr; ${s.note}.`;
          A.freqChord(s.ratio === 1 ? [base] : [base, base * s.ratio], 1.8);
        });
        list.appendChild(b);
      });
      card.appendChild(list);
      card.appendChild(out);
      const row = controls();
      row.appendChild(playBtn("Hear them in turn", () => A.freqSequence(stops.map((s) => base * s.ratio), 0.6, 0.55)));
      card.appendChild(row);
      host.appendChild(card);

      host.appendChild(lessonCard(`
        <p><b>Why simple ratios sound smooth.</b> A vibrating string doesn't only move as a whole - it also vibrates in halves, thirds and quarters at the same time (its <b>overtones</b>). When two notes share a simple ratio, many of their overtones line up exactly and reinforce each other; when the ratio is complex, the overtones clash and you hear a roughness or <i>beating</i>. Consonance and dissonance aren't arbitrary taste - they're arithmetic you can hear.</p>
        <p>That stack of overtones is a whole subject of its own - see <i>The harmonic series</i>.</p>`));
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
        <p><b>The idea.</b> Two notes sound consonant when their frequencies form a simple ratio: an octave is exactly 2:1, a perfect 5th 3:2, a major 3rd 5:4. Tune intervals to those pure ratios - <b>just intonation</b> - and chords lock together without beating.</p>
        <p><b>The problem.</b> Those pure ratios don't agree with each other. Stack enough pure 5ths and you overshoot the octave you should land on (the comma below). So you can't tune a fixed-pitch instrument like a piano to be pure in every key at once - tune it sweet in C and remote keys turn sour.</p>
        <p><b>The fix.</b> <b>Equal temperament</b> divides the octave into twelve <i>equal</i> semitones (each a ratio of the 12th root of 2). Every interval except the octave is now slightly impure - but equally so in every key, so you can play in all of them. The major 3rd is the biggest casualty. Hear it:</p>`));
      const f = M.noteToFreq("C4");

      // --- Comma spiral ---
      const spiralCard = C.el(`<div class="card"></div>`);
      spiralCard.appendChild(C.el(`<h3 style="margin-top:0">The Pythagorean comma: why the circle won't close</h3>`));
      spiralCard.appendChild(C.el(`<p class="muted" style="font-size:.9rem">Walk twelve steps of a <b>pure perfect 5th</b> (3:2 ratio) clockwise around the circle. You should land back on C - but you overshoot by about a quarter of a semitone. That gap is the <b>Pythagorean comma</b>.</p>`));
      spiralCard.appendChild(C.el(commaSpiral()));
      spiralCard.appendChild(C.el(`<p class="muted" style="font-size:.84rem;margin-top:6px">The gap is shown here at 20° for visibility. The real comma is ≈ 0.84° (23.46 cents).</p>`));
      host.appendChild(spiralCard);
      const card = C.el(`<div class="card"></div>`);
      card.appendChild(C.el(`<h3 style="margin-top:0">Hear a major 3rd, two ways</h3>`));
      card.appendChild(C.el(`<p class="muted">C and E together. The pure version sits still; the equal-tempered version beats slightly (listen for the wobble).</p>`));
      const row1 = controls();
      row1.appendChild(playBtn("Just 3rd (5:4, pure)", () => A.freqChord([f, f * 5 / 4], 2.2)));
      row1.appendChild(playBtn("Equal-tempered 3rd", () => A.freqChord([f, f * Math.pow(2, 4 / 12)], 2.2)));
      card.appendChild(row1);
      card.appendChild(C.el(`<p class="muted" style="font-size:.88rem">In cents: just 3rd = 386, equal = 400, Pythagorean = 408. The ear notices ~5 cents, so the 14-cent equal 3rd is a real compromise.</p>`));
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
        <p><b>Where it comes from.</b> Pluck a string and it doesn't only vibrate as a whole - it simultaneously vibrates in halves, thirds, quarters and so on. Each division adds a quieter tone, a <b>partial</b>, at a <b>whole-number multiple</b> of the fundamental's frequency. The mix of partials is what gives every instrument its tone colour.</p>
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
      card.appendChild(C.el(`<p class="muted" style="font-size:.88rem">Partials 4, 5 and 6 (A, C♯, E - 440:550:660 Hz) are a major triad, ready-made, which is why it sounds so settled.</p>`));
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
      host.appendChild(lessonCard(`
        <p><b>Duration as proportion.</b> Note values are a hierarchy: each level is exactly half the one above. A <b>semibreve</b> lasts as long as <b>two minims</b>, four crotchets, eight quavers, or sixteen semiquavers. The diagram below shows this as proportional bars - each row is the same total length. Click any bar to hear a rhythm at that subdivision.</p>`));

      const BASE_FREQ = M.noteToFreq("A4"); // 440 Hz for all rhythmic examples

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
        const freqs = Array(count).fill(BASE_FREQ);
        for (let i = 0; i < count; i++) {
          const bar = document.createElement("button");
          bar.type = "button";
          bar.className = `nt-bar ${cls}`;
          bar.setAttribute("aria-label", `${label} (${count} per semibreve) - click to hear`);
          if (i === 0) bar.textContent = SHORT_LABELS[ri];
          bar.addEventListener("click", () => A.freqSequence(freqs, step, dur));
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
      dotBar.addEventListener("click", () => A.freqSequence([BASE_FREQ], 0, 0.84));
      dotRow.appendChild(dotBar);

      const qBar = document.createElement("button");
      qBar.type = "button";
      qBar.className = "nt-dotted-bar nt-half";
      qBar.textContent = "Quaver (½)";
      qBar.style.flex = "1 1 0";
      qBar.addEventListener("click", () => A.freqSequence([BASE_FREQ], 0, 0.28));
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
        b.addEventListener("click", () => A.freqSequence([BASE_FREQ, BASE_FREQ], 0.6, 0.55));
        crotRow.appendChild(b);
      }
      dotTree.appendChild(crotRow);

      dotCard.appendChild(C.el(`<p class="muted" style="font-size:.84rem">Top row: dotted crotchet + quaver = 2 beats. Bottom row: 2 plain crotchets = 2 beats. Same total length, different feel.</p>`));
      dotCard.appendChild(dotTree);
      const dotRow2 = controls();
      dotRow2.appendChild(playBtn("Hear dotted crotchet + quaver", () => A.freqSequence([BASE_FREQ, BASE_FREQ], 0.9, 0.84)));
      dotRow2.appendChild(playBtn("Hear 2 crotchets", () => A.freqSequence([BASE_FREQ, BASE_FREQ], 0.6, 0.55)));
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
        <p><b>Which instruments use which clef?</b> Treble: violin, flute, right-hand piano, high voices (soprano, alto). Bass: cello, tuba, left-hand piano, low voices (tenor, bass). Alto (C clef on 3rd line): viola. Tenor (C clef on 4th line): upper range of cello, bassoon, trombone, tenor trombone.</p>
        <p><b>The trick.</b> For each clef, find middle C first. Once you know where C4 is, every other note is just counting up or down by letter - the same as treble or bass, just starting from a different anchor.</p>`));
    }

    function buildKeyboard(host) {
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
        const toLabel = midiLabel(toMidi);
        const semis = Math.abs(toMidi - fromMidi);
        const loMidi = Math.min(fromMidi, toMidi), hiMidi = Math.max(fromMidi, toMidi);
        const loLabel = midiLabel(loMidi), hiLabel = midiLabel(hiMidi);
        const name = INTERVAL_NAMES[semis] || (semis + " semitones");
        display.innerHTML = `<b>${name}</b> &mdash; ${loLabel} to ${hiLabel} &middot; ${semis} semitone${semis !== 1 ? "s" : ""}`;
        btns.appendChild(playBtn(loLabel, () => A.note(loMidi, 0.9)));
        btns.appendChild(playBtn(hiLabel, () => A.note(hiMidi, 0.9)));
        btns.appendChild(playBtn("Together", () => A.freqChord([M.midiToFreq(loMidi), M.midiToFreq(hiMidi)], 1.8)));
        btns.appendChild(playBtn("In turn", () => A.freqSequence([M.midiToFreq(loMidi), M.midiToFreq(hiMidi)], 0.7, 0.7)));
        const clearBtn = C.button("Clear", () => { fromMidi = null; toMidi = null; refresh(); }, { className: "btn ghost" });
        btns.appendChild(clearBtn);
      }

      host.appendChild(card);

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

    function buildConsonance(host) {
      host.appendChild(lessonCard(`
        <p><b>Consonance is measurable, not just taste.</b> Whether two notes sound smooth or harsh comes down to one physical effect: <b>beating</b>. Sound two pure tones close in frequency and they drift in and out of phase, so the combined loudness pulses. The pulse rate is exactly the <b>difference in frequency</b>: 440 Hz against 443 Hz beats <b>3 times a second</b>. Slow beats (a few per second) sound like a gentle wobble; speed them up to roughly <b>20–40 per second</b> and the ear can no longer track them - it registers a buzzing <b>roughness</b> instead.</p>
        <p><b>The critical band.</b> The cochlea analyses sound region by region. Two tones landing inside the same region (a <b>critical band</b>, very roughly a minor 3rd wide in the middle of your range) fight for the same hair cells and produce that roughness. Move them far enough apart and they fall into separate bands and stop interfering - smoothness returns. Maximum roughness sits at about <b>a quarter of a critical band</b> apart, near a semitone.</p>
        <p><b>Why simple ratios win.</b> Real notes are stacks of harmonics (see <i>The harmonic series</i>). When two notes form a simple ratio like 3:2, many of their harmonics either coincide exactly or sit far apart - few land in the rough zone. A complex ratio like 16:15 (a semitone) scatters harmonics all through each other's critical bands. Consonance is just <b>how few harmonic pairs are beating</b>.</p>`));

      const beatCard = C.el(`<div class="card"></div>`);
      beatCard.appendChild(C.el(`<h3 style="margin-top:0">Hear beating speed up</h3>`));
      beatCard.appendChild(C.el(`<p class="muted" style="font-size:.92rem">Two tones near 440 Hz. As they spread apart the wobble quickens, then dissolves into roughness. The wave below is their sum: the slow bulge is one beat.</p>`));
      const beatStage = C.el(`<div id="beat-stage">${beatWave(4)}</div>`);
      beatCard.appendChild(beatStage);
      const beatOut = C.el(`<p class="muted" id="beat-caption" aria-live="polite" style="font-size:.9rem">Pick a detuning and listen for the pulse.</p>`);
      const base = 440;
      const detunes = [
        { d: 0, label: "Unison (0 Hz)", note: "perfectly locked - no beating" },
        { d: 1, label: "+1 Hz", note: "1 slow beat per second" },
        { d: 4, label: "+4 Hz", note: "4 beats per second - an audible wobble" },
        { d: 15, label: "+15 Hz", note: "15 per second - turning into roughness" },
        { d: 33, label: "+33 Hz", note: "≈ maximum roughness for this register" },
      ];
      const beatRow = C.el(`<div class="explainer-controls"></div>`);
      detunes.forEach((s) => {
        beatRow.appendChild(playBtn(s.label, () => {
          beatStage.innerHTML = beatWave(Math.max(0.6, s.d));
          beatOut.innerHTML = `<b>${s.label}</b> &rarr; ${s.note}.`;
          A.freqChord(s.d === 0 ? [base, base] : [base, base + s.d], 2.6);
        }));
      });
      beatCard.appendChild(beatRow);
      beatCard.appendChild(beatOut);
      host.appendChild(beatCard);

      const curveCard = C.el(`<div class="card"></div>`);
      curveCard.appendChild(C.el(`<h3 style="margin-top:0">The roughness curve</h3>`));
      curveCard.appendChild(C.el(`<p class="muted" style="font-size:.92rem">Sensory dissonance of two harmonic tones as the upper note climbs from unison to the octave (after Plomp &amp; Levelt, 1965). The <b>dips are the consonant intervals</b> - the ones music is built from. The peaks near the semitone and tritone are where harmonics clash hardest. Play each interval and hear where it sits on the curve.</p>`));
      curveCard.appendChild(C.el(dissonanceCurve()));
      const cf = M.noteToFreq("C4");
      const ivals = [
        { semi: 1, name: "Minor 2nd", q: "harsh" },
        { semi: 4, name: "Major 3rd", q: "sweet" },
        { semi: 5, name: "Perfect 4th", q: "stable" },
        { semi: 6, name: "Tritone", q: "tense" },
        { semi: 7, name: "Perfect 5th", q: "very consonant" },
        { semi: 12, name: "Octave", q: "the most consonant" },
      ];
      const ivRow = C.el(`<div class="explainer-controls"></div>`);
      ivals.forEach((iv) => {
        ivRow.appendChild(playBtn(iv.name, () => A.freqChord([cf, cf * Math.pow(2, iv.semi / 12)], 2.2)));
      });
      curveCard.appendChild(ivRow);
      curveCard.appendChild(C.el(`<p class="muted" style="font-size:.84rem">The curve is for two tones with six harmonics each; instruments richer in upper harmonics push the peaks higher, which is part of why a fuzzy electric guitar power-chord avoids 3rds.</p>`));
      host.appendChild(curveCard);
    }

    function buildCents(host) {
      host.appendChild(lessonCard(`
        <p><b>The ear hears ratios, not differences.</b> Going from 100 Hz to 200 Hz sounds like the same "distance" as 200 Hz to 400 Hz - both are one octave - even though the first adds 100 Hz and the second adds 200 Hz. Pitch is <b>logarithmic</b>: equal musical steps mean equal <i>multiplications</i> of frequency, not equal additions. An octave is always <b>×2</b>, whatever you start from.</p>
        <p><b>The semitone is the twelfth root of 2.</b> Twelve equal semitones must multiply up to one octave, so each semitone is <b>×2<sup>1/12</sup> ≈ ×1.0595</b> - a 5.95% rise in frequency every time. Do it twelve times and 1.0595<sup>12</sup> lands exactly back on ×2.</p>
        <p><b>Cents put a ruler on it.</b> Divide the octave into <b>1200 equal cents</b> (100 per semitone). The cents between two frequencies is <b>1200 × log₂(f₂/f₁)</b>. Cents are how tuning differences are quoted, and the ear notices about <b>5–10 cents</b>.</p>`));

      const f = M.noteToFreq("A2"); // 110 Hz
      const demoCard = C.el(`<div class="card"></div>`);
      demoCard.appendChild(C.el(`<h3 style="margin-top:0">Same +110 Hz, shrinking steps</h3>`));
      demoCard.appendChild(C.el(`<p class="muted" style="font-size:.92rem">First climb in <b>equal 110 Hz jumps</b> (110, 220, 330, 440, 550) - the steps <i>sound</i> like they shrink, because each adds a smaller and smaller ratio. Then climb in <b>equal octaves</b> (110, 220, 440, 880) - now every step sounds the same size, because each is ×2.</p>`));
      const demoRow = controls();
      demoRow.appendChild(playBtn("Equal Hz steps (+110)", () => A.freqSequence([f, f * 2, f * 3, f * 4, f * 5], 0.62, 0.55)));
      demoRow.appendChild(playBtn("Equal octaves (×2)", () => A.freqSequence([f, f * 2, f * 4, f * 8], 0.62, 0.55)));
      demoCard.appendChild(demoRow);
      host.appendChild(demoCard);

      const rulerCard = C.el(`<div class="card"></div>`);
      rulerCard.appendChild(C.el(`<h3 style="margin-top:0">Linear frequency vs what you hear</h3>`));
      rulerCard.appendChild(C.el(`<p class="muted" style="font-size:.92rem">The same twelve semitones of an octave (C4 to C5). On a <b>linear frequency</b> axis (top) they bunch up low and spread out high. Spaced by <b>pitch</b> (bottom) they are perfectly even - that even spacing is the logarithm of the top. The fanning lines connect each note to itself.</p>`));
      rulerCard.appendChild(C.el(logPitchRuler()));
      host.appendChild(rulerCard);

      const stackCard = C.el(`<div class="card"></div>`);
      stackCard.appendChild(C.el(`<h3 style="margin-top:0">Twelve semitones make an octave</h3>`));
      stackCard.appendChild(C.el(`<p class="muted" style="font-size:.92rem">Each semitone multiplies by 1.0595. Climb all twelve from C4 and you arrive at C5 - exactly double the frequency, 1200 cents up.</p>`));
      const c4 = M.noteToFreq("C4");
      const stackRow = controls();
      stackRow.appendChild(playBtn("Climb 12 semitones", () => A.freqSequence(Array.from({ length: 13 }, (_, i) => c4 * Math.pow(2, i / 12)), 0.26, 0.24)));
      stackRow.appendChild(playBtn("C4 and C5 together (2:1)", () => A.freqChord([c4, c4 * 2], 2.2)));
      stackCard.appendChild(stackRow);
      stackCard.appendChild(C.el(`<p class="muted" style="font-size:.84rem">In cents: each step is 100, twelve steps is 1200, and 1200 cents = log₂(2) × 1200 = one octave.</p>`));
      host.appendChild(stackCard);
    }

    function buildTimbre(host) {
      host.appendChild(lessonCard(`
        <p><b>Why a flute and a violin on the same note sound different.</b> They play the same fundamental frequency, so the <i>pitch</i> matches - but each adds a different <b>recipe of harmonics</b> on top (see <i>The harmonic series</i> for where those come from). That recipe - which overtones are present and how loud - is the sound's <b>timbre</b>, or tone colour. Mathematically it is the note's <b>Fourier spectrum</b>: any steady tone is a sum of pure sine waves at the harmonics, and the amplitudes are its fingerprint.</p>
        <p>Build a tone from harmonics of <b>A = 110 Hz</b> and hear the colour change while the pitch stays put. The bars show which harmonics are switched on.</p>`));

      const f = M.noteToFreq("A2"); // 110 Hz
      const recipes = [
        { label: "Fundamental only", parts: [1], note: "a bare sine - pure, hollow, like a tuning fork" },
        { label: "+ octave (2nd)", parts: [1, 2], note: "rounder, flute-like" },
        { label: "Odd harmonics", parts: [1, 3, 5, 7], note: "hollow and woody, like a clarinet" },
        { label: "All harmonics", parts: [1, 2, 3, 4, 5, 6], note: "bright and buzzy, like a bowed string" },
      ];
      const timbreCard = C.el(`<div class="card"></div>`);
      timbreCard.appendChild(C.el(`<h3 style="margin-top:0">Same pitch, different recipe</h3>`));
      const specStage = C.el(`<div id="spec-stage">${spectrumBars(recipes[3].parts)}</div>`);
      timbreCard.appendChild(specStage);
      const specOut = C.el(`<p class="muted" id="spec-caption" aria-live="polite" style="font-size:.9rem">Pick a recipe - the pitch (110 Hz) never changes, only the colour.</p>`);
      const specRow = C.el(`<div class="explainer-controls"></div>`);
      recipes.forEach((r) => {
        specRow.appendChild(playBtn(r.label, () => {
          specStage.innerHTML = spectrumBars(r.parts);
          specOut.innerHTML = `<b>${r.label}</b> &rarr; ${r.note}.`;
          A.freqChord(r.parts.map((n) => f * n), 2.2);
        }));
      });
      timbreCard.appendChild(specRow);
      timbreCard.appendChild(specOut);
      host.appendChild(timbreCard);

      host.appendChild(lessonCard(`
        <p><b>The missing fundamental.</b> Here is the strange part. The harmonics of 110 Hz sit at 220, 330, 440, 550 Hz... Their frequencies are all multiples of 110, so the whole pattern <b>repeats 110 times a second</b>. Your auditory system locks onto that repetition rate and reports the pitch as 110 Hz - <b>even if the 110 Hz tone itself is missing</b>. The brain reconstructs the fundamental from the spacing of the harmonics.</p>
        <p>This is not a lab curiosity: a phone earpiece or a small speaker can barely move air at low frequencies, yet a male voice or a bass line still sounds the right pitch, because the harmonics are there and your brain fills in the root.</p>`));

      const mfCard = C.el(`<div class="card"></div>`);
      mfCard.appendChild(C.el(`<h3 style="margin-top:0">Remove the root, keep the pitch</h3>`));
      mfCard.appendChild(C.el(`<p class="muted" style="font-size:.92rem">Compare a real 110 Hz tone, the full harmonic stack, and the stack with its 110 Hz fundamental deleted. The last two sound the same pitch - 110 Hz - even though one has no energy at 110 Hz at all.</p>`));
      const mfRow = controls();
      mfRow.appendChild(playBtn("Pure 110 Hz", () => A.freqChord([f], 2)));
      mfRow.appendChild(playBtn("110 + harmonics", () => A.freqChord([f, f * 2, f * 3, f * 4, f * 5], 2.2)));
      mfRow.appendChild(playBtn("Harmonics only (no 110)", () => A.freqChord([f * 2, f * 3, f * 4, f * 5], 2.2)));
      mfCard.appendChild(mfRow);
      mfCard.appendChild(C.el(`<p class="muted" style="font-size:.84rem">The spacing between 220, 330, 440, 550 Hz is a constant 110 Hz - and that spacing, not any single tone, is what fixes the pitch.</p>`));
      host.appendChild(mfCard);
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

    const X_AXIS = 52, X_TICK_END = 60, X_DOT = 60, X_NOTE = 44, X_BRACKET = 72, X_GAP_LABEL = 108, X_HZ = 170;

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

  function dissonanceCurve() {
    // Schematic Plomp-Levelt sensory-dissonance curve for two 6-harmonic tones,
    // upper note rising from unison (0 cents) to the octave (1200). Dips fall on
    // the consonant intervals. y is roughness: 0 smooth (bottom), 1 rough (top).
    const pts = [
      [0, 0.02], [50, 0.55], [100, 0.92], [150, 0.72], [200, 0.5], [250, 0.46],
      [300, 0.33], [350, 0.34], [386, 0.2], [430, 0.36], [498, 0.12], [550, 0.4],
      [590, 0.46], [650, 0.42], [700, 0.08], [760, 0.34], [800, 0.3], [850, 0.33],
      [884, 0.2], [950, 0.4], [1000, 0.38], [1050, 0.36], [1088, 0.27], [1150, 0.46], [1200, 0.03],
    ];
    const dips = [
      [0, "unison"], [386, "M3"], [498, "P4"], [700, "P5"], [884, "M6"], [1200, "8ve"],
    ];
    const X0 = 44, X1 = 504, YT = 22, YB = 158, W = X1 - X0, H = YB - YT;
    const toX = (c) => X0 + (c / 1200) * W;
    const toY = (r) => YT + (1 - r) * H;
    const r1 = (n) => Math.round(n * 10) / 10;
    const poly = pts.map(([c, r]) => `${r1(toX(c))},${r1(toY(r))}`).join(" ");

    let dots = "";
    dips.forEach(([c, label]) => {
      const x = r1(toX(c));
      const y = r1(toY(pts.find((p) => p[0] === c)[1]));
      dots += `<circle cx="${x}" cy="${y}" r="4" class="dc-dot"/>`;
      dots += `<text x="${x}" y="${YB + 16}" text-anchor="middle" class="dc-tick">${label}</text>`;
      dots += `<line x1="${x}" y1="${y + 6}" x2="${x}" y2="${YB}" class="dc-drop"/>`;
    });

    return `<div class="diss-curve"><svg viewBox="0 0 540 188" class="diss-curve-svg" role="img"
  aria-label="Sensory dissonance curve from unison to octave. Roughness peaks near the minor 2nd and tritone and dips to consonance at the major 3rd, perfect 4th, perfect 5th, major 6th and octave.">
  <line x1="${X0}" y1="${YB}" x2="${X1}" y2="${YB}" class="dc-axis"/>
  <text x="${X0 - 6}" y="${YT + 6}" text-anchor="end" class="dc-axislabel">rough</text>
  <text x="${X0 - 6}" y="${YB}" text-anchor="end" class="dc-axislabel">smooth</text>
  ${dots}
  <polyline points="${poly}" class="dc-line"/>
</svg></div>`;
  }

  function logPitchRuler() {
    // Twelve semitones of an octave placed two ways: top axis by linear frequency
    // (bunched low, spread high), bottom axis by equal pitch steps. Fanning lines
    // connect each note to itself, so the bottom is visibly the log of the top.
    const notes = [
      { name: "C", hz: 261.63 }, { name: "", hz: 277.18 }, { name: "D", hz: 293.66 },
      { name: "", hz: 311.13 }, { name: "E", hz: 329.63 }, { name: "F", hz: 349.23 },
      { name: "", hz: 369.99 }, { name: "G", hz: 392.0 }, { name: "", hz: 415.3 },
      { name: "A", hz: 440.0 }, { name: "", hz: 466.16 }, { name: "B", hz: 493.88 },
      { name: "C", hz: 523.25 },
    ];
    const X0 = 30, X1 = 510, W = X1 - X0, TOP = 42, BOT = 128;
    const fLo = notes[0].hz, fHi = notes[notes.length - 1].hz;
    const linX = (hz) => X0 + ((hz - fLo) / (fHi - fLo)) * W;
    const evenX = (i) => X0 + (i / (notes.length - 1)) * W;
    const r1 = (n) => Math.round(n * 10) / 10;

    let connectors = "", topDots = "", botDots = "", labels = "";
    notes.forEach((n, i) => {
      const xt = r1(linX(n.hz)), xb = r1(evenX(i));
      const named = n.name !== "";
      connectors += `<line x1="${xt}" y1="${TOP}" x2="${xb}" y2="${BOT}" class="lr-connector${named ? " lr-named" : ""}"/>`;
      topDots += `<circle cx="${xt}" cy="${TOP}" r="${named ? 4 : 2.4}" class="lr-dot${named ? " lr-named" : ""}"/>`;
      botDots += `<circle cx="${xb}" cy="${BOT}" r="${named ? 4 : 2.4}" class="lr-dot${named ? " lr-named" : ""}"/>`;
      if (named) {
        labels += `<text x="${xt}" y="${TOP - 9}" text-anchor="middle" class="lr-label">${n.name}</text>`;
        labels += `<text x="${xb}" y="${BOT + 17}" text-anchor="middle" class="lr-label">${n.name}</text>`;
      }
    });

    return `<div class="logr"><svg viewBox="0 0 540 168" class="logr-svg" role="img"
  aria-label="An octave of twelve semitones shown on a linear frequency axis, where they bunch up at low pitches, and on an equal-pitch axis, where they are evenly spaced.">
  <text x="${X0}" y="20" class="lr-axislabel">frequency (Hz) — linear, bunched low</text>
  <line x1="${X0}" y1="${TOP}" x2="${X1}" y2="${TOP}" class="lr-axis"/>
  ${connectors}
  <line x1="${X0}" y1="${BOT}" x2="${X1}" y2="${BOT}" class="lr-axis"/>
  ${topDots}${botDots}${labels}
  <text x="${X0}" y="162" class="lr-axislabel">pitch — equal steps (the logarithm)</text>
</svg></div>`;
  }

  function spectrumBars(parts) {
    // Bar graph of harmonics 1..8; bars in `parts` are "on" (accent), rest dimmed.
    const N = 8, X0 = 38, X1 = 300, YB = 120, YT = 16;
    const slot = (X1 - X0) / N;
    const barW = slot * 0.56;
    // Falloff so the spectrum reads as a plausible amplitude envelope.
    const amp = (n) => 1 / n;
    let bars = "";
    for (let n = 1; n <= N; n++) {
      const on = parts.includes(n);
      const x = X0 + (n - 1) * slot + (slot - barW) / 2;
      const h = on ? (YB - YT) * amp(n) : 3;
      const y = YB - h;
      bars += `<rect x="${Math.round(x)}" y="${Math.round(y)}" width="${Math.round(barW)}" height="${Math.round(h)}" class="spec-bar${on ? " on" : ""}" rx="2"/>`;
      bars += `<text x="${Math.round(x + barW / 2)}" y="${YB + 15}" text-anchor="middle" class="spec-label${on ? " on" : ""}">${n}</text>`;
    }
    return `<div class="spectrum"><svg viewBox="0 0 312 146" class="spectrum-svg" role="img"
  aria-label="Harmonic spectrum: bars for harmonics 1 to 8, with the active harmonics highlighted.">
  <line x1="${X0 - 4}" y1="${YB}" x2="${X1}" y2="${YB}" class="spec-axis"/>
  ${bars}
  <text x="${(X0 + X1) / 2}" y="143" text-anchor="middle" class="spec-axislabel">harmonic number</text>
</svg></div>`;
  }

  function beatWave(beats) {
    // The summed waveform of two near-equal tones: a fast carrier inside a slow
    // beating envelope. `beats` sets how many envelope bulges span the width.
    const X0 = 14, X1 = 526, MIDY = 56, AMP = 40, W = X1 - X0, STEPS = 256;
    const carrier = 22; // visible carrier cycles across the width
    const r1 = (n) => Math.round(n * 10) / 10;
    let wave = "", envTop = "", envBot = "";
    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS;
      const x = X0 + t * W;
      const env = Math.cos(Math.PI * beats * t); // beats half-cycles -> beats/2 bulges; doubled visually below
      const e = Math.abs(env) * AMP;
      const y = MIDY - env * Math.sin(2 * Math.PI * carrier * t) * AMP;
      wave += `${i === 0 ? "M" : "L"} ${r1(x)} ${r1(y)} `;
      envTop += `${i === 0 ? "M" : "L"} ${r1(x)} ${r1(MIDY - e)} `;
      envBot += `${i === 0 ? "M" : "L"} ${r1(x)} ${r1(MIDY + e)} `;
    }
    return `<svg viewBox="0 0 540 112" class="beat-wave-svg" role="img"
  aria-label="Summed waveform of two close tones, showing a fast wave inside a slow pulsing envelope.">
  <path d="${envTop}" class="bw-env"/>
  <path d="${envBot}" class="bw-env"/>
  <path d="${wave}" class="bw-wave"/>
  <text x="270" y="106" text-anchor="middle" class="bw-label">beats per second = | f₁ − f₂ |</text>
</svg>`;
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
