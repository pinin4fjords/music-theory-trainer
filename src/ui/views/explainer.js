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
      "circle-of-fifths": buildCircleOfFifths,
      temperament: buildTemperament,
      "harmonic-series": buildHarmonicSeries,
      "three-minors": buildThreeMinors,
      modes: buildModes,
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

      host.appendChild(lessonCard(`
        <p><b>Multiples vs ratios - the thing that trips people up.</b> "×3" and "a perfect 5th" are not the same idea. <b>×3</b> measures a partial against the <i>fundamental</i> (330 Hz is a 12th - an octave <i>plus</i> a 5th - above 110 Hz). A <b>perfect 5th</b> is the <i>ratio between two notes</i>, 3:2 - for example 440 Hz up to 660 Hz. That 3:2 turns up here as the gap between the 2nd and 3rd partials (220→330). It's the same 3:2 that makes <b>two-thirds of a string</b> sound a 5th - see <i>A string over a box</i> for the length side of the story.</p>`));
    }

    function buildThreeMinors(host) {
      host.appendChild(lessonCard(`
        <p><b>The problem minor has to solve.</b> In a major key the 7th note is a semitone below the tonic - a <b>leading note</b> that pulls strongly home. The natural minor's 7th sits a whole tone below, so it lacks that pull. The three forms of minor are three answers to that one problem.</p>
        <p><b>Natural</b> keeps the key signature untouched (no leading note). <b>Harmonic</b> raises the 7th to get the leading note - but that opens a yawning <b>augmented 2nd</b> between the (unraised) 6th and the raised 7th. <b>Melodic</b> raises the 6th as well on the way up to close that gap, then drops both back to natural minor on the way down. Hear all three in A minor:</p>`));
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
    }
  }

  const api = { render };

  global.MTT = global.MTT || {};
  global.MTT.ui = global.MTT.ui || {};
  global.MTT.ui.views = global.MTT.ui.views || {};
  global.MTT.ui.views.explainer = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
