/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The modes a travel time can hold, in the order they are shown.
 *
 * Public transport first because it is the one straight-line distance is worst at predicting, which
 * is the reason this feature exists. Cycling last because it is the one people ask for least.
 * @type {Array<{key: string, icon: string, labelKey: string}>}
 */
export const TRAVEL_MODES = [
  { key: 'transit', icon: '🚆', labelKey: 'travelTime.mode.transit' },
  { key: 'car', icon: '🚗', labelKey: 'travelTime.mode.car' },
  { key: 'bike', icon: '🚲', labelKey: 'travelTime.mode.bike' },
  { key: 'walk', icon: '🚶', labelKey: 'travelTime.mode.walk' },
];

/**
 * The ceilings offered per mode, for the "reachable within" filters.
 *
 * Deliberately different per mode: an hour on a train is an ordinary commute, an hour on foot is
 * not a commute at all.
 * @type {Array<{mode: string, minutes: number[]}>}
 */
export const COMMUTE_OPTIONS = [
  { mode: 'transit', minutes: [15, 30, 45, 60] },
  { mode: 'car', minutes: [15, 30, 45] },
  { mode: 'bike', minutes: [15, 30] },
  { mode: 'walk', minutes: [15, 30] },
];

/**
 * How far over the limit still counts as "nearly".
 *
 * A commute limit is not a cliff. Somebody who says 30 minutes does not stop being interested at 31,
 * they stop being interested somewhere past it, and a map that painted 31 the same red as 70 would
 * be throwing away the only distinction worth drawing. A quarter over is the band where a flat is
 * worth a second look and no more than that.
 * @type {number}
 */
export const ACCEPTABLE_FACTOR = 1.25;

/**
 * The limit on one address's commute, if the search has one.
 *
 * Deliberately a copy of `normalizeCommuteBudget` in `lib/utils/commuteBudget.js` rather than an
 * import: the frontend may not reach into server code (see the eslint rule), and this is four lines
 * of arithmetic. The server is the one that enforces it; this only decides what colour to paint.
 *
 * @param {Object} address - Carrying a `maxMinutes`, as {@link addressesWithBudget} produces.
 * @returns {number|null}
 */
export function commuteBudgetOf(address) {
  const minutes = Math.floor(Number(address?.maxMinutes));
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}

/**
 * The addresses a job has a limit for, each carrying that limit.
 *
 * Two halves meet here, the same way they do on the server. The job knows how far is too far, keyed
 * by address label; the user's address list knows how the journey to that label is measured. A limit
 * naming an address that no longer exists is dropped: without the address there is no mode to judge
 * it in.
 *
 * @param {Array<Object>|null|undefined} addresses - The user's saved addresses.
 * @param {{limits?: Record<string, number>}|null|undefined} commuteFilter - As stored on the job.
 * @returns {Array<Object>} Addresses with a `maxMinutes`. Empty for a job without a filter, which is
 *   what leaves every pin and every badge in the plain, uncoloured state.
 */
export function addressesWithBudget(addresses, commuteFilter) {
  const limits = commuteFilter?.limits;
  if (limits == null || typeof limits !== 'object') {
    return [];
  }
  return (Array.isArray(addresses) ? addresses : [])
    .map((address) => ({ ...address, maxMinutes: limits[address?.label] }))
    .filter((address) => commuteBudgetOf(address) != null);
}

/**
 * Bands from best to worst, so two of them can be compared without a lookup table.
 * @type {string[]}
 */
const BAND_ORDER = ['good', 'acceptable', 'poor'];

/**
 * The mode a limit is judged in.
 *
 * The one the address is set to, because that is the question the user asked - a limit of 35 next to
 * "Public transport" is a statement about the train, and answering it with the driving time would
 * be answering something else. Rows written before the mode was recorded fall back to whatever the
 * row itself says it measured. Mirrors `judgingMode` in `lib/utils/commuteBudget.js`, which is what
 * actually decides whether the notification goes out.
 *
 * @param {Object} entry - A stored travel time.
 * @param {Object} address - The address it was measured from.
 * @returns {string}
 */
export function commuteBandMode(entry, address) {
  for (const candidate of [address?.mode, entry?.mode]) {
    if (TRAVEL_MODES.some((mode) => mode.key === candidate)) {
      return candidate;
    }
  }
  return 'transit';
}

/**
 * How one address's limit judges one stored travel time.
 *
 * Measured in the mode the address is set to, because that is the question the user asked. Returns
 * `null` whenever there is nothing to judge on - no limit, or no answer in that mode - which the
 * callers render as the plain, uncoloured state rather than as a pass or a fail.
 *
 * @param {Object} entry - A stored travel time.
 * @param {Object} address - The address it was measured from, carrying this search's `maxMinutes`.
 * @returns {'good'|'acceptable'|'poor'|null}
 */
