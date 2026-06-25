/* core/srs.js - spaced-repetition scheduling (Leitner + response signals).
 *
 * One "card" of state per topic id. A correct answer promotes the card to a
 * higher Leitner box (seen less often); a miss demotes it (resurfaces sooner).
 * Each box maps to a review interval that roughly doubles, so well-known topics
 * fade into the background while weak ones keep coming back.
 *
 * Beyond pass/fail, cards track accuracy and a rolling response time, so the
 * session builder can resurface genuinely weak or hesitant topics first - not
 * just whatever is nominally "due".
 *
 * Pure and deterministic: callers pass `now` (ms epoch); nothing reads the clock.
 *
 * Public surface: global `MTT.srs`.
 *
 * @typedef {{ box: number, seen: number, correct: number, streak: number,
 *   lapses: number, avgMs: number|null, lastSeen: number|null,
 *   dueAt: number|null }} Card
 */
(function (global) {
  "use strict";

  const MAX_BOX = 5;
  const DAY = 86400000;

  // Review interval for each Leitner box (ms). Box 0 is due immediately (still in
  // the active rotation); higher boxes wait days, roughly doubling.
  const BOX_INTERVAL = [0, 1 * DAY, 2 * DAY, 4 * DAY, 8 * DAY, 16 * DAY];

  // Response times above this are treated as "walked away", not slow recall.
  const MAX_RESPONSE_MS = 60000;

  function defaultCard() {
    return {
      box: 0, seen: 0, correct: 0, streak: 0, lapses: 0,
      avgMs: null, lastSeen: null, dueAt: null,
    };
  }

  function clampBox(b) {
    return Math.max(0, Math.min(MAX_BOX, b));
  }

  function intervalMs(box) {
    return BOX_INTERVAL[clampBox(box)];
  }

  /**
   * Apply an answer to a card, returning a NEW card (no mutation).
   * @param {Card} card
   * @param {{ correct: boolean, responseMs?: number, now: number }} result
   * @returns {Card}
   */
  function update(card, result) {
    const c = Object.assign(defaultCard(), card || {});
    const now = result.now;
    const correct = !!result.correct;

    c.seen += 1;
    if (correct) {
      c.correct += 1;
      c.streak += 1;
      c.box = clampBox(c.box + 1);
    } else {
      c.streak = 0;
      c.lapses += 1;
      // A miss demotes one box; a miss from a low box drops straight to 0 so the
      // topic re-enters the active rotation immediately.
      c.box = c.box <= 1 ? 0 : clampBox(c.box - 1);
    }

    if (typeof result.responseMs === "number" && result.responseMs >= 0) {
      const ms = Math.min(result.responseMs, MAX_RESPONSE_MS);
      c.avgMs = c.avgMs == null ? ms : Math.round(c.avgMs * 0.7 + ms * 0.3);
    }

    c.lastSeen = now;
    c.dueAt = now + intervalMs(c.box);
    return c;
  }

  function accuracy(card) {
    if (!card || !card.seen) return null;
    return card.correct / card.seen;
  }

  function isDue(card, now) {
    if (!card || card.dueAt == null) return true; // never scheduled => due
    return card.dueAt <= now;
  }

  /**
   * Urgency score: higher means "practise sooner". Ordering, in effect:
   *   never-seen  >  overdue  >  low box  >  poor accuracy  >  slow/hesitant.
   * Used by the session builder to rank the candidate pool.
   */
  function priority(card, now) {
    const c = card || defaultCard();
    if (!c.seen) return 1e12; // unseen topics first
    const box = clampBox(c.box);
    const overdue = c.dueAt == null ? DAY : Math.max(0, now - c.dueAt);
    const acc = accuracy(c);
    const slow = c.avgMs != null ? Math.min(c.avgMs, MAX_RESPONSE_MS) / MAX_RESPONSE_MS : 0;
    return (MAX_BOX - box) * 1e8 // weakest boxes dominate
      + (1 - acc) * 1e6 // then poor accuracy
      + Math.min(overdue / DAY, 1e3) * 1e3 // then how overdue
      + slow * 100; // then hesitancy
  }

  // A 0..1 "needs work" score for analytics/weak-area surfacing.
  function weakness(card) {
    const c = card || defaultCard();
    if (!c.seen) return 0.5; // unknown: neutral-high
    const acc = accuracy(c);
    const boxFactor = 1 - clampBox(c.box) / MAX_BOX;
    return Math.max(0, Math.min(1, 0.6 * (1 - acc) + 0.4 * boxFactor));
  }

  const api = {
    MAX_BOX, BOX_INTERVAL, DAY,
    defaultCard, update, intervalMs, accuracy, isDue, priority, weakness, clampBox,
  };

  global.MTT = global.MTT || {};
  global.MTT.srs = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
