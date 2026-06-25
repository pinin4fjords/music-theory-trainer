/* core/session.js - session assembly.
 *
 * Turns the curriculum + the learner's SRS state into a concrete list of
 * questions for one practice run. Responsibilities:
 *   - Filter topics to the chosen grade (plus lower grades as foundation review).
 *   - Order the candidate pool by SRS urgency (weak / overdue first).
 *   - Support two modes: "daily" (mixed review across unlocked grades) and
 *     "path" (a learning path that leads with the current grade).
 *   - Generate distinct questions (no repeat within a session).
 *   - Validate every generated question and SKIP invalid ones gracefully,
 *     logging a structured warning, so one bad generator never crashes practice.
 *
 * Deterministic: given the same content, state, seed and `now`, it builds the
 * same session - which is what the tests assert.
 *
 * Public surface: global `MTT.session`.
 */
(function (global) {
  "use strict";

  const SESSION_LEN = 10;

  const srs = () => global.MTT.srs;
  const validate = () => global.MTT.validate;

  // Overridable sink for structured warnings about invalid generated questions.
  let warn = function (info) {
    if (typeof console !== "undefined" && console.warn) {
      console.warn("[content] invalid question skipped", info);
    }
  };
  function setWarn(fn) { warn = fn; }

  function allTopics(content) {
    return content.grades.flatMap((g) =>
      g.topics.map((t) => Object.assign({}, t, { grade: g.grade, role: g.role })));
  }

  function quizableTopics(content) {
    return allTopics(content).filter((t) => typeof t.questions === "function");
  }

  // Topics eligible for a given grade: that grade and everything below it.
  function gradeTopics(content, grade) {
    return quizableTopics(content).filter((t) => t.grade <= (grade || 4));
  }

  // Order the candidate pool by urgency. Unseen and weak/overdue topics come
  // first (see srs.priority). In "path" mode, current-grade topics get a boost so
  // the learner is led through new material while weak lower topics still recur.
  function orderPool(topics, srsMap, now, grade, mode) {
    const S = srs();
    const map = srsMap || {};
    const scored = topics.map((t) => {
      let p = S.priority(map[t.id], now);
      if (mode === "path" && t.grade === grade) p += 5e8; // lead with current grade
      return { t, p };
    });
    scored.sort((a, b) => b.p - a.p);
    return scored.map((x) => x.t);
  }

  // A stable signature so a session never shows the same question twice.
  function qSig(q) {
    return q.answer + "¦" + q.prompt;
  }

  // Build distinct, valid questions by drawing topics round-robin from `pool`.
  function assemble(pool, n, rng) {
    if (!pool.length) return [];
    const seen = new Set();
    const out = [];
    let i = 0, guard = 0;
    const maxGuard = n * 80;
    while (out.length < n && guard < maxGuard) {
      guard++;
      const topic = pool[i % pool.length];
      i++;
      for (let attempt = 0; attempt < 15; attempt++) {
        let q;
        try {
          q = topic.questions(rng);
        } catch (err) {
          warn({ topicId: topic.id, reason: "generator threw: " + (err && err.message) });
          break; // skip this topic this round
        }
        const result = validate().validateQuestion(q);
        if (!result.ok) {
          warn({ topicId: topic.id, reason: result.errors.join("; ") });
          continue; // try regenerating
        }
        const sig = qSig(q);
        if (!seen.has(sig)) {
          seen.add(sig);
          out.push({ topic, q });
          break;
        }
      }
    }
    return out;
  }

  /**
   * Build a full practice session.
   * @param {{ content, settings:{grade,mode}, srsMap, rng, now, length? }} opts
   * @returns {Array<{ topic, q }>}
   */
  function build(opts) {
    const { content, settings, srsMap, rng, now } = opts;
    const length = opts.length || SESSION_LEN;
    const grade = settings.grade;
    const mode = settings.mode || "daily";
    const pool = orderPool(gradeTopics(content, grade), srsMap, now, grade, mode);
    return assemble(pool, length, rng);
  }

  // A single-topic session (the "practise this topic" button).
  function buildSingle(topic, rng, length) {
    return assemble([topic], length || SESSION_LEN, rng);
  }

  const api = {
    SESSION_LEN,
    allTopics, quizableTopics, gradeTopics, orderPool, assemble, build, buildSingle, qSig, setWarn,
  };

  global.MTT = global.MTT || {};
  global.MTT.session = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
