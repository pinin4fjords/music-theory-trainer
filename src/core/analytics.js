/* core/analytics.js - local-only learning analytics.
 *
 * Read-only derivations over the SRS card map and the curriculum: which topics
 * are weak, overall and per-grade accuracy, response-time signals. Everything
 * stays on the device - nothing is sent anywhere. Used to surface "focus areas"
 * on the home screen and to bias session assembly toward weak topics.
 *
 * Public surface: global `MTT.analytics`.
 */
(function (global) {
  "use strict";

  const srs = () => global.MTT.srs;

  function topicStats(card) {
    const s = srs();
    const c = card || s.defaultCard();
    return {
      seen: c.seen || 0,
      correct: c.correct || 0,
      accuracy: s.accuracy(c),
      box: c.box || 0,
      avgMs: c.avgMs,
      weakness: s.weakness(c),
    };
  }

  /**
   * Topics the learner is weakest at, strongest first need shown first.
   * Only considers topics that have actually been seen.
   * @returns {Array<{ id, title, grade, weakness, accuracy, seen }>}
   */
  function weakAreas(srsMap, topics, limit = 3) {
    const map = srsMap || {};
    return topics
      .filter((t) => map[t.id] && map[t.id].seen > 0)
      .map((t) => {
        const st = topicStats(map[t.id]);
        return { id: t.id, title: t.title, grade: t.grade, weakness: st.weakness, accuracy: st.accuracy, seen: st.seen };
      })
      .filter((x) => x.weakness >= 0.34) // only genuinely shaky topics
      .sort((a, b) => b.weakness - a.weakness)
      .slice(0, limit);
  }

  function overall(srsMap) {
    const map = srsMap || {};
    let seen = 0, correct = 0;
    Object.keys(map).forEach((id) => {
      seen += map[id].seen || 0;
      correct += map[id].correct || 0;
    });
    return { seen, correct, accuracy: seen ? correct / seen : null };
  }

  function byGrade(srsMap, topics) {
    const map = srsMap || {};
    const out = {};
    topics.forEach((t) => {
      const c = map[t.id];
      if (!c || !c.seen) return;
      const g = (out[t.grade] = out[t.grade] || { seen: 0, correct: 0 });
      g.seen += c.seen;
      g.correct += c.correct;
    });
    Object.keys(out).forEach((g) => {
      out[g].accuracy = out[g].seen ? out[g].correct / out[g].seen : null;
    });
    return out;
  }

  // Per-grade coverage and mastery (0..1), used to estimate an overall level.
  function gradeMastery(srsMap, topics) {
    const S = srs();
    const map = srsMap || {};
    const byG = {};
    topics.forEach((t) => { (byG[t.grade] = byG[t.grade] || []).push(t); });
    const out = {};
    Object.keys(byG).forEach((g) => {
      const list = byG[g];
      const cards = list.map((t) => map[t.id]).filter((c) => c && c.seen > 0);
      const coverage = list.length ? cards.length / list.length : 0;
      let mastery = 0;
      if (cards.length) {
        mastery = cards.reduce((a, c) =>
          a + (0.5 * (c.correct / c.seen) + 0.5 * (S.clampBox(c.box) / S.MAX_BOX)), 0) / cards.length;
      }
      out[+g] = { grade: +g, coverage, mastery, seen: cards.length, total: list.length };
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
   * "demonstrated" (enough topics seen, high enough mastery) - a competence floor,
   * not a single lucky topic. This is an estimate from practice here, not an
   * assessment.
   * @returns {{ level: number|null, label: string, detail: string, grades: object }}
   */
  function estimatedLevel(srsMap, topics) {
    const gm = gradeMastery(srsMap, topics);
    const grades = Object.values(gm).sort((a, b) => a.grade - b.grade);
    const anySeen = grades.some((g) => g.seen > 0);
    if (!anySeen) {
      return { level: null, label: "New", detail: "Answer a few questions and your estimated level appears here.", grades: gm };
    }
    let level = 0;
    for (const g of grades) {
      if (g.coverage >= DEMO_COVERAGE && g.mastery >= DEMO_MASTERY) level = g.grade;
      else break;
    }
    const working = grades.find((g) => g.grade > level && g.seen > 0);
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

  const api = { topicStats, weakAreas, overall, byGrade, gradeMastery, estimatedLevel };

  global.MTT = global.MTT || {};
  global.MTT.analytics = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
