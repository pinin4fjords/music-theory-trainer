/* core/objectives.js - learning-objective metadata for generated questions. */
(function (global) {
  "use strict";

  const STRANDS = [
    "notation", "rhythm", "keys", "intervals", "harmony", "terminology",
    "aural-rhythm", "aural-pitch", "aural-harmony", "aural-features",
  ];
  const TASK_KINDS = ["recognise", "construct", "calculate", "perform", "describe"];

  function validQuestionMeta(spec) {
    return !!spec
      && typeof spec.id === "string" && /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(spec.id)
      && STRANDS.indexOf(spec.strand) !== -1
      && TASK_KINDS.indexOf(spec.taskKind) !== -1
      && Number.isInteger(spec.difficulty) && spec.difficulty >= 0 && spec.difficulty <= 8;
  }

  function validDefinition(spec) {
    return validQuestionMeta(spec)
      && typeof spec.title === "string" && spec.title.trim().length > 0;
  }

  function define(id, title, strand, taskKind, difficulty) {
    const spec = Object.freeze({ id, title, strand, taskKind, difficulty });
    if (!validDefinition(spec)) throw new Error("Invalid learning objective: " + JSON.stringify(spec));
    return spec;
  }

  function tag(question, spec) {
    if (!question || typeof question !== "object") return question;
    question.meta = Object.assign({}, question.meta || {}, {
      objectiveId: spec.id,
      taskKind: spec.taskKind,
      strand: spec.strand,
      difficulty: spec.difficulty,
    });
    return question;
  }

  function wrap(spec, generator) {
    if (!validDefinition(spec)) throw new Error("Invalid learning objective: " + JSON.stringify(spec));
    if (typeof generator !== "function") throw new Error("Objective generator must be a function");
    const wrapped = function (rng) { return tag(generator(rng), spec); };
    wrapped.objectives = [spec];
    wrapped.forObjective = function (objectiveId, rng) {
      return objectiveId === spec.id ? wrapped(rng) : null;
    };
    return wrapped;
  }

  function mix(generators, select) {
    if (!Array.isArray(generators) || !generators.length || generators.some((g) => typeof g !== "function")) {
      throw new Error("Objective mix needs at least one generator");
    }
    const byId = new Map();
    generators.forEach((generator) => {
      (generator.objectives || []).forEach((spec) => byId.set(spec.id, spec));
    });
    const wrapped = function (rng) {
      const index = select(rng);
      return generators[index](rng);
    };
    wrapped.objectives = Array.from(byId.values());
    wrapped.forObjective = function (objectiveId, rng) {
      const generator = generators.find((g) => (g.objectives || []).some((spec) => spec.id === objectiveId));
      return generator ? generator.forObjective(objectiveId, rng) : null;
    };
    return wrapped;
  }

  function attach(topics) {
    (topics || []).forEach((topic) => {
      if (typeof topic.questions === "function") topic.objectives = (topic.questions.objectives || []).slice();
    });
    return topics;
  }

  function forTopic(content, topicId) {
    const grades = (content && content.grades || []).concat(content && content.auralGrades || []);
    for (const grade of grades) {
      const topic = (grade.topics || []).find((candidate) => candidate.id === topicId);
      if (topic) return (topic.objectives || []).slice();
    }
    return [];
  }

  const api = { STRANDS, TASK_KINDS, validQuestionMeta, validDefinition, define, tag, wrap, mix, attach, forTopic };

  global.MTT = global.MTT || {};
  global.MTT.objectives = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
