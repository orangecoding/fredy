/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * How far a job is willing to travel, and what that is allowed to do to a listing.
 *
 * Fredy already knows how long it takes to get from every saved address to every listing. Until now
 * that number was only ever shown: you could sort and filter by it once the listing was in front of
 * you, but the notification had already been sent. A flat an hour and a half from work is not a flat
 * you want your phone to buzz about at midnight, and the whole point of the tool is what reaches you
 * rather than what is in the database.
 *
 * The limit belongs to the job, not to the address. It is a search criterion, and every other one is
 * already there: the blacklist, the price and size limits, the drawn area. What stays on the address
 * is how you travel there and when, because those decide what gets computed and what it costs.
 *
 * Three rules keep this from becoming the worst kind of feature, the one that silently loses flats:
 *
 * 1. A job without limits behaves exactly as it did before. Nothing is opted in for anybody.
 * 2. A listing with no answer always passes. Not routed yet, no connection, routing service down -
 *    every one of those is missing knowledge, not a long commute, and must never cost a listing.
 * 3. An estimate gets slack before it is allowed to hold anything back. See {@link ESTIMATE_TOLERANCE}.
 */

/**
 * How much an estimated travel time may exceed the limit before it counts against a listing.
 *
 * The scheduled sweep does not plan a journey per listing - it asks once per address which stops are
 * reachable and walks the last stretch from the straight-line distance. That is a good estimate and
 * an honest one (rows carry `estimate: true`), but it is wrong by a few minutes in both directions,
 * and being wrong upwards on a 30 minute limit would drop a flat that is actually 28 minutes away
 * with nothing to show for it. Fifteen percent is roughly the size of that error and costs only the
 * occasional notification about a flat slightly over budget, which is the failure worth having.
 *
 * Exact times, worked out when someone opens a listing, get no slack. They are not guessing.
 *
 * One row gets more slack than it strictly needs: a sweep that routes an address measured by car
 * writes a real driving time onto a row still flagged as an estimate, because the flag speaks about
 * the transit figure the row is missing rather than about the street time it holds. Reading that as
 * an estimate errs towards keeping the listing, which is the direction this is allowed to be wrong
 * in.
 * @type {number}
 */
export const ESTIMATE_TOLERANCE = 1.15;

/**
 * What a job does with a listing that is further away than it asked for.
 *
 * `mark` changes nothing at all and exists so somebody can colour their map without the filter ever
 * touching a notification. `notify` is the default and the reason the feature exists: the listing is
 * stored, shown and searchable, it just does not buzz. `exclude` soft-deletes it the way the area
 * filter already does, for people who do not want it in the list either.
 * @type {string[]}
 */
export const COMMUTE_ACTIONS = ['mark', 'notify', 'exclude'];

/** The action a job gets when it names none. */
export const DEFAULT_COMMUTE_ACTION = 'notify';

/** The modes an address can be measured in. */
const MODES = ['transit', 'car', 'bike', 'walk'];

/**
 * A single limit, in whole minutes.
 *
 * Anything absent, zero, negative or unparseable reads as "no limit on this address", which is how
 * the user says they do not care how far it is. Whole minutes only: they typed a round number and a
 * stored 34.7 would only ever show up as an off-by-one somewhere else.
 *
 * @param {unknown} value
 * @returns {number|null}
 */
export function normalizeCommuteBudget(value) {
  const minutes = Math.floor(Number(value));
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}

/**
 * @typedef {Object} CommuteFilter
 * @property {'mark'|'notify'|'exclude'} action What happens to a listing over the limit.
 * @property {Record<string, number>} limits Minutes per address label. Only the addresses this
 *   search actually cares about appear; the rest are simply absent.
 */

/**
 * A job's stored commute filter, reduced to something safe to act on.
 *
 * Returns `null` for a filter that would do nothing, which is the same thing as not having one:
 * every job in every existing installation, and every job whose owner cleared the last number out
 * of the form. Callers can then check for `null` once instead of re-deriving emptiness.
 *
 * @param {unknown} raw - As stored on the job, or as posted by a client.
 * @returns {CommuteFilter|null}
 */
