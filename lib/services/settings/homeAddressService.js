/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Saving the addresses a user's listings are measured against.
 *
 * Extracted from the `/home-address` route when the MCP server gained an `update_user_settings`
 * tool that writes them too: geocoding every entry, recomputing every stored distance and
 * re-queueing every listing for the travel-time sweeper is one behaviour, and a second copy of it
 * would have been a second chance to forget one of those steps.
 *
 * One thing deliberately stays behind the route's Save button: the sweep that retries the geocoding
 * of listings that have no coordinates (issue #418). It spends this server's own Nominatim budget,
 * and the stdio MCP server is a second process with a throttle and a backoff of its own, so a save
 * over MCP must not start a second sweep next to the server's. The six-hourly geocoding cron picks
 * those listings up anyway.
 */

import { getAddresses, getUserSettings, upsertSettings } from '../storage/settingsStorage.js';
import { geocodeAddress } from '../geocoding/geoCodingService.js';
import { updateDistancesForAddressChange } from '../geocoding/distanceService.js';
import { getCountriesForUser, resolveCountries } from '../providers/providerCountries.js';
import { isPlaceCategory } from '../poi/categories.js';
import { trackPoi } from '../tracking/Tracker.js';
import { TRACKING_POIS } from '../../TRACKING_POIS.js';
import { fail } from '../serviceResult.js';

/** How many places one user may measure against. The settings page offers far fewer in practice. */
const MAX_HOME_ADDRESSES = 20;

/** Longest address or name accepted, in characters. */
const MAX_ADDRESS_TEXT = 300;

/**
 * Validates the time of day a travel time should be measured at.
 *
 * A commute is a question about a moment: the ride to the office at eight and the ride home at half
 * past five are not the same journey. The day is not asked for - it is always the next working day,
 * because choosing between Tuesday and Wednesday is a question with no useful answer.
 *
 * Anything unparseable is dropped rather than corrected, so a malformed entry leaves the address on
 * the default instead of silently landing on some other departure.
 *
 * @param {unknown} departure
 * @returns {{time: string}|null}
 */
function normalizeDeparture(departure) {
  if (departure == null || typeof departure !== 'object') {
    return null;
  }
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(departure.time ?? '').trim());
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
    return null;
  }
  return { time: `${String(Number(match[1])).padStart(2, '0')}:${match[2]}` };
}

/**
 * How an address wants to be measured.
 *
 * Public transport is the default, and not only because it is the common answer: it is the one
 * Fredy can work out for every listing from a single request per address. The street modes need a
 * routing per listing, so choosing one is choosing a slower fill-in.
 *
 * @param {unknown} mode
 * @returns {'transit'|'car'|'bike'|'walk'}
 */
function normalizeMode(mode) {
  const value = String(mode ?? '').toLowerCase();
  return ['car', 'bike', 'walk'].includes(value) ? value : 'transit';
}

/**
 * Whether a posted entry names a kind of place rather than one particular place.
 *
 * The category has to be one Fredy knows, not merely a string. An unknown one would save cleanly
 * and then quietly never produce a travel time, with nothing on screen to explain why - so it is
 * rejected at the door instead.
 *
 * @param {unknown} entry
 * @returns {boolean}
 */
function isPlaceTypeEntry(entry) {
  return entry?.kind === 'category' && isPlaceCategory(entry?.category);
}

/**
 * The routing-relevant shape of an address list.
 *
 * Saving addresses recomputes every stored distance and puts every listing back in front of the
 * travel-time sweeper, which is right when a place moves and pointless when it does not: re-saving
 * an untouched form, or correcting a typo in a label that was already unique, should cost nothing.
 * The label is in here because travel times and distances are both stored under it, so renaming an
 * address really does invalidate them.
 *
 * @param {Array<import('../../types/listing.js').Address>} addresses
 * @returns {string}
 */
function routingSignature(addresses) {
  return JSON.stringify(
    (addresses ?? []).map((a) => [
      a?.label,
      a?.coords?.lat,
      a?.coords?.lng,
      a?.mode,
      a?.departure?.time ?? null,
      // A place type has no coordinates, so without this a label switched from grocery to gym would
      // look unchanged and every listing would keep its old answer.
      a?.category ?? null,
    ]),
  );
}

