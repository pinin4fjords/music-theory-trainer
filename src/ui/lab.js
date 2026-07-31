/* ui/lab.js - shared predict, manipulate, observe and explain music lab.
 *
 * Native form controls keep every experiment keyboard-operable. Calculations
 * and teaching copy live in labs.js so this renderer is identical across labs.
 *
 * Public surface: global `MTT.ui.lab`.
 */
(function (global) {
  "use strict";

  function render(labOrId, ctx) {
    const lab = typeof labOrId === "string" ? global.MTT.labs.byId(labOrId) : labOrId;
    if (!lab) return null;
    if (lab.id === "metric-entrainment") {
      const piano = global.MTT.audioPiano;
      if (piano && piano.preload) piano.preload();
    }

    const root = document.createElement("section");
    root.className = "card music-lab";
    root.setAttribute("aria-labelledby", `lab-title-${lab.id}`);
    root.innerHTML = `
      <header class="lab-header">
        <div>
          <p class="lab-eyebrow">Optional music lab</p>
          <h2 id="lab-title-${lab.id}">${lab.title}</h2>
          <p class="lab-question">${lab.question}</p>
        </div>
        <span class="lab-mark" aria-hidden="true">♩</span>
      </header>
      <ol class="lab-steps">
        <li class="lab-step">
          <div class="lab-step-label"><span>1</span><strong>Predict</strong></div>
          <div class="lab-predict">
            <p class="lab-prompt">${lab.predictionPrompt}</p>
            <div class="lab-practice"><strong>Try this</strong><p>${lab.lenses.practice}</p></div>
          </div>
        </li>
        <li class="lab-step">
          <div class="lab-step-label"><span>2</span><strong>Manipulate</strong></div>
          <div class="lab-manipulate">
            <div class="lab-controls"></div>
            <div class="lab-presets"></div>
            <div class="lab-visual"></div>
            <div class="lab-audio"></div>
          </div>
        </li>
        <li class="lab-step">
          <div class="lab-step-label"><span>3</span><strong>Observe</strong></div>
          <div class="lab-step-body">
            <div class="lab-result" role="status" aria-live="polite" aria-atomic="true"></div>
            <div class="lab-observe-evidence"><strong>What this result shows</strong><p>${lab.boundaries.measured}</p></div>
          </div>
        </li>
        <li class="lab-step">
          <div class="lab-step-label"><span>4</span><strong>Explain</strong></div>
          <div class="lab-lenses"></div>
        </li>
      </ol>
      <details class="lab-note">
        <summary>Add a note</summary>
        <div class="lab-note-fields">
          <label class="lab-note-field">
            <span>Your prediction</span>
            <textarea rows="2" data-lab-prediction placeholder="Optional"></textarea>
          </label>
          <label class="lab-note-field">
            <span>What you noticed</span>
            <textarea rows="2" data-lab-observation placeholder="Optional"></textarea>
          </label>
          <span class="lab-note-status muted" role="status"></span>
        </div>
      </details>`;

    const controlsHost = root.querySelector(".lab-controls");
    const inputs = {};
    const refreshControl = {};
    lab.controls.forEach((control) => {
      const field = document.createElement("label");
      field.className = "lab-control";
      const label = document.createElement("span");
      label.className = "lab-control-label";
      label.textContent = control.label;
      field.appendChild(label);

      let input;
      if (control.type === "select") {
        input = document.createElement("select");
        control.options.forEach((option) => {
          const el = document.createElement("option");
          el.value = option.value;
          el.textContent = option.label;
          input.appendChild(el);
        });
      } else {
        input = document.createElement("input");
        input.type = "range";
        input.min = String(control.min);
        input.max = String(control.max);
        input.step = String(control.step);
      }
      input.id = `lab-${lab.id}-${control.id}`;
      input.value = String(control.value);
      input.dataset.labControl = control.id;
      field.appendChild(input);

      if (control.type === "range") {
        const output = document.createElement("output");
        output.className = "lab-control-value";
        output.setAttribute("for", input.id);
        field.appendChild(output);
        const showValue = () => {
          const value = control.places == null ? input.value : global.MTT.labs.round(Number(input.value), control.places);
          output.textContent = `${value} ${control.unit || ""}`.trim();
        };
        input.addEventListener("input", showValue);
        showValue();
        refreshControl[control.id] = showValue;
      }
      input.addEventListener(control.type === "range" ? "input" : "change", update);
      controlsHost.appendChild(field);
      inputs[control.id] = input;
    });

    const presetsHost = root.querySelector(".lab-presets");
    if (lab.presets && lab.presets.length) {
      const label = document.createElement("p");
      label.className = "lab-presets-label";
      label.textContent = "Pluck & divide the string";
      presetsHost.appendChild(label);
      const buttons = document.createElement("div");
      buttons.className = "lab-preset-buttons";
      buttons.setAttribute("role", "group");
      buttons.setAttribute("aria-label", "Common vibrating lengths");
      lab.presets.forEach((preset) => {
        buttons.appendChild(ctx.C.button(preset.label, () => {
          Object.keys(preset.values).forEach((id) => {
            if (!inputs[id]) return;
            inputs[id].value = preset.values[id];
            if (refreshControl[id]) refreshControl[id]();
          });
          update();
        }, { className: "ghost lab-preset" }));
      });
      presetsHost.appendChild(buttons);
    } else {
      presetsHost.remove();
    }

    const lensHost = root.querySelector(".lab-lenses");
    lensHost.appendChild(explanationSection(
      "How it works", lab.lenses.mechanism,
      "Where this explanation has limits", lab.boundaries.inferred,
    ));
    lensHost.appendChild(explanationSection(
      "Where it came from", lab.lenses.history,
      "What musicians and traditions decide", lab.boundaries.convention,
    ));

    const sources = document.createElement("details");
    sources.className = "lab-lens lab-sources";
    const sourceSummary = document.createElement("summary");
    sourceSummary.textContent = "Sources";
    sources.appendChild(sourceSummary);
    const sourceList = document.createElement("ul");
    lab.sources.forEach((source) => {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = source.label;
      item.appendChild(link);
      sourceList.appendChild(item);
    });
    sources.appendChild(sourceList);
    lensHost.appendChild(sources);

    function values() {
      const result = {};
      Object.keys(inputs).forEach((id) => { result[id] = inputs[id].value; });
      return result;
    }

    function update() {
      const result = lab.calculate(values());
      renderResult(root.querySelector(".lab-result"), result);
      global.MTT.ui.labVisuals.render(root.querySelector(".lab-visual"), result.visual);
      renderAudio(root.querySelector(".lab-audio"), result.audio, ctx);
    }

    const note = (ctx.store.get().labNotes || {})[lab.id] || {};
    const prediction = root.querySelector("[data-lab-prediction]");
    const observation = root.querySelector("[data-lab-observation]");
    const noteDetails = root.querySelector(".lab-note");
    const noteSummary = noteDetails.querySelector("summary");
    const noteStatus = root.querySelector(".lab-note-status");
    prediction.value = note.prediction || "";
    observation.value = note.observation || "";
    if (prediction.value || observation.value) noteSummary.textContent = "Edit saved note";

    function saveNote() {
      ctx.store.saveLabNote(lab.id, {
        prediction: prediction.value,
        observation: observation.value,
      });
      noteSummary.textContent = prediction.value.trim() || observation.value.trim() ? "Edit saved note" : "Add a note";
      noteStatus.textContent = "Saved automatically in this browser.";
    }
    prediction.addEventListener("change", saveNote);
    observation.addEventListener("change", saveNote);

    update();
    return root;
  }

  function explanationSection(title, copy, limitTitle, limitCopy) {
    const details = document.createElement("details");
    details.className = "lab-explanation";
    details.open = true;
    const summary = document.createElement("summary");
    summary.textContent = title;
    const p = document.createElement("p");
    p.textContent = copy;
    details.appendChild(summary);
    details.appendChild(p);
    const limit = document.createElement("div");
    limit.className = "lab-explanation-limit";
    const strong = document.createElement("strong");
    strong.textContent = limitTitle;
    const limitText = document.createElement("p");
    limitText.textContent = limitCopy;
    limit.appendChild(strong);
    limit.appendChild(limitText);
    details.appendChild(limit);
    return details;
  }

  function renderResult(host, result) {
    host.innerHTML = "";
    const headline = document.createElement("p");
    headline.className = "lab-result-headline";
    headline.textContent = result.headline;
    host.appendChild(headline);
    const values = document.createElement("dl");
    result.values.forEach(([label, value]) => {
      const row = document.createElement("div");
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = label;
      dd.textContent = value;
      row.appendChild(dt);
      row.appendChild(dd);
      values.appendChild(row);
    });
    host.appendChild(values);
    const alternative = document.createElement("p");
    alternative.className = "lab-text-alternative";
    alternative.textContent = result.text;
    host.appendChild(alternative);
  }

  function renderAudio(host, audio, ctx) {
    host.innerHTML = "";
    if (!audio || !ctx.audio) return;
    host.appendChild(ctx.C.playButton("Listen to this setting", () => {
      try {
        if (audio.kind === "note-sequence") {
          ctx.audio.sequence(audio.notes, audio.gap == null ? 0.55 : audio.gap, audio.duration == null ? 0.5 : audio.duration, audio.velocities);
        } else if (audio.kind === "sequence") {
          ctx.audio.freqSequence(audio.frequencies, audio.gap == null ? 0.55 : audio.gap, audio.duration == null ? 0.5 : audio.duration);
        } else {
          ctx.audio.freqChord(audio.frequencies, audio.duration == null ? 2.2 : audio.duration);
        }
      } catch { /* audio is optional; the calculated text remains available */ }
    }));
  }

  const api = { render };

  global.MTT = global.MTT || {};
  global.MTT.ui = global.MTT.ui || {};
  global.MTT.ui.lab = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
