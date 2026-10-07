/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Investor/owner scoring.
 *
 * Behavior-identical port of the backend's scorer.py. Investor = cashflow (40) + CAGR (40)
 * + risk (20, always 0); owner = buy/rent ratio (40) + CAGR (40) + risk (20, always 0).
 * The risk legs are hardcoded zero on both sides - the backend never wired the LLM verdict
 * into the numbers either, and per the project decision there is no LLM here.
 *
 * Rounding: Python `round(x, 1)` is banker's rounding, JS `Math.round` rounds half up.
 * The fidelity tests therefore assert exact equality only for the integer-verdict cases
 * (notably 0/0) and a 0.05 tolerance otherwise.
 */

/**
 * @param {number|null|undefined} miete Cold rent in EUR/m².
 * @param {number|null|undefined} area Living space in m².
 * @param {number|null|undefined} price Purchase price in EUR.
 * @returns {number} Cashflow points out of 40.
 */
function cashflowScore(miete, area, price) {
  if (!miete || !price || price === 0 || !area) return 0;
  const netYield = (miete * area * 12 * 0.95) / price;
  if (netYield >= 0.05) return 40.0;
  if (netYield <= 0.015) return 0.0;
  return ((netYield - 0.015) / 0.035) * 40.0;
}

/**
 * @param {number|null|undefined} miete Cold rent in EUR/m².
 * @param {number|null|undefined} area Living space in m².
 * @param {number|null|undefined} price Purchase price in EUR.
 * @returns {number} Buy/rent points out of 40.
 */
function buyRentScore(miete, area, price) {
  if (!miete || !price || price === 0 || !area) return 0;
  const annualRent = miete * 2 * area * 12;
  if (annualRent === 0) return 0;
  const ratio = price / annualRent;
  if (ratio <= 15) return 40.0;
  if (ratio >= 35) return 0.0;
  return ((35 - ratio) / 20) * 40.0;
}

/**
 * @param {number|null|undefined} cagr Compound annual growth rate as a decimal.
 * @returns {number} Growth points out of 40.
 */
function cagrScore(cagr) {
  if (cagr == null) return 0;
  if (cagr >= 0.1) return 40.0;
  if (cagr <= 0.02) return 0.0;
  return ((cagr - 0.02) / (0.1 - 0.02)) * 40.0;
}

/**
 * @param {number|null|undefined} miete Cold rent in EUR/m².
 * @param {number|null|undefined} area Living space in m².
 * @param {number|null|undefined} price Purchase price in EUR.
 * @param {number|null|undefined} cagr Compound annual growth rate as a decimal.
 * @returns {{investorScore: number, ownerScore: number}}
 */
export function calculateScores({ miete, area, price, cagr }) {
  const cashflow = cashflowScore(miete, area, price);
  const buyRent = buyRentScore(miete, area, price);
  const growth = cagrScore(cagr);
  return {
    investorScore: Math.round(Math.min(100, cashflow + growth) * 10) / 10,
    ownerScore: Math.round(Math.min(100, buyRent + growth) * 10) / 10,
  };
}
