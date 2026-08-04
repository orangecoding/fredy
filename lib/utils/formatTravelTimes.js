/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Wording per UI language.
 *
 * Follows the same rule as the "rooms" unit in {@link ../utils/formatListing.js}: an unknown
 * language falls back to English rather than to German.
 * @type {Record<string, {transit: string, car: string, walk: string, change: string, changes: string}>}
 */
const LABELS = {
  de: { transit: 'ÖPNV', car: 'Auto', walk: 'zu Fuß', change: 'Umstieg', changes: 'Umstiege' },
  en: { transit: 'transit', car: 'car', walk: 'walk', change: 'change', changes: 'changes' },
  tr: { transit: 'toplu taşıma', car: 'araba', walk: 'yürüyerek', change: 'aktarma', changes: 'aktarma' },
};

/**
 * One address' travel times as a short phrase.
 *
 * @param {Object} entry
 * @param {ReturnType<typeof labelsFor>} labels
 * @returns {string|null} `null` when nothing was routable for this address.
 */
function formatEntry(entry, labels) {
  const parts = [];

  if (entry?.transit?.minutes != null) {
    const transfers = entry.transit.transfers ?? 0;
    const suffix = transfers > 0 ? ` (${transfers} ${transfers === 1 ? labels.change : labels.changes})` : '';
    parts.push(`${entry.transit.minutes} min ${labels.transit}${suffix}`);
  }
  if (entry?.car?.minutes != null) {
    parts.push(`${entry.car.minutes} min ${labels.car}`);
  }
  if (entry?.walk?.minutes != null) {
    parts.push(`${entry.walk.minutes} min ${labels.walk}`);
  }

  return parts.length === 0 ? null : `${entry.label}: ${parts.join(', ')}`;
}

/**
 * @param {string} language
 * @returns {{transit: string, car: string, walk: string, change: string, changes: string}}
 */
function labelsFor(language) {
  return LABELS[language] ?? LABELS.en;
}

/**
 * How long it takes to reach a listing, as one line of text.
 *
 * Returns `null` unless there is something real to say. That is the whole contract: a notification
 * must never carry a commute the router did not actually produce, and "not computed yet" is not a
 * value worth interrupting somebody with. Callers rely on the null to leave the line out entirely.
 *
 * Cycling is left out on purpose - three numbers per address is already at the edge of what fits in
 * a push notification, and the detail page shows the full set.
 *
 * @param {Array<Object>|null|undefined} travelTimes - Entries as stored per address.
 * @param {string} [language='en'] UI language of the job's owner.
 * @returns {string|null}
 */
export function formatTravelTimes(travelTimes, language = 'en') {
  if (!Array.isArray(travelTimes) || travelTimes.length === 0) {
    return null;
  }
  const labels = labelsFor(language);
  const formatted = travelTimes.map((entry) => formatEntry(entry, labels)).filter((line) => line != null);
  return formatted.length === 0 ? null : formatted.join(' | ');
}
