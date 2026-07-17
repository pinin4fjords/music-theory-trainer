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
  // topics, both restricted to the chosen grade and below. Initial Grade
  // (aural grade 0) is a standalone entry section, not foundation review, so it
  // only enters the pool when the session itself is Initial Grade.
  function domainTopics(content, grade) {
    const g = grade || 4;
    return gradeTopics(content, grade)
      .concat(auralTopics(content).filter((t) => t.grade <= g && (t.grade > 0 || g === 0)));
  }

  // Order the candidate pool by urgency. Unseen and weak/overdue topics come
  // first (see srs.priority). In "path" mode, current-grade topics get a boost
  // that lifts them above lower-grade topics inside a mixed-grade pool (recipe
  // assembly draws each domain from grades at once, so the boost is what makes
  // that pool lead with the current grade).
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

  // Current-grade ordering for "path" (learning-path) mode: a curriculum walk.
  // Never-seen topics come first in their declared (syllabus) order so the
  // learner progresses through new material in sequence; already-seen topics
  // follow for reinforcement, also in syllabus order. Daily mode instead orders
  // the same topics purely by SRS urgency (weakest/most-overdue first), so the
  // two modes sequence the current grade differently even before their quotas
  // diverge.
  function progressionOrder(topics, srsMap) {
    const map = srsMap || {};
    const isSeen = (t) => !!(map[t.id] && map[t.id].seen);
    return topics.filter((t) => !isSeen(t)).concat(topics.filter(isSeen));
  }

  // Ordering for the Aural quota: honour the SRS schedule. Aural skills decay
  // fast, so topics that are actually due (dueAt reached, or never scheduled)
  // come ahead of topics not yet due, even when a not-yet-due topic looks weaker
  // by box - a topic scheduled into the future should not jump its slot. Each
  // group is still ordered by urgency within itself.
  function orderAural(topics, srsMap, now) {
    const S = srs();
    const map = srsMap || {};
    const due = [], notDue = [];
    topics.forEach((t) => (S.isDue(map[t.id], now) ? due : notDue).push(t));
    return orderPool(due, map, now).concat(orderPool(notDue, map, now));
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

  // A learning path leads with the current grade, so it reserves only a minimal
  // diagnostic slice of earlier-grade review rather than the daily-mix fraction.
  const PATH_LOWER_SLICE = 2;

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
      const domainPool = pool.filter((t) => t.domain === domain);
      const forDomain = domain === "Aural"
        ? orderAural(domainPool, srsMap, now)
        : orderPool(domainPool, srsMap, now, grade, mode);
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
   * lower-grade questions is guaranteed alongside the grade-level questions.
   * "daily" mode ranks the current grade by SRS urgency with a ~30% lower-grade
   * slice; "path" mode walks the current grade as a curriculum progression
   * (unseen topics first, in syllabus order) with only a minimal lower-grade
   * slice, so the two modes assemble genuinely different sessions. Passing a
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

    const isPath = mode === "path";
    const all = gradeTopics(content, grade);
    // Path mode walks the current grade as a curriculum progression; daily mode
    // ranks it by SRS urgency. This ordering difference, together with the wider
    // current-grade quota below, is what makes the two modes assemble genuinely
    // different sessions.
    const orderCurrent = (pool) => isPath ? progressionOrder(pool, srsMap) : orderPool(pool, srsMap, now, grade, mode);
    const lowerTopics = orderPool(all.filter((t) => t.grade < grade), srsMap, now, grade, mode);
    const currentTopics = orderCurrent(all.filter((t) => t.grade === grade));

    let picks;
    // No lower grades available (Grade 1, or nothing seen below): single pool.
    if (grade <= 1 || !lowerTopics.length || !currentTopics.length) {
      picks = assemble(orderCurrent(all), length, rng);
    } else {
      const seen = new Set();
      const lowerQuota = isPath
        ? Math.min(length - 1, PATH_LOWER_SLICE)
        : Math.min(length - 1, Math.max(2, Math.round(length * LOWER_GRADE_FRACTION)));
      const current = assemble(currentTopics, length - lowerQuota, rng, seen);
      const lower = assemble(lowerTopics, length - current.length, rng, seen);
      picks = interleave(current, lower);
      // Backfill from the full pool if a sub-pool ran dry on a small curriculum.
      if (picks.length < length) {
        picks = picks.concat(assemble(orderCurrent(all), length - picks.length, rng, seen));
      }
      picks = picks.slice(0, length);
    }
    return loadBalance(picks, srsMap).slice(0, length);
  }

  // A single-topic session (the "practise this topic" button).
  function buildSingle(topic, rng, length) {
    return assemble([topic], length || SESSION_LEN, rng);
  }

  // --- Placement diagnostic (issue #51) -------------------------------------

  // How many representative topics each grade band contributes to the optional
  // placement check. One keeps the whole walk short (~8 questions across the
  // grades) while still sampling every band in ascending difficulty.
  const PLACEMENT_TOPICS_PER_BAND = 1;

  // A band counts as passed when at least this fraction of its questions are
  // correct; below it the band is failed. With one question per band this is
  // simply "got it right".
  const PLACEMENT_PASS = 0.5;

  // Consecutive failed bands that end the walk early, so a struggling beginner
  // is never marched up to Grade 8 questions.
  const PLACEMENT_MAX_MISSES = 2;

  // Representative topics per grade band for the placement check: the first
  // quizable theory topic of each grade, ordered ascending by grade. Aural
  // topics are excluded because they need a microphone, which onboarding can't
  // assume. Deterministic (content order is fixed).
  function placementBands(content) {
    const byGrade = new Map();
    quizableTopics(content).forEach((t) => {
      if (!byGrade.has(t.grade)) byGrade.set(t.grade, []);
      byGrade.get(t.grade).push(t);
    });
    return [...byGrade.keys()].sort((a, b) => a - b)
      .map((grade) => ({ grade, topics: byGrade.get(grade).slice(0, PLACEMENT_TOPICS_PER_BAND) }));
  }

  function bandPassed(result) {
    return result.total ? (result.correct / result.total) >= PLACEMENT_PASS : false;
  }

  // Whether the placement walk should stop now: the learner has failed the last
  // PLACEMENT_MAX_MISSES bands in a row. `results` are the attempted bands in
  // ascending-grade order, each { grade, correct, total }.
  function shouldStopPlacement(results) {
    let streak = 0;
    results.forEach((r) => { streak = bandPassed(r) ? 0 : streak + 1; });
    return streak >= PLACEMENT_MAX_MISSES;
  }

  // Suggest a starting grade from the attempted bands: the highest grade the
  // learner comfortably passed, meaning they passed that band AND did not fail
  // the band below it (so a single fluke pass above a failed foundation doesn't
  // over-promote). Falls back to Grade 1 when nothing qualifies, so a struggling
  // beginner lands at the entry point rather than nowhere.
  function placementSuggestion(results) {
    const passed = new Map();
    results.forEach((r) => passed.set(r.grade, bandPassed(r)));
    let suggested = 1;
    results.forEach((r) => {
      const g = r.grade;
      if (passed.get(g) && (g === 1 || passed.get(g - 1))) suggested = g;
    });
    return suggested;
  }

  const api = {
    SESSION_LEN, DOMAINS, DEFAULT_RECIPE, HIGH_EFFORT_MS,
    PLACEMENT_PASS, PLACEMENT_MAX_MISSES, PLACEMENT_TOPICS_PER_BAND,
    allTopics, quizableTopics, auralTopics, gradeTopics, domainTopics,
    orderPool, progressionOrder, orderAural, assemble, build, buildByDomain,
    buildSingle, qSig, setWarn, isHighEffort, loadBalance,
    placementBands, shouldStopPlacement, placementSuggestion,
  };

  global.MTT = global.MTT || {};
  global.MTT.session = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
