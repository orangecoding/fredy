/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Turning the scam signals a listing carries into a verdict on screen.
 *
 * The server does the reading. It stores the signals it found in `scam_signals` and whatever the
 * user decided in `scam_override`, and this file weighs the two exactly the way the server does, so
 * a chip on a card can never disagree with the row underneath it.
 *
 * Duplicated from lib/services/listings/scamSignals.js. The frontend must not import out of lib/ -
 * that code is server-side and free to grow a Node built-in at any time, which would break the Vite
 * build with an error pointing nowhere near the cause. Only the weighing is copied; the phrase lists
 * stay on the server, because nothing here ever reads a description.
 * test/ui/scamSignalsCopyInSync.test.js fails if the copies drift apart.
 */

/**
 * How much each signal contributes.
 * @type {Readonly<Record<string, number>>}
 */
export const SIGNAL_WEIGHTS = Object.freeze({
  advancePayment: 3,
  keysByPost: 3,
  moneyTransferService: 3,
  landlordAbroad: 2,
  noViewing: 2,
  priceFarBelowMarket: 2,
});

/**
 * Every signal there is, in the order they are shown.
 * @type {string[]}
 */
export const SCAM_SIGNALS = Object.freeze(Object.keys(SIGNAL_WEIGHTS));

/**
 * The score from which a listing carries the warning.
 * @type {number}
 */
export const SCAM_SCORE_THRESHOLD = 3;

/**
 * What the user said about a listing, overriding whatever the signals say.
 * @type {Readonly<{SCAM: 'scam', SAFE: 'safe'}>}
 */
export const SCAM_OVERRIDES = Object.freeze({ SCAM: 'scam', SAFE: 'safe' });

/**
 * What the signals add up to.
 *
 * @param {string[]|null|undefined} signals
 * @returns {number}
 */
export function scamScore(signals) {
  if (!Array.isArray(signals)) {
    return 0;
  }
  return signals.reduce((total, signal) => total + (SIGNAL_WEIGHTS[signal] ?? 0), 0);
}

/**
 * Whether a listing is worth warning about, and why.
 *
 * @param {string[]|null|undefined} signals
 * @param {('scam'|'safe'|null|undefined)} override
 * @returns {{suspicious: boolean, score: number, signals: string[], source: ('user'|'signals')}}
 */
export function scamVerdict(signals, override = null) {
  const found = Array.isArray(signals) ? signals : [];
  const score = scamScore(found);

  if (override === SCAM_OVERRIDES.SCAM) {
    return { suspicious: true, score, signals: found, source: 'user' };
  }
  if (override === SCAM_OVERRIDES.SAFE) {
    return { suspicious: false, score, signals: found, source: 'user' };
  }
  return { suspicious: score >= SCAM_SCORE_THRESHOLD, score, signals: found, source: 'signals' };
}

/**
 * Everything a listing row says about the question, in one object.
 *
 * Distinguishes three states the UI treats differently and one it does not care about:
 *
 * - `suspicious` with signals: the warning, and a list of what fired.
 * - `suspicious` because the user said so, with no signals: the warning, and nothing to explain.
 * - not suspicious but carrying signals the user dismissed: the panel still says so, because
 *   somebody coming back to the listing a week later deserves to know what was once flagged.
 * - not suspicious, no signals, no override: the ordinary case, and nothing is rendered at all.
 *
 * @param {Object|null|undefined} listing A row as the listings API returns it.
 * @returns {{suspicious: boolean, score: number, signals: string[], source: ('user'|'signals'),
 *   override: ('scam'|'safe'|null), hasAnything: boolean}}
 */
export function readScamVerdict(listing) {
  const signals = Array.isArray(listing?.scam_signals) ? listing.scam_signals : [];
  const override = listing?.scam_override ?? null;
  const verdict = scamVerdict(signals, override);
  return {
    ...verdict,
    override,
    hasAnything: verdict.suspicious || signals.length > 0 || override != null,
  };
}