export function normalizeCommuteFilter(raw) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const source = raw.limits != null && typeof raw.limits === 'object' ? raw.limits : {};
  /** @type {Record<string, number>} */
  const limits = {};
  for (const [label, value] of Object.entries(source)) {
    const minutes = normalizeCommuteBudget(value);
    // A label of whitespace cannot be matched against a stored journey, so it is not a limit.
    if (minutes != null && typeof label === 'string' && label.trim().length > 0) {
      limits[label] = minutes;
    }
  }
  if (Object.keys(limits).length === 0) {
    return null;
  }
  const action = COMMUTE_ACTIONS.includes(raw.action) ? raw.action : DEFAULT_COMMUTE_ACTION;
  return { action, limits };
}

/**
 * The addresses this job has a limit for, each carrying that limit.
 *
 * Two halves meet here on purpose. The job knows how far is too far, keyed by label; the user's
 * address list knows how the journey to that label is measured. A limit naming an address that no
 * longer exists is dropped rather than guessed at: without the address there is no mode to judge it
 * in, and a journey that cannot be judged must not count against a listing.
 *
 * @param {Array<import('../types/listing.js').Address>|null|undefined} addresses - The job owner's
 *   saved addresses.
 * @param {CommuteFilter|null} filter
 * @returns {Array<import('../types/listing.js').Address & {maxMinutes: number}>}
 */
export function addressesWithBudget(addresses, filter) {
  if (filter == null) {
    return [];
  }
  return (Array.isArray(addresses) ? addresses : [])
    .map((address) => {
      const maxMinutes = normalizeCommuteBudget(filter.limits?.[address?.label]);
      return maxMinutes == null ? null : { ...address, maxMinutes };
    })
    .filter((address) => address != null);
}

/**
 * The mode an address is judged in.
 *
 * The one the user picked, not the fastest available. A limit of 35 minutes next to "Public
 * transport" is a statement about the train, and answering it with the driving time would be
 * answering a different question - one they can already ask by changing the mode.
 *
 * @param {import('../types/listing.js').Address} address
 * @param {Object} [entry] - The stored travel time, whose own `mode` is used for addresses saved
 *   before the mode was recorded.
 * @returns {'transit'|'car'|'bike'|'walk'}
 */
function judgingMode(address, entry) {
  for (const candidate of [address?.mode, entry?.mode]) {
    const mode = String(candidate ?? '').toLowerCase();
    if (MODES.includes(mode)) {
      return /** @type {'transit'|'car'|'bike'|'walk'} */ (mode);
    }
  }
  return 'transit';
}

/**
 * Whether one stored travel time breaks one address's limit.
 *
 * @param {Object|null|undefined} entry - A stored travel time, as attached to a listing.
 * @param {import('../types/listing.js').Address & {maxMinutes: number}} address
 * @returns {boolean} `false` whenever there is nothing to judge on, which is the whole point.
 */
function breaksBudget(entry, address) {
  const minutes = entry?.[judgingMode(address, entry)]?.minutes;
  if (!Number.isFinite(minutes)) {
    // No answer in the mode the user cares about. Missing knowledge, not a long commute.
    return false;
  }
  const ceiling = entry?.estimate === false ? address.maxMinutes : address.maxMinutes * ESTIMATE_TOLERANCE;
  return minutes > ceiling;
}

/**
 * Whether a listing is too far from somewhere this job said it must be close to.
 *
 * Every limit is a requirement, so all of them have to hold: somebody who put 35 next to "Work" and
 * 20 next to "School" needs both, and an address this search does not care about is one they left
 * blank. There is no "whichever is nearest" reading - being fifteen minutes from your parents does
 * not make up for eighty minutes to the office.
 *
 * @param {Array<Object>|null|undefined} travelTimes - The listing's stored travel times, keyed by
 *   the address label they were measured from.
 * @param {Array<import('../types/listing.js').Address & {maxMinutes: number}>} budgetedAddresses -
 *   From {@link addressesWithBudget}.
 * @returns {boolean} `true` only when a limit applies, an answer exists, and the answer is over it.
 */
export function exceedsCommuteBudget(travelTimes, budgetedAddresses) {
  if (!Array.isArray(budgetedAddresses) || budgetedAddresses.length === 0) {
    return false;
  }
  const entries = Array.isArray(travelTimes) ? travelTimes : [];
  if (entries.length === 0) {
    return false;
  }
  return budgetedAddresses.some((address) => {
    const entry = entries.find((candidate) => candidate?.label === address.label);
    return breaksBudget(entry, address);
  });
}