export function commuteBand(entry, address) {
  const budget = commuteBudgetOf(address);
  if (budget == null) {
    return null;
  }
  const minutes = entry?.[commuteBandMode(entry, address)]?.minutes;
  if (!Number.isFinite(minutes)) {
    return null;
  }
  if (minutes <= budget) {
    return 'good';
  }
  return minutes <= budget * ACCEPTABLE_FACTOR ? 'acceptable' : 'poor';
}

/**
 * The band a whole listing gets, across every address this search has a limit for.
 *
 * The worst one wins, for the same reason the server treats every limit as a requirement: a flat ten
 * minutes from the office and an hour and a half from the school is not a green flat.
 *
 * @param {Array<Object>|null|undefined} travelTimes
 * @param {Array<Object>|null|undefined} addresses - From {@link addressesWithBudget}.
 * @returns {'good'|'acceptable'|'poor'|null} `null` when no limit applies to this listing yet.
 */
export function worstCommuteBand(travelTimes, addresses) {
  const entries = Array.isArray(travelTimes) ? travelTimes : [];
  let worst = null;
  for (const address of Array.isArray(addresses) ? addresses : []) {
    const band = commuteBand(
      entries.find((entry) => entry?.label === address?.label),
      address,
    );
    if (band != null && (worst == null || BAND_ORDER.indexOf(band) > BAND_ORDER.indexOf(worst))) {
      worst = band;
    }
  }
  return worst;
}

/**
 * Splits the combined commute filter value into its two halves.
 *
 * Mode and ceiling travel as one string (`transit:30`) so a bookmarked URL can never carry half a
 * filter that the other side then has to guess the rest of.
 *
 * @param {string|null|undefined} value
 * @returns {{mode: string, maxMinutes: number}|null} `null` for anything unusable.
 */
export function parseCommuteFilter(value) {
  const [mode, minutes] = String(value ?? '').split(':');
  const parsed = Number.parseInt(minutes, 10);
  if (!TRAVEL_MODES.some((entry) => entry.key === mode) || !Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return { mode, maxMinutes: parsed };
}

/**
 * A duration in the way people say it: minutes up to an hour, hours and minutes above.
 *
 * @param {number} minutes
 * @returns {string}
 */
export function formatMinutes(minutes) {
  if (!Number.isFinite(minutes)) {
    return '';
  }
  const rounded = Math.max(0, Math.round(minutes));
  if (rounded < 60) {
    return `${rounded} min`;
  }
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/**
 * A road distance, in the units people use.
 *
 * @param {number|null|undefined} meters
 * @returns {string|null}
 */
export function formatRoadDistance(meters) {
  if (!Number.isFinite(meters)) {
    return null;
  }
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

/**
 * The modes an entry actually has an answer for.
 *
 * A mode that is missing was not routable, which is not the same as taking no time, so it is left
 * out rather than shown as a zero.
 *
 * @param {Object} entry
 * @returns {Array<{key: string, icon: string, labelKey: string, minutes: number, transfers?: number}>}
 */
export function availableModes(entry) {
  return TRAVEL_MODES.filter((mode) => entry?.[mode.key]?.minutes != null).map((mode) => ({
    ...mode,
    minutes: entry[mode.key].minutes,
    transfers: mode.key === 'transit' ? (entry.transit.transfers ?? 0) : undefined,
  }));
}

/**
 * The one mode to show when there is only room for one.
 *
 * The mode the address is measured in, which is the question the user actually asked - not the
 * fastest one. Picking the fastest looked reasonable on a card and was not stable: a listing carries
 * only its public transport estimate until somebody opens it, and the detail page then adds car,
 * bike and walk, so the card would silently switch from the train to the car for a listing that had
 * not changed at all. Rows written before the mode was recorded fall back to the first mode with an
 * answer, which is public transport wherever there is one.
 *
 * @param {Object} entry
 * @returns {{key: string, icon: string, labelKey: string, minutes: number, transfers?: number}|null}
 * `null` when the entry has no answer at all.
 */
export function primaryMode(entry) {
  const modes = availableModes(entry);
  if (modes.length === 0) {
    return null;
  }
  return modes.find((mode) => mode.key === entry?.mode) ?? modes[0];
}

/**
 * Whether an entry says anything at all.
 *
 * @param {Object} entry
 * @returns {boolean}
 */
export function hasAnyTime(entry) {
  return availableModes(entry).length > 0;
}
