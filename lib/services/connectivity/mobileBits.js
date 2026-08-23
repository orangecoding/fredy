/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Mobile coverage, packed into one integer so the listings overview can filter on it in SQL.
 *
 * The overview's filters run as a WHERE clause over the whole table (see `getListings` in
 * `listingsStorage.js`), so "show me listings with 5G on Telekom" has to be answerable without
 * unpacking JSON per row. A bitmask is the smallest thing that answers it: one indexed integer
 * column, and the filter becomes `connectivity_mobile & ? != 0`.
 *
 * The readable form of the same information lives in the `connectivity` JSON column, which is what
 * the detail page renders. This file is only about making it filterable.
 */

/**
 * The technologies worth distinguishing, in the order the bits are laid out.
 *
 * 3G is missing on purpose: Germany switched it off in 2021, and Switzerland finished in 2025, so
 * a 3G bit would only ever describe a network nobody can still use.
 * @type {string[]}
 */
export const TECHNOLOGIES = ['2g', '4g', '5g', '5g_sa'];

/**
 * The four German network operators, keyed by the short codes the Breitbandatlas uses.
 *
 * Switzerland has operators too (Swisscom, Sunrise, Salt), but its data only reports how many of
 * them cover a square, never which - so there is nothing to map them onto.
 * @type {Record<string, string>}
 */
export const OPERATORS = {
  dt: 'Telekom',
  vf: 'Vodafone',
  tf: 'O2 / Telefónica',
  ee: '1&1',
};

/** Operator codes in the order the bits are laid out. @type {string[]} */
export const OPERATOR_CODES = Object.keys(OPERATORS);

/**
 * Bits 0-3: the technology is available from at least one operator.
 *
 * These carry the answer for every country. Switzerland only ever sets these, because its source
 * counts operators rather than naming them.
 * @type {Record<string, number>}
 */
export const NEUTRAL_BITS = Object.freeze(Object.fromEntries(TECHNOLOGIES.map((tech, index) => [tech, 1 << index])));

/**
 * Bits 4-19: technology × operator, four bits per operator.
 *
 * Laid out operator-major so that all of one operator's technologies sit together, which keeps the
 * arithmetic below readable. The highest bit used is 19, well inside the range SQLite's INTEGER
 * and JavaScript's bitwise operators agree on.
 * @type {Record<string, Record<string, number>>}
 */
export const OPERATOR_BITS = Object.freeze(
  Object.fromEntries(
    OPERATOR_CODES.map((code, operatorIndex) => [
      code,
      Object.freeze(
        Object.fromEntries(
          TECHNOLOGIES.map((tech, techIndex) => [tech, 1 << (4 + operatorIndex * TECHNOLOGIES.length + techIndex)]),
        ),
      ),
    ]),
  ),
);

/**
 * Builds the mask for one normalised mobile result.
 *
 * @param {{neutral?: Record<string, boolean>, operators?: Record<string, Record<string, boolean>>}} mobile
 * @returns {number} The packed mask; 0 when nothing is covered.
 */
export function packMobile(mobile) {
  if (mobile == null) {
    return 0;
  }

  let mask = 0;

  for (const tech of TECHNOLOGIES) {
    if (mobile.neutral?.[tech] === true) {
      mask |= NEUTRAL_BITS[tech];
    }
  }

  for (const code of OPERATOR_CODES) {
    const perTech = mobile.operators?.[code];
    if (perTech == null) continue;
    for (const tech of TECHNOLOGIES) {
      if (perTech[tech] === true) {
        mask |= OPERATOR_BITS[code][tech];
        // An operator covering a square is also proof that the square is covered at all. Setting
        // the neutral bit here means a source that only reports per operator still answers the
        // plain "is there 5G here?" question without a second code path.
        mask |= NEUTRAL_BITS[tech];
      }
    }
  }

  return mask;
}

/**
 * The mask a filter has to test against.
 *
 * With no operator the answer is the neutral bit, which any source can set. With an operator it is
 * that one operator's bit - deliberately not a union with the neutral bit, because "5G at Telekom"
 * must not match a square where only Vodafone has it.
 *
 * @param {string} technology One of `TECHNOLOGIES`.
 * @param {string|null} [operator] One of `OPERATOR_CODES`.
 * @returns {number} The mask, or 0 when the combination does not exist.
 */
export function filterMask(technology, operator = null) {
  if (!TECHNOLOGIES.includes(technology)) {
    return 0;
  }
  if (operator == null) {
    return NEUTRAL_BITS[technology];
  }
  return OPERATOR_BITS[operator]?.[technology] ?? 0;
}
