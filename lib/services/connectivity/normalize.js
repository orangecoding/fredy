/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { TECHNOLOGIES, OPERATOR_CODES } from './mobileBits.js';

/**
 * Turns what the national broadband registers answer into one shape the rest of Fredy can read.
 *
 * Every source describes the same thing in different units - Germany reports a percentage of
 * households per 100m cell, Switzerland a class number per 250m square, Austria and Spain the
 * actual offers of the named providers - so none of them can be handed to the UI as it arrives.
 * Everything that knows about those units lives here, and nothing below this file sees them again.
 *
 * The registers fall into two families, and the difference shows on the card. Germany and
 * Switzerland publish *shares*: what fraction of a cell can get a speed class, which is why those
 * two carry a percentage and a meter. Austria and Spain publish the *offers themselves*: this
 * provider, this technology, this many Mbit/s, at this address or this 100m cell. The second kind
 * has no share to report - there is nothing to take a fraction of - so `sharePercent` stays null
 * and the card simply leaves the meter out.
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
 * @property {number|null} operatorTotal How many network operators the country has, so that a
 * count has a denominator. Travels with the count rather than living in the UI because it is a
 * fact about the source's country, and the card renders four countries with three different
 * answers.
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
    operatorTotal: null,
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
  result.operatorTotal = CH_MOBILE_OPERATOR_MAX;

  return result;
}

/**
 * How many mobile network operators Austria has.
 *
 * Three - A1, Magenta and Drei - and the register names all of them at every cell it answers for,
 * so the count below is exact rather than a clamp.
 * @type {number}
 */
const AT_MOBILE_OPERATOR_MAX = 3;

/**
 * How many mobile network operators Spain has, after the mergers that produced MasOrange.
 *
 * Four, and the same caveat as Switzerland applies for a different reason: the register lists the
 * companies serving a square by tax number, and a list can in principle be longer than the set of
 * networks behind it.
 * @type {number}
 */
const ES_MOBILE_OPERATOR_MAX = 4;

/**
 * What the Austrian register's technology names mean in Fredy's three buckets.
 *
 * The register files `5G-FWA`, `4G-FWA`, `WiMAX` and `WLAN` under the same "Festnetz" heading.
 * They are deliberately missing here: they are radio rather than a line into the building, and
 * sorting them into one of the three buckets would have the card tell somebody they have cable.
 * They do count towards the headline speed - the register counts them as an offer at the address,
 * and somebody looking at a farmhouse wants to know a hundred megabits arrive somehow, even by
 * antenna.
 * @type {Record<string, string>}
 */
const AT_TECHNOLOGIES = {
  FTTH: 'ftthb',
  FTTB: 'ftthb',
  'DOCSIS 3.1': 'hfc',
  'DOCSIS 3.0': 'hfc',
  'DOCSIS 1.0/2.0': 'hfc',
  xDSL: 'fttc',
};

/**
 * What the Spanish register's technology names mean in Fredy's three buckets.
 *
 * Nothing maps to `fttc`, and that is the data rather than an omission: the ministry's wired map
 * covers fibre and coax only, because Spain is switching its copper off and stopped mapping it.
 * Fixed wireless has a map of its own, which lands in no bucket for the same reason as Austria's -
 * and could not be bucketed anyway, because its second field holds the operator's name where the
 * wired map holds a technology.
 * @type {Record<string, string>}
 */
const ES_TECHNOLOGIES = {
  FTTH: 'ftthb',
  FTTB: 'ftthb',
  'DOCSIS3.1': 'hfc',
  'DOCSIS3.0': 'hfc',
  HFC: 'hfc',
};

/**
 * One provider's offer at an address, as the offer-publishing registers report it.
 *
 * @typedef {Object} FixedOffer
 * @property {string|null} bucket One of `DE_TECHNOLOGIES`, or `null` for a technology Fredy does
 * not name separately.
 * @property {number|null} downMbit
 */

/**
 * Folds a list of offers into the headline figure and the per-technology breakdown.
 *
 * The fastest offer wins in both places. Two providers at an address are a choice rather than a
 * sum, and the number worth printing is the best one that can be ordered.
 *
 * @param {FixedOffer[]} offers
 * @returns {{maxDownMbit: number|null, technologies: Record<string, TechnologyCoverage>, fiber: boolean}}
 */
function foldOffers(offers) {
  /** @type {Record<string, TechnologyCoverage>} */
  const technologies = {};
  for (const tech of DE_TECHNOLOGIES) {
    technologies[tech] = { maxDownMbit: null, sharePercent: null };
  }

  let maxDownMbit = null;
  let fiber = false;

  for (const offer of offers) {
    if (offer.downMbit != null && (maxDownMbit == null || offer.downMbit > maxDownMbit)) {
      maxDownMbit = offer.downMbit;
    }
    if (offer.bucket === 'ftthb') {
      // Tracked separately from the bucket's speed: a fibre offer whose speed the register left
      // blank is still fibre, and the headline flag is what the overview filters on.
      fiber = true;
    }
    const coverage = offer.bucket == null ? null : technologies[offer.bucket];
    if (coverage == null || offer.downMbit == null) {
      continue;
    }
    if (coverage.maxDownMbit == null || offer.downMbit > coverage.maxDownMbit) {
      coverage.maxDownMbit = offer.downMbit;
    }
  }

  return { maxDownMbit, technologies, fiber };
}

