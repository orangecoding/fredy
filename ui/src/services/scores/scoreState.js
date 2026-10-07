/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Shared score-display state for the overview chips, the table chip and the score card.
 *
 * One rule everywhere: a score that was never computed renders as a grey dash, never
 * as a colored zero. The score columns default to 0, so "no value" cannot be read off
 * a single field - an unscored row and a genuine zero verdict look identical in one
 * column. The row-level rule below tells them apart: a row counts as scored when it
 * has a price and carries anything a scoring run could only have written (a nonzero
 * leg, or GREIX data). This mirrors what the enrichment catch-up selects - a row it
 * would still pick is, by definition, not scored yet.
 *
 * Risk is points on every surface (0-20, high is good: genuine 0 is bad/red, top is
 * good/green). The raw `asset_risk_score` (0-100, low is safe) is never displayed; it
 * only feeds the mapping. A raw 0/`null` means "never assessed" - nothing computes
 * risk - and renders as a grey dash, not as points.
 */

/**
 * Whether a listing row carries computed scores.
 *
 * @param {Object|null|undefined} listing Listing row from the API.
 * @returns {boolean} True when a scoring run wrote to this row.
 */
export function isScoredListing(listing) {
  const price = listing?.price ?? 0;
  if (!(price > 0)) return false;
  const investor = listing?.investor_score ?? 0;
  const owner = listing?.owner_score ?? 0;
  const cagr = listing?.greix_cagr ?? null;
  return !(investor === 0 && owner === 0 && cagr == null);
}

/**
 * Map a raw asset risk (0-100, low is safe) to points (0-20, high is good).
 *
 * Same mapping the score card always used: a raw 0 is the unassessed default and maps
 * to 0 points, which is why callers must check {@link isRiskAssessed} first instead of
 * displaying the points of an unassessed row.
 *
 * @param {number|null|undefined} assetRisk Raw asset risk score.
 * @returns {number} Risk points out of 20.
 */
export function riskPoints(assetRisk) {
  if (!assetRisk || assetRisk === 0) return 0;
  if (assetRisk < 5) return 15;
  if (assetRisk < 10) return 10;
  if (assetRisk < 20) return 5;
  return 0;
}

/**
 * Whether a listing row carries a real risk assessment.
 *
 * @param {Object|null|undefined} listing Listing row from the API.
 * @returns {boolean} True when something actually assessed this row's risk.
 */
export function isRiskAssessed(listing) {
  const raw = listing?.asset_risk_score;
  return raw != null && raw !== 0;
}
