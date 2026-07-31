/* core/validate.js - schema contracts for content.
 *
 * Two shapes are validated:
 *   - a Topic: the curriculum node authored in content.js
 *   - a Question: the object a topic's generator returns
 *
 * Validation runs in three places:
 *   1. Tests assert the whole curriculum and large samples of generated
 *      questions are valid (a malformed question fails the suite).
 *   2. A dev build flag (?dev) revalidates every generated question and logs
 *      structured warnings.
 *   3. The session builder skips any runtime-invalid question gracefully rather
 *      than letting one bad item crash practice.
 *
 * Public surface: global `MTT.validate`.
 *
 * @typedef {{ prompt: string, choices: string[], answer: string,
 *   explanation?: string, audio?: Function, a11yText?: string,
 *   meta: { objectiveId: string, taskKind: string, strand: string,
 *     difficulty: number }} Question
 */
(function (global) {
  "use strict";

  function isNonEmptyString(v) {
    return typeof v === "string" && v.trim().length > 0;
  }

  // Strip HTML tags so we can check the *visible* prompt is non-empty and detect
  // notation-only prompts that need a text alternative.
  function stripHtml(html) {
    return String(html).replace(/<[^>]*>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
  }

  function hasStaff(html) {
    return /<svg[\s>]/.test(String(html)) || /class="staff/.test(String(html));
  }

  /**
   * Validate a generated question object.
   * @param {Question} q
   * @returns {{ ok: boolean, errors: string[], warnings: string[] }}
   */
  function validateQuestion(q) {
    const errors = [];
    const warnings = [];

    if (!q || typeof q !== "object") {
      return { ok: false, errors: ["question is not an object"], warnings };
    }

    if (!isNonEmptyString(q.prompt)) {
      errors.push("prompt must be a non-empty string");
    } else if (stripHtml(q.prompt).length === 0 && !hasStaff(q.prompt)) {
      errors.push("prompt has no visible text or notation");
    }

    if (!Array.isArray(q.choices)) {
      errors.push("choices must be an array");
    } else {
      if (q.choices.length < 2) errors.push("choices must have at least 2 options");
      if (q.choices.some((c) => !isNonEmptyString(c))) {
        errors.push("every choice must be a non-empty string");
      }
      const unique = new Set(q.choices);
      if (unique.size !== q.choices.length) {
        errors.push("choices contain duplicates: " + JSON.stringify(q.choices));
      }
    }

    if (!isNonEmptyString(q.answer)) {
      errors.push("answer must be a non-empty string");
    } else if (Array.isArray(q.choices) && q.choices.indexOf(q.answer) === -1) {
      errors.push("answer '" + q.answer + "' is not among choices " + JSON.stringify(q.choices));
    }

    if (q.explanation !== undefined && typeof q.explanation !== "string") {
      errors.push("explanation, when present, must be a string");
    }
    if (q.audio !== undefined && typeof q.audio !== "function") {
      errors.push("audio, when present, must be a function");
    }
    if (q.a11yText !== undefined && !isNonEmptyString(q.a11yText)) {
      errors.push("a11yText, when present, must be a non-empty string");
    }

    const meta = q.meta;
    const objectiveMeta = meta && {
      id: meta.objectiveId,
      taskKind: meta.taskKind,
      strand: meta.strand,
      difficulty: meta.difficulty,
    };
    if (!global.MTT.objectives.validQuestionMeta(objectiveMeta)) {
      errors.push("meta must contain a valid objectiveId, taskKind, strand and difficulty");
    }

    // Accessibility: a notation-only prompt is unreadable to a screen reader
    // without a text alternative.
    if (isNonEmptyString(q.prompt) && hasStaff(q.prompt) && !isNonEmptyString(q.a11yText)) {
      warnings.push("prompt contains notation but has no a11yText alternative");
    }

    return { ok: errors.length === 0, errors, warnings };
  }

  /**
   * Validate a curriculum topic node (structure only; the generator's *output*
   * is validated separately and lazily).
   */
  function validateTopic(t) {
    const errors = [];
    const warnings = [];
    if (!t || typeof t !== "object") {
      return { ok: false, errors: ["topic is not an object"], warnings };
    }
    if (!isNonEmptyString(t.id)) errors.push("topic.id must be a non-empty string");
    if (!isNonEmptyString(t.title)) errors.push("topic.title must be a non-empty string");
    if (!isNonEmptyString(t.why)) warnings.push("topic '" + t.id + "' has no 'why' hook");
    if (!isNonEmptyString(t.what)) warnings.push("topic '" + t.id + "' has no 'what' lesson");
    if (t.questions !== null && typeof t.questions !== "function") {
      errors.push("topic.questions must be a function or null");
    }
    if (typeof t.questions === "function") {
      if (!Array.isArray(t.objectives) || !t.objectives.length) {
        errors.push("quizable topic must declare at least one learning objective");
      } else {
        const objectiveIds = new Set();
        t.objectives.forEach((objective) => {
          if (!global.MTT.objectives.validDefinition(objective)) {
            errors.push("topic has an invalid learning objective");
          } else if (objectiveIds.has(objective.id)) {
            errors.push("topic has duplicate learning objective: " + objective.id);
          } else {
            objectiveIds.add(objective.id);
          }
        });
      }
    }
    return { ok: errors.length === 0, errors, warnings };
  }

  /**
   * Validate the whole curriculum: structure of every grade/topic plus global
   * invariants (unique topic ids, sane grade numbers).
   */
  function validateContent(content) {
    const errors = [];
    const warnings = [];
    const seenIds = new Set();
    const objectiveDefinitions = new Map();
    if (!content || !Array.isArray(content.grades)) {
      return { ok: false, errors: ["content.grades must be an array"], warnings };
    }
    content.grades.concat(content.auralGrades || []).forEach((g) => {
      if (!Number.isInteger(g.grade)) errors.push("grade.grade must be an integer: " + JSON.stringify(g.grade));
      if (!Array.isArray(g.topics)) {
        errors.push("grade " + g.grade + " has no topics array");
        return;
      }
      g.topics.forEach((t) => {
        const r = validateTopic(t);
        r.errors.forEach((e) => errors.push("grade " + g.grade + " / " + (t && t.id) + ": " + e));
        r.warnings.forEach((w) => warnings.push(w));
        if (t && t.id) {
          if (seenIds.has(t.id)) errors.push("duplicate topic id: " + t.id);
          seenIds.add(t.id);
        }
        (t && t.objectives || []).forEach((objective) => {
          const prior = objectiveDefinitions.get(objective.id);
          if (prior && (prior.title !== objective.title || prior.strand !== objective.strand
            || prior.taskKind !== objective.taskKind || prior.difficulty !== objective.difficulty)) {
            errors.push("conflicting definition for learning objective: " + objective.id);
          } else if (!prior) {
            objectiveDefinitions.set(objective.id, objective);
          }
        });
      });
    });
    return { ok: errors.length === 0, errors, warnings };
  }

  // Throwing wrappers for test paths.
  function assertQuestion(q, context) {
    const r = validateQuestion(q);
    if (!r.ok) {
      throw new Error("Invalid question" + (context ? " (" + context + ")" : "") + ": " + r.errors.join("; "));
    }
    return q;
  }

  const api = {
    validateQuestion, validateTopic, validateContent, assertQuestion,
    stripHtml, hasStaff,
  };

  global.MTT = global.MTT || {};
  global.MTT.validate = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