/**
 * Reads a speed out of a register response, in Mbit/s.
 *
 * @param {unknown} raw
 * @returns {number|null} `null` for anything that is not a positive number - zero included, which
 * the Spanish register uses for "no figure" rather than "no speed".
 */
function mbit(raw) {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Normalises one 100m cell of the Austrian Breitbandatlas.
 *
 * @param {Array<Record<string, unknown>>|null} fixed The cell's fixed-line providers, or `null`
 * when that half of the lookup failed.
 * @param {Array<Record<string, unknown>>|null} mobile The cell's mobile providers, same.
 * @returns {Connectivity|null} `null` when neither half answered. An empty array is an answer -
 * the register says nobody serves this cell - and is kept apart from a failed request for the same
 * reason as in Germany: one is knowledge, the other is an outage.
 */
export function normalizeAustrian(fixed, mobile) {
  if (fixed == null && mobile == null) {
    return null;
  }

  const folded = foldOffers(
    (fixed ?? []).map((provider) => ({
      bucket: AT_TECHNOLOGIES[String(provider?.technik)] ?? null,
      downMbit: mbit(provider?.download),
    })),
  );

  return {
    maxDownMbit: folded.maxDownMbit,
    // The register publishes the offers themselves, not what share of the cell can take them up,
    // so there is no percentage to report and the card leaves its meter out.
    sharePercent: null,
    fiber: folded.fiber,
    technologies: folded.technologies,
    mobile: normalizeAustrianMobile(mobile),
    source: 'at-rtr',
  };
}

/**
 * Normalises the mobile half of an Austrian cell.
 *
 * The register names the three operators, which Fredy does not keep: the per-operator half of the
 * stored bitmask is laid out for the four German codes, and widening it would change what every
 * mask already in the database means. What survives is the count, which is the part that decides
 * something - one operator out of three means the choice of contract is made for you.
 *
 * @param {Array<Record<string, unknown>>|null} providers
 * @returns {MobileCoverage|null}
 */
function normalizeAustrianMobile(providers) {
  if (providers == null) {
    return null;
  }

  const result = emptyMobile();

  const operators = new Set();
  for (const provider of providers) {
    const tech = String(provider?.technik ?? '').toLowerCase();
    if (tech === '4g' || tech === '5g') {
      result.neutral[tech] = true;
    }
    // Falls back to the company name: the key is what the map filters on and could be dropped
    // without the human-readable half going with it, and an operator counted twice would read as
    // more choice than there is.
    const operator = provider?.company_key ?? provider?.company;
    if (operator != null) {
      operators.add(String(operator));
    }
  }

  result.bestTech = result.neutral['5g'] ? '5g' : result.neutral['4g'] ? '4g' : null;
  result.operatorCount = Math.min(AT_MOBILE_OPERATOR_MAX, operators.size);
  result.operatorTotal = AT_MOBILE_OPERATOR_MAX;

  return result;
}

/**
 * Splits one `Cobertura` string into the offers it packs.
 *
 * The Spanish maps put a whole table in one column: entries separated by `#`, and within an entry
 * the operator's tax number, the technology, the speed, whether that operator owns the line or
 * resells somebody else's, and whether it was built with public money, separated by `;`. Only the
 * first three matter here; the rest is what the ministry's own viewer prints in its popup.
 *
 * The fixed-wireless map writes three fields rather than five, and puts the operator's name where
 * the wired map puts the technology. The speed stays in the same place, which is the only field
 * the caller reads off an entry from that map - so one reader serves both.
 *
 * @param {unknown} raw
 * @returns {Array<{operator: string, technology: string, downMbit: number|null}>}
 */
export function parseSpanishCoverage(raw) {
  if (typeof raw !== 'string' || raw === '') {
    return [];
  }

  const entries = [];
  for (const part of raw.split('#')) {
    const [operator, technology, speed] = part.split(';');
    if (operator == null || operator === '') {
      continue;
    }
    entries.push({ operator, technology: technology ?? '', downMbit: mbit(speed) });
  }
  return entries;
}

/**
 * Reads the operators out of a mobile `COBERTURA` string.
 *
 * The mobile maps pack the same column name with a different shape: a bare list of tax numbers,
 * with no technology or speed beside them, because the map itself is the technology. Parsing one
 * with the fixed-line reader gives a single entry whose "technology" is the second operator, which
 * is wrong in a way nothing downstream can notice - it just reports one operator where there are
 * four.
 *
 * @param {unknown} raw
 * @returns {string[]} The distinct operators named, in the order they appear.
 */
export function parseSpanishOperators(raw) {
  if (typeof raw !== 'string' || raw === '') {
    return [];
  }
  // Both separators, because the ministry uses `;` here and `#` on the fixed-line maps, and a
  // reader that accepts either cannot be broken by the two being brought into line later.
  return [
    ...new Set(
      raw
        .split(/[#;]/)
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ];
}

/**
 * Normalises what the Spanish maps report for one place.
 *
 * Four maps rather than one, because the ministry publishes wired, fixed wireless, 4G and 5G as
 * separate services. Each arrives as the features a point query returned - several, because the
 * wired map is drawn per cadastral parcel and a coordinate on a building's doorstep sits between
 * two of them as often as on one.
 *
 * @param {Object} answers
 * @param {Array<Record<string, unknown>>|null} [answers.wired] Parcels with a cable or fibre line.
 * @param {Array<Record<string, unknown>>|null} [answers.fwa] Parcels served by fixed wireless.
 * @param {Array<Record<string, unknown>>|null} [answers.mobile4g] 4G service areas.
 * @param {Array<Record<string, unknown>>|null} [answers.mobile5g] 5G service areas.
 * @returns {Connectivity|null} `null` when no map answered at all.
 */
export function normalizeSpanish({ wired = null, fwa = null, mobile4g = null, mobile5g = null } = {}) {
  if (wired == null && fwa == null && mobile4g == null && mobile5g == null) {
    return null;
  }

  /** @type {FixedOffer[]} */
  const offers = [];
  for (const feature of wired ?? []) {
    for (const entry of parseSpanishCoverage(feature?.Cobertura)) {
      offers.push({ bucket: ES_TECHNOLOGIES[entry.technology] ?? null, downMbit: entry.downMbit });
    }
  }
  for (const feature of fwa ?? []) {
    // No bucket, ever: fixed wireless is an antenna on the roof, and the three buckets are about
    // what kind of line reaches the building. It still raises the headline, same as in Austria -
    // where it carries a speed at all, which over much of rural Spain it does not: the map records
    // that an operator serves the parcel and leaves the figure at zero.
    for (const entry of parseSpanishCoverage(feature?.Cobertura)) {
      offers.push({ bucket: null, downMbit: entry.downMbit });
    }
  }

  const folded = foldOffers(offers);

  // `Velocidad` is the parcel's headline, already reconciled across its operators by the ministry.
  // Taken as a floor rather than instead of the offers, because the per-operator entries are the
  // ones carrying the technology and the two have to agree on the number printed above them.
  let maxDownMbit = folded.maxDownMbit;
  for (const feature of [...(wired ?? []), ...(fwa ?? [])]) {
    const headline = mbit(feature?.Velocidad);
    if (headline != null && (maxDownMbit == null || headline > maxDownMbit)) {
      maxDownMbit = headline;
    }
  }

  return {
    maxDownMbit,
    sharePercent: null,
    fiber: folded.fiber,
    technologies: folded.technologies,
    mobile: normalizeSpanishMobile(mobile4g, mobile5g),
    source: 'es-setid',
  };
}

/**
 * Normalises the mobile half of a Spanish lookup.
 *
 * The two maps name the operators serving each 50m square by tax number, in a plainer shape than
 * the fixed-line maps use - see `parseSpanishOperators`. Those names are kept only as a count, for
 * the same reason as Austria's, and the count is the larger of the two technologies: an operator
 * with 4G here and no 5G is still an operator with coverage here.
 *
 * @param {Array<Record<string, unknown>>|null} mobile4g
 * @param {Array<Record<string, unknown>>|null} mobile5g
 * @returns {MobileCoverage|null}
 */
function normalizeSpanishMobile(mobile4g, mobile5g) {
  if (mobile4g == null && mobile5g == null) {
    return null;
  }

  const operatorsFor = (features) => {
    const operators = new Set();
    for (const feature of features ?? []) {
      for (const operator of parseSpanishOperators(feature?.COBERTURA)) {
        operators.add(operator);
      }
    }
    return operators;
  };

  const on4g = operatorsFor(mobile4g);
  const on5g = operatorsFor(mobile5g);

  const result = emptyMobile();
  result.neutral['4g'] = on4g.size > 0;
  result.neutral['5g'] = on5g.size > 0;
  result.bestTech = result.neutral['5g'] ? '5g' : result.neutral['4g'] ? '4g' : null;
  // Every operator present on either map: one with only 5G here still covers the place. The larger
  // of the two sets undercounted as soon as they differed ({A, B} on 4G and {C} on 5G is three).
  result.operatorCount = Math.min(ES_MOBILE_OPERATOR_MAX, new Set([...on4g, ...on5g]).size);
  result.operatorTotal = ES_MOBILE_OPERATOR_MAX;

  return result;
}
