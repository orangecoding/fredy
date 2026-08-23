/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { TECHNOLOGIES, OPERATOR_CODES } from './mobileBits.js';

/**
 * Turns what the national broadband registers answer into one shape the rest of Fredy can read.
 *
 * The two sources describe the same thing in different units - Germany reports a percentage of
 * households per 100m cell, Switzerland a class number per 250m square - so neither can be handed
 * to the UI as it arrives. Everything that knows about those units lives here, and nothing below
 * this file sees them again.
 */

/**
 * The share of households at which coverage is reported as available.
 *
 * These registers describe a cell, not a building, and a cell is never all-or-nothing: a new fibre
 * run down one side of a street shows up as forty percent. Anything above zero would therefore
 * report gigabit for addresses that cannot get it, and demanding ninety would deny it to most of
 * the addresses that can. Half the households is the point where the answer is more likely right
 * than wrong for a flat picked at random out of the cell.
 *
 * The underlying share always travels alongside the verdict, so the detail page can say "1000
 * Mbit/s, 62 % of households" rather than implying a certainty the data does not carry.
 * @type {number}
 */
export const AVAILABILITY_THRESHOLD_PERCENT = 50;

/**
 * Downstream classes the German register reports, ascending.
 *
 * The values are cumulative ("at least X"), so the series is monotonically non-increasing and the
 * highest class still above the threshold is the headline figure.
 * @type {number[]}
 */
export const DE_DOWNSTREAM_CLASSES = [10, 16, 30, 50, 100, 200, 400, 1000];

/**
 * Downstream classes the Swiss register publishes as separate map layers, ascending.
 * @type {number[]}
 */
export const CH_DOWNSTREAM_CLASSES = [10, 30, 100, 300, 500, 1000];

/**
 * Fixed-line technologies worth telling apart, keyed by the German register's field infix.
 *
 * `ftthb` is fibre to the building or the home, which is the one people actually ask for; `fttc`
 * is copper from the cabinet, `hfc` the cable network. The register knows `ftth` and `fttb`
 * separately too, but the difference between fibre ending in the basement and in the flat is not
 * one a listing can act on.
 * @type {string[]}
 */
export const DE_TECHNOLOGIES = ['ftthb', 'fttc', 'hfc'];

/**
 * What a Swiss class number means, as a representative share in percent.
 *
 * The register publishes four bands (>0-10, >10-50, >50-90, >90-100). A band cannot be turned back
 * into a number, so each is represented by its middle - honest enough for "62 % of buildings" to
 * be shown as an approximation, and ordered correctly for comparisons.
 * @type {Record<number, number>}
 */
const CH_BAND_PERCENT = { 1: 5, 2: 30, 3: 70, 4: 95 };

/**
 * How many operators the Swiss mobile layers count at most.
 *
 * Switzerland has three network operators, and the layer reports how many of them reach a square
 * rather than which. Used only to keep the stored number meaningful if the layer ever reports
 * something larger.
 * @type {number}
 */
const CH_MOBILE_OPERATOR_MAX = 3;

/**
 * Reads a percentage out of a register response.
 *
 * Missing and null are the same answer here - the cell carries no figure for that combination -
 * and both have to become `null` rather than 0, because 0 is a real value meaning "nobody".
 *
 * @param {Record<string, unknown>} attributes
 * @param {string} field
 * @returns {number|null}
 */
