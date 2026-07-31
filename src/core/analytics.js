/* core/analytics.js - local-only learning analytics.
 *
 * Read-only derivations over the SRS card map and the curriculum: which learning
 * objectives are weak, overall and per-grade accuracy, response-time signals. Everything
 * stays on the device - nothing is sent anywhere. Used to surface "focus areas"
 * on the home screen and to bias session assembly toward weak topics.
 *
 * Public surface: global `MTT.analytics`.
 */
(function (global) {
  "use strict";

  const srs = () => global.MTT.srs;

  function cardStats(card) {
    const s = srs();
    const c = card || s.defaultCard();
    return {
      seen: c.seen || 0,
      correct: c.correct || 0,
      accuracy: s.accuracy(c),
      box: c.box || 0,
      avgMs: c.avgMs,
      weakness: s.weakness(c),
      evidence: s.evidence(c),
    };
  }

  function objectiveUnits(topics) {
    const seen = new Set();
    const out = [];
    (topics || []).forEach((topic) => {
      const objectives = topic.objectives && topic.objectives.length
        ? topic.objectives
        : [{ id: topic.id, title: topic.title, strand: topic.domain || "notation", taskKind: "recognise", difficulty: topic.grade }];
      objectives.forEach((objective) => {
        if (seen.has(objective.id)) return;
        seen.add(objective.id);
        out.push(Object.assign({}, objective, {
          topicId: topic.id,
          topicTitle: topic.title,
          grade: topic.grade,
        }));
      });
    });
    return out;
  }

  function topicStats(srsMap, topic) {
    const map = srsMap || {};
    const cards = (topic && topic.objectives || []).map((objective) => map[objective.id]).filter(Boolean);
    if (!cards.length && topic && map[topic.id]) cards.push(map[topic.id]);
    return cardStats(srs().aggregate(cards));
  }

  function objectiveCard(srsMap, objective) {
    const map = srsMap || {};
    return map[objective.id] || map[objective.topicId];
  }

  /**
   * Learning objectives the learner is weakest at, highest need first.
   * @returns {Array<{ id, title, topicId, topicTitle, grade, weakness, accuracy, seen }>}
   */
  function weakAreas(srsMap, topics, limit = 3) {
    const map = srsMap || {};
    return objectiveUnits(topics)
      .filter((objective) => srs().evidence(objectiveCard(map, objective)) > 0)
      .map((objective) => {
        const st = cardStats(objectiveCard(map, objective));
        return {
          id: objective.id,
          title: objective.title,
          topicId: objective.topicId,
          topicTitle: objective.topicTitle,
          grade: objective.grade,
          weakness: st.weakness,
          accuracy: st.accuracy,
          seen: st.seen,
        };
      })
      .filter((x) => x.weakness >= 0.34) // only genuinely shaky objectives
      .sort((a, b) => b.weakness - a.weakness)
      .slice(0, limit);
  }

  function overall(srsMap) {
    const map = srsMap || {};
    let seen = 0, correct = 0, evidence = 0, earned = 0;
    Object.keys(map).forEach((id) => {
      const card = srs().normalizeCard(map[id]);
      seen += card.seen;
      correct += card.correct;
      evidence += card.evidence;
      earned += card.earned;
    });
    return { seen, correct, evidence, earned, accuracy: evidence ? earned / evidence : null };
  }

  function byGrade(srsMap, topics) {
    const map = srsMap || {};
    const out = {};
    objectiveUnits(topics).forEach((objective) => {
      const c = objectiveCard(map, objective);
      if (!c || !c.seen) return;
      const g = (out[objective.grade] = out[objective.grade] || {
        seen: 0, correct: 0, evidence: 0, earned: 0,
      });
      g.seen += c.seen;
      g.correct += c.correct;
      g.evidence += srs().evidence(c);
      g.earned += srs().normalizeCard(c).earned;
    });
    Object.keys(out).forEach((g) => {
      out[g].accuracy = out[g].evidence ? out[g].earned / out[g].evidence : null;
    });
    return out;
  }

  // Per-grade coverage and mastery (0..1), used to estimate an overall level.
  function gradeMastery(srsMap, topics) {
    const S = srs();
    const map = srsMap || {};
    const byG = {};
    objectiveUnits(topics).forEach((objective) => {
      (byG[objective.grade] = byG[objective.grade] || []).push(objective);
    });
    const out = {};
    Object.keys(byG).forEach((g) => {
      const list = byG[g];
      const attempted = list.map((objective) => objectiveCard(map, objective)).filter((card) => S.evidence(card) > 0);
      const cards = list.map((objective) => objectiveCard(map, objective)).filter((card) => S.isConfirmed(card));
      const coverage = list.length ? cards.length / list.length : 0;
      let mastery = 0;
      if (cards.length) {
        mastery = cards.reduce((a, c) =>
          a + (0.5 * S.accuracy(c) + 0.5 * (S.clampBox(c.box) / S.MAX_BOX)), 0) / cards.length;
      }
      out[+g] = { grade: +g, coverage, mastery, seen: cards.length, attempted: attempted.length, total: list.length };
    });
    return out;
  }

  // Coverage/mastery thresholds at which a grade counts as "demonstrated".
  // Coverage requires most of the grade's topics to have been attempted at
  // least once, so the level chip can't certify a grade where a large chunk
  // of the syllabus was never seen.
  const DEMO_COVERAGE = 0.7;
  const DEMO_MASTERY = 0.75;

  /**
   * Estimate the learner's overall theory level from local performance. The level
   * is the highest grade for which that grade AND every grade below it are
   * "demonstrated" (enough objectives confirmed, high enough mastery) - a competence floor,
   * not a single lucky topic. This is an estimate from practice here, not an
   * assessment.
   * @returns {{ level: number|null, label: string, detail: string, grades: object }}
   */
  function estimatedLevel(srsMap, topics) {
    const gm = gradeMastery(srsMap, topics);
    const grades = Object.values(gm).sort((a, b) => a.grade - b.grade);
    const anySeen = grades.some((g) => g.attempted > 0);
    if (!anySeen) {
      return { level: null, label: "New", detail: "Answer a few questions and your estimated level appears here.", grades: gm };
    }
    let level = 0;
    for (const g of grades) {
      if (g.coverage >= DEMO_COVERAGE && g.mastery >= DEMO_MASTERY) level = g.grade;
      else break;
    }
    const working = grades.find((g) => g.grade > level && g.attempted > 0);
    let label, detail;
    if (level === 0) {
      label = "Starting out";
      detail = "Building the Grade 1 foundations.";
    } else {
      label = "Grade " + level;
      detail = working
        ? `Solid through Grade ${level}; working on Grade ${working.grade}.`
        : `Solid through Grade ${level}.`;
    }
    return { level, label, detail, grades: gm };
  }

  const api = { cardStats, objectiveUnits, topicStats, objectiveCard, weakAreas, overall, byGrade, gradeMastery, estimatedLevel };

  global.MTT = global.MTT || {};
  global.MTT.analytics = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
