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