/**
 * Store a user's home addresses: validate, geocode each entry, recompute distances, queue travel
 * times.
 *
 * The list is always the complete list, replacing what was stored. An empty array clears the
 * addresses - and so do `null` and `undefined`, because that is what the web route has always
 * treated them as: an absent key was never a refusal to change anything, it was a save with
 * nothing in it.
 *
 * @param {string} userId
 * @param {unknown} homeAddresses - The posted `home_addresses`.
 * @returns {Promise<import('../serviceResult.js').ServiceFailure|{ok: true, home_addresses: Array<object>, queued: number}>}
 *   `queued` is how many listings went back in front of the travel-time sweeper, so the caller can
 *   tell the user why nothing on screen will change for a while.
 */
export async function saveHomeAddresses(userId, homeAddresses) {
  if (homeAddresses != null && !Array.isArray(homeAddresses)) {
    return fail('invalid', 'home_addresses must be an array.');
  }
  const list = Array.isArray(homeAddresses) ? homeAddresses : [];
  // Each entry is geocoded one by one through the shared, one-request-a-second Nominatim client,
  // and then distances are computed for every listing. Five thousand entries held the geocoder
  // for an hour for every user of the instance.
  if (list.length > MAX_HOME_ADDRESSES) {
    return fail('invalid', `At most ${MAX_HOME_ADDRESSES} addresses.`);
  }
  const tooLong = (value) => value != null && (typeof value !== 'string' || value.length > MAX_ADDRESS_TEXT);
  if (list.some((a) => tooLong(a?.address) || tooLong(a?.label))) {
    return fail('invalid', 'An address or its name is not text, or is too long.');
  }

  const previousSignature = routingSignature(getAddresses(getUserSettings(userId)));
  // A place type carries a category where an address carries a street, so "has an address" is
  // no longer what makes an entry real.
  const entries = list.filter((a) => a && (a.address || isPlaceTypeEntry(a)));

  // Rejected rather than silently dropped: somebody who sends kind: 'category' with a category
  // Fredy cannot look for has made a mistake worth being told about.
  const badCategory = list.find((a) => a?.kind === 'category' && !isPlaceCategory(a?.category));
  if (badCategory != null) {
    return fail('invalid', `Unknown place category: ${String(badCategory.category)}`);
  }
  // Travel times are stored per label, so two addresses sharing one would overwrite each other
  // and quietly lose a commute. Rejected here rather than deduplicated further down, where the
  // user would have no idea which of their two "Home" entries survived.
  const labels = entries.map((a) =>
    String(a.label || a.address || a.category)
      .trim()
      .toLowerCase(),
  );
  if (new Set(labels).size !== labels.length) {
    return fail('invalid', 'Each address needs its own name.');
  }

  if (entries.length === 0) {
    upsertSettings({ home_addresses: null }, userId);
    let queued = 0;
    if (previousSignature !== routingSignature([])) {
      queued = updateDistancesForAddressChange(userId, []);
    }
    return { ok: true, home_addresses: [], queued };
  }

  await trackPoi(TRACKING_POIS.DISTANCE_ADDRESS_ENTERED);
  // A home address has no provider behind it, so the user's own jobs are what says where to
  // look. Resolved once for the whole batch.
  const homeCountries = await resolveCountries(() => getCountriesForUser(userId));
  const geocoded = [];
  for (const candidate of entries) {
    const { label, address, departure, mode, category } = candidate;
    // A place type has nothing to geocode: the point it resolves to is worked out per listing,
    // which is the whole reason it exists. So this is one geocode saved, not a special case.
    const entry = isPlaceTypeEntry(candidate)
      ? { kind: 'category', category, label: label || category, mode: normalizeMode(mode) }
      : {
          label: label || address,
          address,
          coords: (await geocodeAddress(address, homeCountries)) || { lat: -1, lng: -1 },
          mode: normalizeMode(mode),
        };
    // Only stored when it is actually set to something valid. An absent departure reads as the
    // default everywhere, so writing one out would only be a copy of that default that stops
    // following it when the default changes.
    const normalizedDeparture = normalizeDeparture(departure);
    if (normalizedDeparture != null) {
      entry.departure = normalizedDeparture;
    }
    geocoded.push(entry);
  }

  upsertSettings({ home_addresses: geocoded }, userId);
  // Only when a place, a mode or a departure actually moved. Re-queueing every listing in the
  // database for the travel-time sweeper because somebody opened the form and pressed Save would
  // be an expensive way to achieve nothing.
  // Reported back rather than only done. The sweeper takes `poiLookupsPerRun` listings every two
  // hours, so on a few hundred listings this is most of a day's work, and a bare "Saved" leaves
  // the user watching a page that will not change until tomorrow.
  let queued = 0;
  if (previousSignature !== routingSignature(geocoded)) {
    queued = updateDistancesForAddressChange(userId, geocoded);
  }
  return { ok: true, home_addresses: geocoded, queued };
}