function percent(attributes, field) {
  const raw = attributes?.[field];
  if (raw == null || raw === '') {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/**
 * The highest class whose share clears the threshold, with that share.
 *
 * @param {number[]} classes Ascending.
 * @param {(mbit: number) => number|null} shareFor
 * @returns {{maxDownMbit: number|null, sharePercent: number|null}}
 */
function highestClass(classes, shareFor) {
  let maxDownMbit = null;
  let sharePercent = null;

  for (const mbit of classes) {
    const share = shareFor(mbit);
    if (share != null && share >= AVAILABILITY_THRESHOLD_PERCENT) {
      maxDownMbit = mbit;
      sharePercent = share;
    }
  }

  return { maxDownMbit, sharePercent };
}

/**
 * @typedef {Object} TechnologyCoverage
 * @property {number|null} maxDownMbit Highest class this technology reaches at the address.
 * @property {number|null} sharePercent Share of households at that class.
 */

/**
 * @typedef {Object} MobileCoverage
 * @property {string|null} bestTech The best technology available, as the source names it.
 * @property {Record<string, boolean>} neutral Per technology, available from at least one operator.
 * @property {Record<string, Record<string, boolean>>} operators Per operator, per technology.
 * @property {string[]} roamingOnly Operator codes reachable only through national roaming.
 * @property {number|null} operatorCount How many operators cover the place, where that is all the
 * source reports.
 */

/**
 * @typedef {Object} Connectivity
 * @property {number|null} maxDownMbit
 * @property {number|null} sharePercent
 * @property {boolean} fiber
 * @property {Record<string, TechnologyCoverage>} technologies
 * @property {MobileCoverage|null} mobile
 * @property {string} source
 */

/**
 * An empty mobile result, so callers never have to guard every key.
 *
 * @returns {MobileCoverage}
 */
function emptyMobile() {
  return {
    bestTech: null,
    neutral: Object.fromEntries(TECHNOLOGIES.map((tech) => [tech, false])),
    operators: {},
    roamingOnly: [],
    operatorCount: null,
  };
}

/**
 * Normalises one cell of the German broadband register.
 *
 * @param {Record<string, unknown>|null} fixed Attributes of the `festnetz_grid` cell.
 * @param {Record<string, unknown>|null} mobile Attributes of the `mobilfunk_grid` cell.
 * @returns {Connectivity|null} `null` when neither half answered - a cell nobody has data for is
 * indistinguishable from a failed lookup as far as the UI is concerned, and storing an all-empty
 * record would claim we know there is nothing.
 */
export function normalizeGerman(fixed, mobile) {
  if (fixed == null && mobile == null) {
    return null;
  }

  const headline = highestClass(DE_DOWNSTREAM_CLASSES, (mbit) => percent(fixed, `down_fn_hh_alle_${mbit}`));

  /** @type {Record<string, TechnologyCoverage>} */
  const technologies = {};
  for (const tech of DE_TECHNOLOGIES) {
    technologies[tech] = highestClass(DE_DOWNSTREAM_CLASSES, (mbit) => percent(fixed, `down_fn_hh_${tech}_${mbit}`));
  }

  return {
    maxDownMbit: headline.maxDownMbit,
    sharePercent: headline.sharePercent,
    fiber: technologies.ftthb.maxDownMbit != null,
    technologies,
    mobile: normalizeGermanMobile(mobile),
    source: 'de-bba',
  };
}

/**
 * Normalises the mobile half of a German cell.
 *
 * The availability fields are a two-bit flag rather than a boolean: bit 0 is the operator's own
 * network, bit 1 is national roaming on somebody else's. Only 1&1 ever sets the roaming bit, and
 * for a flat the distinction is worth keeping - roaming coverage is real coverage, but it is the
 * kind an operator can lose in a contract negotiation.
 *
 * @param {Record<string, unknown>|null} attributes
 * @returns {MobileCoverage|null}
 */
function normalizeGermanMobile(attributes) {
  if (attributes == null) {
    return null;
  }

  const result = emptyMobile();

  const best = attributes.beste_tech;
  result.bestTech = typeof best === 'string' && best !== 'keine' ? best : null;

  for (const tech of TECHNOLOGIES) {
    result.neutral[tech] = Number(attributes[`verf_${tech}`] ?? 0) > 0;
  }

  const roamingOnly = new Set();
  for (const code of OPERATOR_CODES) {
    /** @type {Record<string, boolean>} */
    const perTech = {};
    for (const tech of TECHNOLOGIES) {
      const flags = Number(attributes[`verf_${tech}_${code}`] ?? 0);
      perTech[tech] = flags > 0;
      // Bit 0 clear but something set means the only way in is somebody else's network.
      if (flags > 0 && (flags & 1) === 0) {
        roamingOnly.add(code);
      }
    }
    if (Object.values(perTech).some(Boolean)) {
      result.operators[code] = perTech;
    }
  }
  result.roamingOnly = [...roamingOnly];

  return result;
}

/**
 * Normalises one Swiss square.
 *
 * @param {Record<string, number>} bands Class number per layer id, as the WMS reported them.
 * @returns {Connectivity|null} `null` when no layer answered.
 */
export function normalizeSwiss(bands) {
  if (bands == null || Object.keys(bands).length === 0) {
    return null;
  }

  const shareOf = (layer) => {
    const band = bands[layer];
    return band == null ? null : (CH_BAND_PERCENT[band] ?? null);
  };

  const headline = highestClass(CH_DOWNSTREAM_CLASSES, (mbit) => shareOf(`ch.bakom.downlink${mbit}`));
  const fiberShare = shareOf('ch.bakom.anschlussart-glasfaser');
  const fiberCovered = fiberShare != null && fiberShare >= AVAILABILITY_THRESHOLD_PERCENT;

  return {
    maxDownMbit: headline.maxDownMbit,
    sharePercent: headline.sharePercent,
    fiber: fiberCovered,
    technologies: {
      // The Swiss register says whether a square is served by fibre, not how fast that fibre is.
      // Reporting the headline speed here would attribute the cable network's gigabit to fibre.
      ftthb: { maxDownMbit: null, sharePercent: fiberCovered ? fiberShare : null },
    },
    mobile: normalizeSwissMobile(bands),
    source: 'ch-bakom',
  };
}

/**
 * Normalises the mobile half of a Swiss square.
 *
 * The layer counts how many of the three operators reach the square, so there is no per-operator
 * answer to give - only whether anyone is there at all.
 *
 * @param {Record<string, number>} bands
 * @returns {MobileCoverage|null}
 */
function normalizeSwissMobile(bands) {
  const counts = {
    '4g': bands['ch.bakom.mobilnetz-4g'],
    '5g': bands['ch.bakom.mobilnetz-5g'],
  };

  if (counts['4g'] == null && counts['5g'] == null) {
    return null;
  }

  const result = emptyMobile();
  result.neutral['4g'] = Number(counts['4g'] ?? 0) > 0;
  result.neutral['5g'] = Number(counts['5g'] ?? 0) > 0;
  result.bestTech = result.neutral['5g'] ? '5g' : result.neutral['4g'] ? '4g' : null;
  result.operatorCount = Math.min(
    CH_MOBILE_OPERATOR_MAX,
    Math.max(Number(counts['4g'] ?? 0), Number(counts['5g'] ?? 0)),
  );

  return result;
}
