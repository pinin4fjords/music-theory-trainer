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

  // Session domain buckets (issue #22). Untagged content.grades topics default
  // to Theory; auralGrades topics are always Aural (that's what the array is).
  // Physics/History are hand-tagged on the handful of existing topics whose
  // content is genuinely acoustics or historical-fact flavour, not invented.
  const DOMAINS = ["Theory", "Aural", "Physics", "History"];
  const DEFAULT_RECIPE = { Theory: 4, Aural: 3, Physics: 2, History: 1 };

  // avgMs at/above this reads as "the learner visibly struggled or thought
  // hard", not just normal recall time. srs.MAX_RESPONSE_MS (60s) is the
  // outlier cap for the whole scale; this is a third of that.
  const HIGH_EFFORT_MS = 20000;

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
      g.topics.map((t) => Object.assign({}, t, { grade: g.grade, role: g.role, domain: t.domain || "Theory" })));
  }

  function quizableTopics(content) {
    return allTopics(content).filter((t) => typeof t.questions === "function");
  }

  // Aural topics live outside content.grades (content.auralGrades), so they
  // need their own accessor - analytics/progress code that wants a combined
  // view of "everything with SRS data" should concatenate this with
  // quizableTopics(content).
  function auralTopics(content) {
    return (content.auralGrades || []).flatMap((ag) =>
      ag.topics.filter((t) => typeof t.questions === "function")
        .map((t) => Object.assign({}, t, { grade: ag.grade, domain: t.domain || "Aural" })));
  }

  // Topics eligible for a given grade: that grade and everything below it.
  function gradeTopics(content, grade) {
    return quizableTopics(content).filter((t) => t.grade <= (grade || 4));
  }

  // The combined domain pool a recipe draws from: theory topics plus aural
  // topics, both restricted to the chosen grade and below.
  function domainTopics(content, grade) {
    return gradeTopics(content, grade).concat(auralTopics(content).filter((t) => t.grade <= (grade || 4)));
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
  // An optional shared `seen` set lets several assemble() calls avoid producing
  // the same question across pools (used when interleaving grades).
  function assemble(pool, n, rng, seen) {
    if (!pool.length) return [];
    seen = seen || new Set();
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

  // Fraction of a higher-grade session reserved for lower-grade questions, so we
  // always sample what the learner already knows - useful diagnostically when
  // they're struggling with grade-level material.
  const LOWER_GRADE_FRACTION = 0.3;

  // Spread the (minority) lower-grade picks evenly through the current-grade
  // picks, starting with a current-grade question. Deterministic.
  function interleave(current, lower) {
    const out = [];
    const total = current.length + lower.length;
    let ai = 0, bi = 0;
    for (let i = 0; i < total; i++) {
      const wantLower = Math.round((i + 1) * lower.length / total);
      if (bi < wantLower && bi < lower.length) out.push(lower[bi++]);
      else if (ai < current.length) out.push(current[ai++]);
      else if (bi < lower.length) out.push(lower[bi++]);
    }
    return out;
  }

  // Fill each recipe domain's quota from its own weakest/most-overdue topics,
  // in recipe key order (deterministic); a domain with too few available
  // topics simply falls short and the final backfill in build() tops it up
  // from the whole pool, so a thin Physics/History pool degrades gracefully
  // rather than failing to fill the session.
  function buildByDomain(opts, recipe) {
    const { content, settings, srsMap, rng, now } = opts;
    const length = opts.length || SESSION_LEN;
    const grade = settings.grade;
    const mode = settings.mode || "daily";
    const pool = domainTopics(content, grade);
    const seen = new Set();
    let picks = [];
    Object.keys(recipe).forEach((domain) => {
      const remaining = length - picks.length;
      if (remaining <= 0) return;
      const want = Math.min(recipe[domain] || 0, remaining);
      if (!want) return;
      const forDomain = orderPool(pool.filter((t) => t.domain === domain), srsMap, now, grade, mode);
      picks = picks.concat(assemble(forDomain, want, rng, seen));
    });
    if (picks.length < length) {
      picks = picks.concat(assemble(orderPool(pool, srsMap, now, grade, mode), length - picks.length, rng, seen));
    }
    return picks.slice(0, length);
  }

  // A pick counts as "high effort" when its topic's rolling avgMs (from SRS
  // state) shows the learner visibly labouring over it.
  function isHighEffort(topic, srsMap) {
    const card = topic && (srsMap || {})[topic.id];
    return !!(card && typeof card.avgMs === "number" && card.avgMs >= HIGH_EFFORT_MS);
  }

  // Cognitive-load balancing: never stack two high-effort picks back to back.
  // When one follows another, swap in the nearest later low-effort pick so the
  // learner gets a break before the next grind. Pure reorder - the same
  // questions come out, just resequenced - so it stays deterministic.
  function loadBalance(picks, srsMap) {
    const out = picks.slice();
    for (let i = 0; i < out.length - 1; i++) {
      if (!isHighEffort(out[i].topic, srsMap) || !isHighEffort(out[i + 1].topic, srsMap)) continue;
      for (let j = i + 2; j < out.length; j++) {
        if (!isHighEffort(out[j].topic, srsMap)) {
          const swap = out[i + 1];
          out[i + 1] = out[j];
          out[j] = swap;
          break;
        }
      }
    }
    return out;
  }

  /**
   * Build a full practice session. For grade >= 2 a diagnostic slice of
   * lower-grade questions is guaranteed alongside the grade-level questions; in
   * "path" mode the session still leads with the current grade. Passing a
   * `recipe` (domain name -> desired count, e.g. DEFAULT_RECIPE) switches to
   * domain-quota assembly instead of the plain priority mix. Either way, the
   * result is passed through cognitive-load balancing before it's returned.
   * @param {{ content, settings:{grade,mode}, srsMap, rng, now, length?, recipe? }} opts
   * @returns {Array<{ topic, q }>}
   */
  function build(opts) {
    const { content, settings, srsMap, rng, now } = opts;
    const length = opts.length || SESSION_LEN;
    const grade = settings.grade;
    const mode = settings.mode || "daily";

    if (opts.recipe) {
      const recipe = opts.recipe === true ? DEFAULT_RECIPE : opts.recipe;
      return loadBalance(buildByDomain(opts, recipe), srsMap).slice(0, length);
    }

    const all = gradeTopics(content, grade);
    const lowerTopics = orderPool(all.filter((t) => t.grade < grade), srsMap, now, grade, mode);
    const currentTopics = orderPool(all.filter((t) => t.grade === grade), srsMap, now, grade, mode);

    let picks;
    // No lower grades available (Grade 1, or nothing seen below): original mix.
    if (grade <= 1 || !lowerTopics.length || !currentTopics.length) {
      picks = assemble(orderPool(all, srsMap, now, grade, mode), length, rng);
    } else {
      const seen = new Set();
      const lowerQuota = Math.min(length - 1, Math.max(2, Math.round(length * LOWER_GRADE_FRACTION)));
      const current = assemble(currentTopics, length - lowerQuota, rng, seen);
      const lower = assemble(lowerTopics, length - current.length, rng, seen);
      picks = interleave(current, lower);
      // Backfill from the full pool if a sub-pool ran dry on a small curriculum.
      if (picks.length < length) {
        picks = picks.concat(assemble(orderPool(all, srsMap, now, grade, mode), length - picks.length, rng, seen));
      }
      picks = picks.slice(0, length);
    }
    return loadBalance(picks, srsMap).slice(0, length);
  }

  // A single-topic session (the "practise this topic" button).
  function buildSingle(topic, rng, length) {
    return assemble([topic], length || SESSION_LEN, rng);
  }

  const api = {
    SESSION_LEN, DOMAINS, DEFAULT_RECIPE, HIGH_EFFORT_MS,
    allTopics, quizableTopics, auralTopics, gradeTopics, domainTopics,
    orderPool, assemble, build, buildByDomain, buildSingle, qSig, setWarn,
    isHighEffort, loadBalance,
  };

  global.MTT = global.MTT || {};
  global.MTT.session = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
