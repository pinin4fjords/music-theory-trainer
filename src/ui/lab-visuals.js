/* ui/lab-visuals.js - responsive diagrams for the shared music labs.
 *
 * Each renderer consumes a numeric descriptor produced by labs.js. The SVGs
 * therefore show the same values used by the result text and audio controls.
 *
 * Public surface: global `MTT.ui.labVisuals`.
 */
(function (global) {
  "use strict";

  const round = (value, places) => {
    const scale = Math.pow(10, places == null ? 1 : places);
    return Math.round(value * scale) / scale;
  };
  const clamp = (value, lower, upper) => Math.max(lower, Math.min(upper, value));

  function render(host, visual) {
    host.innerHTML = "";
    delete host.dataset.visualKind;
    if (!visual || !renderers[visual.kind]) return;
    host.dataset.visualKind = visual.kind;
    host.innerHTML = renderers[visual.kind](visual);
  }

  function pitchRatio(visual) {
    const x0 = 48, x1 = 512, min = 80, max = 1000;
    const toX = (frequency) => x0 + (Math.log2(frequency / min) / Math.log2(max / min)) * (x1 - x0);
    const lowerX = round(clamp(toX(visual.lower), x0, x1));
    const upperX = round(clamp(toX(visual.upper), x0, x1));
    const ticks = [110, 220, 440, 880].map((frequency) => {
      const x = round(toX(frequency));
      return `<line class="lab-pitch-tick" x1="${x}" y1="52" x2="${x}" y2="68"/>
        <text class="lab-visual-small" x="${x}" y="84" text-anchor="middle">${frequency}</text>`;
    }).join("");
    const label = `${round(visual.lower, 1)} to ${round(visual.upper, 1)} hertz is a ratio of ${round(visual.ratio, 4)} to one, or ${round(visual.cents, 1)} cents.`;
    return `<svg class="lab-diagram lab-pitch-ruler" viewBox="0 0 560 132" role="img" aria-label="${label}">
      <text class="lab-visual-label" x="${x0}" y="20">logarithmic frequency</text>
      <line class="lab-pitch-axis" x1="${x0}" y1="60" x2="${x1}" y2="60"/>
      ${ticks}
      <line class="lab-pitch-span" x1="${lowerX}" y1="42" x2="${upperX}" y2="42"/>
      <circle class="lab-pitch-marker lab-pitch-lower" cx="${lowerX}" cy="42" r="7"/>
      <circle class="lab-pitch-marker lab-pitch-upper" cx="${upperX}" cy="42" r="7"/>
      <text class="lab-visual-value" x="${lowerX}" y="114" text-anchor="middle">${round(visual.lower, 1)} Hz</text>
      <text class="lab-visual-value" x="${upperX}" y="100" text-anchor="middle">${round(visual.upper, 1)} Hz</text>
      <text class="lab-pitch-cents" x="${round((lowerX + upperX) / 2)}" y="34" text-anchor="middle">${round(visual.cents, 1)} cents</text>
    </svg>
    <p class="lab-visual-caption">Equal ratios occupy equal distances on this ruler.</p>`;
  }

  function wavePath(cycles, middle, amplitude, phase) {
    const points = [];
    for (let i = 0; i <= 180; i++) {
      const t = i / 180;
      const x = 28 + t * 504;
      const y = middle - Math.sin(2 * Math.PI * cycles * t + (phase || 0)) * amplitude;
      points.push(`${i ? "L" : "M"}${round(x)} ${round(y)}`);
    }
    return points.join(" ");
  }

  function beating(visual) {
    const wave = [], top = [], bottom = [];
    const visibleCarrier = 18;
    for (let i = 0; i <= 240; i++) {
      const t = i / 240;
      const x = 28 + t * 504;
      const signedEnvelope = Math.cos(Math.PI * visual.beats * t);
      const envelope = Math.abs(signedEnvelope) * 29;
      const y = 99 - signedEnvelope * Math.sin(2 * Math.PI * visibleCarrier * t) * 29;
      wave.push(`${i ? "L" : "M"}${round(x)} ${round(y)}`);
      top.push(`${i ? "L" : "M"}${round(x)} ${round(99 - envelope)}`);
      bottom.push(`${i ? "L" : "M"}${round(x)} ${round(99 + envelope)}`);
    }
    const label = `${round(visual.first, 1)} and ${round(visual.second, 1)} hertz produce ${round(visual.beats, 1)} amplitude beats per second.`;
    return `<svg class="lab-diagram lab-beat-diagram" viewBox="0 0 560 148" role="img" aria-label="${label}">
      <text class="lab-visual-value" x="28" y="22">f1 ${round(visual.first, 1)} Hz</text>
      <path class="lab-beat-source lab-beat-source-a" d="${wavePath(7, 39, 8)}"/>
      <text class="lab-visual-value" x="310" y="22">f2 ${round(visual.second, 1)} Hz</text>
      <path class="lab-beat-source lab-beat-source-b" d="${wavePath(7 + visual.beats / 4, 39, 8, Math.PI / 6)}"/>
      <line class="lab-beat-axis" x1="28" y1="99" x2="532" y2="99"/>
      <path class="lab-beat-envelope" d="${top.join(" ")}"/>
      <path class="lab-beat-envelope" d="${bottom.join(" ")}"/>
      <path class="lab-beat-sum" d="${wave.join(" ")}"/>
      <text class="lab-visual-small" x="280" y="144" text-anchor="middle">one-second window: ${round(visual.beats, 1)} amplitude ${visual.beats === 1 ? "beat" : "beats"}</text>
    </svg>`;
  }

  function spectrum(visual) {
    const active = new Set(visual.partialNumbers);
    const bars = [];
    for (let harmonic = 1; harmonic <= 6; harmonic++) {
      const x = 48 + (harmonic - 1) * 82;
      const isActive = active.has(harmonic);
      const height = isActive ? 82 / harmonic + 14 : 3;
      const y = 108 - height;
      const implied = harmonic === 1 && !isActive;
      bars.push(`${implied ? `<rect class="lab-spectrum-implied" x="${x - 4}" y="18" width="32" height="90" rx="4"/>` : ""}
        <rect class="lab-spectrum-bar${isActive ? " is-active" : ""}" x="${x}" y="${round(y)}" width="24" height="${round(height)}" rx="3"/>
        <text class="lab-visual-value" x="${x + 12}" y="126" text-anchor="middle">H${harmonic}</text>
        <text class="lab-visual-small" x="${x + 12}" y="141" text-anchor="middle">${visual.fundamental * harmonic} Hz</text>`);
    }
    const missing = !active.has(1);
    const label = `Harmonic spectrum at ${visual.fundamental} hertz. Active components are harmonics ${visual.partialNumbers.join(", ")}.${missing ? " The fundamental component is absent but its position is outlined." : " The fundamental component is present."}`;
    return `<svg class="lab-diagram lab-spectrum" viewBox="0 0 560 154" role="img" aria-label="${label}">
      <line class="lab-spectrum-axis" x1="34" y1="108" x2="534" y2="108"/>
      ${bars.join("")}
      ${missing ? `<text class="lab-spectrum-missing" x="60" y="14" text-anchor="middle">absent</text>` : ""}
    </svg>
    <p class="lab-visual-caption">${missing ? "Filled bars are audible components. The dashed H1 is implied but absent." : "Filled bars are audible components, including the fundamental H1."}</p>`;
  }

  function metre(visual) {
    const pulseGap = 9 + ((visual.pulseMs - 180) / 320) * 16;
    const groupGap = 26;
    const pulseStep = 22 + pulseGap;
    const widths = visual.groups.map((group) => (group - 1) * pulseStep + 30);
    const totalWidth = widths.reduce((sum, width) => sum + width, 0) + groupGap * (widths.length - 1);
    let groupX = (560 - totalWidth) / 2;
    const groups = visual.groups.map((group, groupIndex) => {
      const width = widths[groupIndex];
      const pulses = [];
      for (let pulse = 0; pulse < group; pulse++) {
        const x = groupX + 15 + pulse * pulseStep;
        const accent = pulse === 0;
        pulses.push(`<line class="lab-metre-stem${accent ? " is-accent" : ""}" x1="${round(x)}" y1="${accent ? 38 : 48}" x2="${round(x)}" y2="86"/>
          <circle class="lab-metre-pulse${accent ? " is-accent" : ""}" cx="${round(x)}" cy="86" r="${accent ? 10 : 7}"/>`);
      }
      const markup = `<g>
        <rect class="lab-metre-group${groupIndex % 2 ? " is-alternate" : ""}" x="${round(groupX)}" y="24" width="${round(width)}" height="82" rx="8"/>
        ${pulses.join("")}
        <text class="lab-visual-value" x="${round(groupX + width / 2)}" y="126" text-anchor="middle">${group}</text>
      </g>`;
      groupX += width + groupGap;
      return markup;
    }).join("");
    const label = `${visual.metre} grouped as ${visual.groups.join(" plus ")}. Accented large pulses begin each group. Pulses are ${visual.pulseMs} milliseconds apart.`;
    return `<svg class="lab-diagram lab-metre" viewBox="0 0 560 148" role="img" aria-label="${label}">
      ${groups}
      <text class="lab-visual-small" x="280" y="144" text-anchor="middle">${visual.groups.join(" + ")} at ${visual.pulseMs} ms per fast pulse</text>
    </svg>`;
  }

  function string(visual) {
    const fraction = clamp(Number(visual.fraction), 0.05, 1);
    const x0 = 34, x1 = 526;
    const stop = x0 + (x1 - x0) * fraction;
    const midpoint = x0 + (stop - x0) / 2;
    return `<svg class="lab-diagram lab-string" viewBox="0 0 560 126" role="img" aria-label="${visual.label}">
      <rect class="lab-string-box" x="20" y="57" width="520" height="52" rx="9"/>
      <circle class="lab-string-peg" cx="${x0}" cy="43" r="4.5"/>
      <circle class="lab-string-peg" cx="${x1}" cy="43" r="4.5"/>
      <path class="lab-string-wave lab-string-wave-echo" d="M ${x0} 43 Q ${round(midpoint)} 61 ${round(stop)} 43"/>
      <path class="lab-string-wave" d="M ${x0} 43 Q ${round(midpoint)} 25 ${round(stop)} 43"/>
      ${fraction < 1 ? `<line class="lab-string-muted" x1="${round(stop)}" y1="43" x2="${x1}" y2="43"/>
        <polygon class="lab-string-stop" points="${round(stop - 6)},55 ${round(stop + 6)},55 ${round(stop)},43"/>` : ""}
      <text x="${x0}" y="121" text-anchor="start">nut</text>
      <text x="${x1}" y="121" text-anchor="end">bridge</text>
    </svg>
    <p class="lab-visual-caption">${visual.label}</p>`;
  }

  const renderers = {
    "pitch-ratio": pitchRatio,
    beats: beating,
    spectrum,
    metre,
    string,
  };

  const api = { render };
  global.MTT = global.MTT || {};
  global.MTT.ui = global.MTT.ui || {};
  global.MTT.ui.labVisuals = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
