/* core/srs.js - spaced-repetition scheduling (Leitner + response signals).
 *
 * One card of state per learning-objective id. A correct answer promotes it to a
 * higher Leitner box (seen less often); a miss demotes it (resurfaces sooner).
 * Each box maps to a review interval that roughly doubles, so well-known objectives
 * fade into the background while weak ones keep coming back.
 *
 * Beyond pass/fail, cards track accuracy and a rolling response time, so the
 * session builder can resurface genuinely weak or hesitant objectives first - not
 * just whatever is nominally "due".
 *
 * Pure and deterministic: callers pass `now` (ms epoch); nothing reads the clock.
 *
 * Public surface: global `MTT.srs`.
 *
 * @typedef {{ box: number, seen: number, correct: number, streak: number,
 *   lapses: number, avgMs: number|null, lastSeen: number|null,
 *   dueAt: number|null, evidence: number, earned: number,
 *   promotionCredit: number }} Card
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

  // Guess guard: a brand-new topic (box 0) must be answered correctly twice in a
  // row to graduate when the answer looks like a coin-flip - a sub-second reply
  // (likely a misclick or lucky stab) or a question with very few options, where
  // a blind guess already carries a high chance of landing. Cards past box 0 have
  // survived earlier reviews, so a single lucky answer there matters far less.
  const GUESS_MS = 900;
  const GUESS_MAX_CHOICES = 2;
  const CONFIRM_STREAK = 2;

  // Graded quality bands (used when a caller passes a 0..1 `quality`): a full
  // success promotes, a near miss holds the box (neither reward nor punish the
  // schedule), and a poor attempt demotes like an outright miss.
  const QUALITY_PASS = 0.8;
  const QUALITY_HOLD = 0.5;
  const CONFIRMED_EVIDENCE = 2;

  function clamp01(x) {
    return Math.max(0, Math.min(1, x));
  }

  function defaultCard() {
    return {
      box: 0, seen: 0, correct: 0, streak: 0, lapses: 0,
      avgMs: null, lastSeen: null, dueAt: null,
      evidence: 0, earned: 0, promotionCredit: 0,
    };
  }

  function normalizeCard(card) {
    const source = card || {};
    const c = Object.assign(defaultCard(), source);
    if (typeof source.evidence !== "number" || source.evidence < 0 || (source.evidence === 0 && c.seen > 0)) {
      c.evidence = c.seen || 0;
    }
    if (typeof source.earned !== "number" || source.earned < 0 || (source.earned === 0 && c.correct > 0)) {
      c.earned = c.correct || 0;
    }
    if (typeof c.promotionCredit !== "number" || c.promotionCredit < 0) c.promotionCredit = 0;
    return c;
  }

  function clampBox(b) {
    return Math.max(0, Math.min(MAX_BOX, b));
  }

  function intervalMs(box) {
    return BOX_INTERVAL[clampBox(box)];
  }

  /**
   * Apply an answer to a card, returning a NEW card (no mutation).
   *
   * `quality` (optional, 0..1) grades a partial attempt - e.g. a sung phrase
   * where most but not all notes matched - so a near miss holds the card's box
   * rather than being scored as an outright failure. When omitted the boolean
   * `correct` decides the outcome, exactly as a two-way answer does.
   *
   * `choices` (optional) is the number of options the answer was picked from; a
   * small count feeds the guess guard on brand-new cards.
   *
   * @param {Card} card
   * @param {{ correct: boolean, responseMs?: number, now: number,
   *   quality?: number, choices?: number, confidence?: number }} result
   * @returns {Card}
   */
  function update(card, result) {
    const c = normalizeCard(card);
    const now = result.now;
    const confidence = typeof result.confidence === "number" && isFinite(result.confidence)
      ? clamp01(result.confidence) : 1;

    const hasQuality = typeof result.quality === "number" && isFinite(result.quality);
    const quality = hasQuality ? clamp01(result.quality) : null;
    const outcome = hasQuality
      ? (quality >= QUALITY_PASS ? "pass" : quality >= QUALITY_HOLD ? "hold" : "miss")
      : (result.correct ? "pass" : "miss");

    const responseMs = (typeof result.responseMs === "number" && result.responseMs >= 0)
      ? Math.min(result.responseMs, MAX_RESPONSE_MS) : null;

    c.seen += 1;
    c.evidence += confidence;
    c.earned += confidence * (hasQuality ? quality : result.correct ? 1 : 0);

    if (outcome === "pass") {
      c.correct += 1;
      c.streak += 1;
      c.promotionCredit += confidence;
      const fewChoices = typeof result.choices === "number" && result.choices <= GUESS_MAX_CHOICES;
      const looksLikeGuess = (responseMs != null && responseMs < GUESS_MS) || fewChoices;
      const unconfirmedNewCard = c.box === 0 && c.streak < CONFIRM_STREAK;
      if (c.promotionCredit >= 1 && !(unconfirmedNewCard && looksLikeGuess)) {
        c.box = clampBox(c.box + 1);
        c.promotionCredit -= 1;
      }
    } else if (outcome === "hold") {
      c.streak = 0;
      c.promotionCredit = 0;
    } else {
      c.streak = 0;
      c.lapses += 1;
      c.promotionCredit = 0;
      if (confidence >= 1) c.box = c.box <= 1 ? 0 : clampBox(c.box - 1);
    }

    if (responseMs != null) {
      c.avgMs = c.avgMs == null ? responseMs : Math.round(c.avgMs * 0.7 + responseMs * 0.3);
    }

    c.lastSeen = now;
    c.dueAt = now + intervalMs(c.box);
    return c;
  }

  function accuracy(card) {
    if (!card) return null;
    const c = normalizeCard(card);
    if (!c.evidence) return null;
    return c.earned / c.evidence;
  }

  function evidence(card) {
    return card ? normalizeCard(card).evidence : 0;
  }

  function isConfirmed(card) {
    return evidence(card) >= CONFIRMED_EVIDENCE;
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
    const c = normalizeCard(card);
    if (!c.seen) return 1e12; // unseen objectives first
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
    const c = normalizeCard(card);
    if (!c.seen) return 0.5; // unknown: neutral-high
    const acc = accuracy(c);
    const boxFactor = 1 - clampBox(c.box) / MAX_BOX;
    return Math.max(0, Math.min(1, 0.6 * (1 - acc) + 0.4 * boxFactor));
  }

  function aggregate(cards) {
    const list = (cards || []).filter(Boolean).map(normalizeCard);
    if (!list.length) return defaultCard();
    const out = defaultCard();
    out.box = Math.min(...list.map((card) => card.box));
    out.seen = list.reduce((sum, card) => sum + card.seen, 0);
    out.correct = list.reduce((sum, card) => sum + card.correct, 0);
    out.streak = Math.min(...list.map((card) => card.streak));
    out.lapses = list.reduce((sum, card) => sum + card.lapses, 0);
    out.evidence = list.reduce((sum, card) => sum + card.evidence, 0);
    out.earned = list.reduce((sum, card) => sum + card.earned, 0);
    const timed = list.filter((card) => typeof card.avgMs === "number" && card.seen > 0);
    out.avgMs = timed.length
      ? Math.round(timed.reduce((sum, card) => sum + card.avgMs * card.seen, 0)
        / timed.reduce((sum, card) => sum + card.seen, 0))
      : null;
    const lastSeen = list.map((card) => card.lastSeen).filter((value) => typeof value === "number");
    out.lastSeen = lastSeen.length ? Math.max(...lastSeen) : null;
    const dueAt = list.map((card) => card.dueAt).filter((value) => typeof value === "number");
    out.dueAt = dueAt.length ? Math.min(...dueAt) : null;
    return out;
  }

  const api = {
    MAX_BOX, BOX_INTERVAL, DAY, CONFIRMED_EVIDENCE,
    defaultCard, normalizeCard, update, intervalMs, accuracy, evidence, isConfirmed,
    isDue, priority, weakness, aggregate, clampBox,
  };

  global.MTT = global.MTT || {};
  global.MTT.srs = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
