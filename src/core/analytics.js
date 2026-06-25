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

  const api = { topicStats, weakAreas, overall, byGrade };

  global.MTT = global.MTT || {};
  global.MTT.analytics = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
