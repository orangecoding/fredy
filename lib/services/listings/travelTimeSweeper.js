/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import {
  getListingsDueForTravelTimes,
  getTravelTimesForListings,
  saveListingTravelTimes,
  recordTravelTimeFailure,
} from '../storage/listingsStorage.js';
import { getUserSettings, getAddresses, getSettings } from '../storage/settingsStorage.js';
import { estimateTransitTime, getReachableStops, DEFAULT_MAX_TRAVEL_MINUTES } from '../transit/reachabilityService.js';
import { getStreetRoute, getTravelTimes, referenceDeparture } from '../transit/travelTimeService.js';
import { isTransitPaused } from '../transit/transitousClient.js';
import { roundCoord } from '../transit/transitCache.js';
import logger from '../logger.js';

/**
 * Fills in how long it takes to get from a user's addresses to their listings.
 *
 * The cost model is the whole design here. Asking the routing service for one journey per listing
 * would mean a street routing per listing per address, and the Transitous maintainers asked us not
 * to do that in bulk - it is the part that eats their CPU. So a sweep asks a different question:
 * once per address, "how long does it take to reach every stop in the region", and then works out
 * each listing locally from the stop nearest to it. Two saved addresses cost two requests, whether
 * the instance holds ten listings or ten thousand.
 *
 * What that buys is a very good estimate rather than an exact journey. The exact one - and with it
 * the car, bike and walking times - is fetched when somebody opens a listing, which is one person
 * looking at one flat rather than a batch.
 */

/** Fallbacks for when the settings row is missing or nonsense. */
const DEFAULT_LIMIT_PER_RUN = 500;
const DEFAULT_MAX_AGE_DAYS = 30;

/**
 * How many street routings one run may make.
 *
 * Two things draw on this: an address the user asked to measure by car or on foot, and a place
 * public transport simply does not reach. Both need a routing per listing, which is the expensive
 * shape, so it is deliberately a trickle. An instance whose addresses all use public transport, in a
 * place that has some, never touches this at all.
 */
const DEFAULT_STREET_LOOKUPS_PER_RUN = 15;

/** The modes an address may prefer. Anything else falls back to public transport. */
const STREET_MODES = new Set(['car', 'bike', 'walk']);

/**
 * The mode an address is measured in.
 *
 * Public transport unless the user said otherwise, because that is the one the cheap path answers
 * for and the one straight-line distance is worst at predicting.
 *
 * Stored with every row, exact ones included, because it is what the card shows: a listing found
 * through a public transport commute must go on saying how long that commute takes, even once the
 * detail page has filled in the driving time as well.
 *
 * @param {import('../../types/listing.js').Address} address
 * @returns {'transit'|'car'|'bike'|'walk'}
 */
function preferredMode(address) {
  const mode = String(address?.mode ?? '').toLowerCase();
  return STREET_MODES.has(mode) ? mode : 'transit';
}

/** Breathing room between the driving lookups, in milliseconds. */
const REQUEST_SPACING = 500;

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function nonNegativeInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

/**
 * Whether a listing sits somewhere a router can be asked about.
 *
 * -1/-1 is the marker for "the geocoder looked and found nothing", not a place in the Atlantic.
 * Sending it to a routing service costs a request and can never produce an answer.
 *
 * @param {{latitude: number, longitude: number}} listing
 * @returns {boolean}
 */
function isLocated(listing) {
  return listing?.latitude != null && listing?.longitude != null && listing.latitude !== -1 && listing.longitude !== -1;
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/**
 * The addresses a listing should be measured against, without the ones that cannot be.
 *
 * Duplicate labels are dropped rather than merged: a travel time is stored per label, so two
 * addresses both called "Home" would otherwise take turns overwriting each other every sweep.
 *
 * @param {import('../../types/listing.js').Address[]} addresses
 * @returns {import('../../types/listing.js').Address[]}
 */
function usableAddresses(addresses) {
  const seen = new Set();
  return (addresses || []).filter((address) => {
    if (!address?.label || !address.coords || address.coords.lat === -1) {
      return false;
    }
    if (seen.has(address.label)) {
      logger.debug(`Ignoring a second address labelled "${address.label}" for travel times.`);
      return false;
    }
    seen.add(address.label);
    return true;
  });
}

/**
 * Whether a stored row still answers for this address.
 *
 * The comparison is on what the answer actually depended on - where the journey started and when it
 * left - not on the label, which is only a name the user picked.
 *
 * @param {Object} row
 * @param {{lat: number, lng: number}} coords
 * @param {number} referenceTime
 * @param {number} staleBefore
 * @returns {boolean}
 */
function stillValid(row, coords, referenceTime, staleBefore, mode) {
  // An estimate answers for one mode. Switching an address from public transport to driving asks a
  // different question, so the old answer is not merely stale, it is about something else.
  if (mode != null && row.is_estimate !== 0 && (row.estimate_mode ?? 'transit') !== mode) {
    return false;
  }
  if (
    row.origin_lat !== roundCoord(coords.lat) ||
    row.origin_lng !== roundCoord(coords.lng) ||
    row.reference_time !== referenceTime ||
    row.computed_at <= staleBefore
  ) {
    return false;
  }
  // An estimated transit time is meant to be able to say which stops it came from. A row written
  // before that was recorded cannot, so it is redone - which costs nothing, because the sweep works
  // it out locally from the reachability answer it already has.
  return !(row.is_estimate !== 0 && row.transit_minutes != null && !row.via_stops);
}

/**
 * Turns a stored row back into the shape {@link saveListingTravelTimes} takes.
 *
 * @param {Object} row
 * @param {string} label - The label to carry it forward under, which is how a rename stays free.
 * @returns {Object}
 */
function carryOver(row, label) {
  return {
    label,
    originLat: row.origin_lat,
    originLng: row.origin_lng,
    transitMinutes: row.transit_minutes,
    transitTransfers: row.transit_transfers,
    // Already JSON on the way out of SQLite, and the writer stringifies whatever it is given, so
    // these two are passed through parsed to keep one shape on both sides.
    transitLegs: parseJson(row.transit_legs),
    carMinutes: row.car_minutes,
    carDistanceMeters: row.car_distance_meters,
    carGeometry: row.car_geometry,
    bikeMinutes: row.bike_minutes,
    bikeGeometry: row.bike_geometry,
    walkMinutes: row.walk_minutes,
    walkGeometry: row.walk_geometry,
    viaStops: parseJson(row.via_stops),
    estimateMode: row.estimate_mode ?? null,
    isEstimate: row.is_estimate !== 0,
    referenceTime: row.reference_time,
    computedAt: row.computed_at,
  };
}

/**
 * Whether an exact row can name the stops its journey calls at.
 *
 * The legs were stored without their stop names at first, which makes for a journey the UI cannot
 * describe. Such a row is worth asking for again; one that has no transit time at all has no
 * journey to describe and is fine as it is.
 *
 * @param {Object} row
 * @returns {boolean}
 */
function describesItsJourney(row) {
  if (row.transit_minutes == null) {
    return true;
  }
  const legs = parseJson(row.transit_legs);
  return Array.isArray(legs) && legs.length > 0 && legs.some((leg) => leg.to != null || leg.from != null);
}

/**
 * @param {string|null|undefined} value
 * @returns {unknown|null}
 */
function parseJson(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * The reference departure and reachability answer for each of a user's addresses.
 *
 * This is where the requests happen - at most one per address, shared by every listing in the run
 * and cached for hours beyond it.
 *
 * @param {import('../../types/listing.js').Address[]} addresses
 * @param {Object} params
 * @param {number} params.now
 * @param {number} params.maxTravelMinutes
 * @returns {Promise<{resolved: Array<{label: string, coords: Object, referenceTime: number, stops: Object[]|null}>, unavailable: boolean}>}
 * `unavailable` when at least one address could not be answered for.
 */
async function resolveOrigins(addresses, { now, maxTravelMinutes }) {
  const resolved = [];
  let unavailable = false;

  for (const address of addresses) {
    const referenceTime = referenceDeparture(now, address.departure).getTime();
    const mode = preferredMode(address);

    // An address measured by car or on foot needs no timetable, so it does not pay for the
    // region-wide reachability answer either. Somebody who drives everywhere costs nothing here.
    if (mode !== 'transit') {
      resolved.push({ label: address.label, coords: address.coords, referenceTime, mode, stops: null });
      continue;
    }

    const stops = await getReachableStops({
      lat: address.coords.lat,
      lng: address.coords.lng,
      referenceTime,
      maxTravelMinutes,
    });
    if (stops == null) {
      unavailable = true;
    }
    resolved.push({ label: address.label, coords: address.coords, referenceTime, mode, stops });
  }

  return { resolved, unavailable };
}

/**
 * @param {string} label
 * @param {{lat: number, lng: number}} coords
 * @param {number} referenceTime
 * @param {{minutes: number, transfers: number}|null} transit
 * @param {number} computedAt
 * @returns {Object}
 */
function toEstimateRow(label, coords, referenceTime, transit, computedAt, street = null, mode = 'transit') {
  const row = {
    label,
    originLat: roundCoord(coords.lat),
    originLng: roundCoord(coords.lng),
    transitMinutes: transit?.minutes ?? null,
    transitTransfers: transit?.transfers ?? null,
    // No drawable transit route from an estimate: this path never asked for a journey, only for how
    // long it takes to reach each stop. Opening the listing fills it in.
    transitLegs: null,
    carMinutes: null,
    carDistanceMeters: null,
    carGeometry: null,
    bikeMinutes: null,
    bikeGeometry: null,
    walkMinutes: null,
    walkGeometry: null,
    // Which stops the estimate came from, so the UI can show its working.
    viaStops: transit?.via ?? null,
    // Which question this row answers, so a later change of mode invalidates it.
    estimateMode: mode,
    // Still flagged: the row is incomplete either way, so opening the listing should still fill in
    // the rest. What the flag drives in the UI is the note on the *transit* figure, which is the
    // approximate one - an exactly routed street time carries no such note.
    isEstimate: true,
    referenceTime,
    computedAt,
  };

  // Whichever street mode was actually routed, if any. Only one is ever filled in here: the others
  // would each cost another routing, and they are filled in together when somebody opens the
  // listing.
  if (street != null) {
    row[`${street.mode}Minutes`] = street.minutes;
    row[`${street.mode}Geometry`] = street.geometry ?? null;
    if (street.mode === 'car') {
      row.carDistanceMeters = street.distanceMeters ?? null;
    }
  }

  return row;
}

/**
 * Whether a row carries any travel time at all.
 *
 * @param {Object} entry
 * @returns {boolean}
 */
function hasAnyTime(entry) {
  return (
    entry.transitMinutes != null || entry.carMinutes != null || entry.bikeMinutes != null || entry.walkMinutes != null
  );
}

/**
 * Bring one listing's travel times up to date from the already-fetched reachability answers.
 *
 * Local work, with one exception: an address that is measured in a street mode, or a place public
 * transport does not reach at all, needs a routing of its own. Otherwise the listing would carry no
 * travel time anywhere - and a village with no bus is exactly where the driving time is the
 * interesting number. Those lookups come out of a small shared budget, so an instance trickles
 * through its backlog rather than doing it all at once.
 *
 * @param {{id: string, latitude: number, longitude: number}} listing
 * @param {Array<{label: string, coords: Object, referenceTime: number, stops: Object[]|null}>} origins
 * @param {Object} params
 * @param {number} params.now
 * @param {number} params.staleBefore
 * @param {{remaining: number}} params.streetBudget - Street routings left this run. Decremented here.
 * @returns {Promise<boolean>} False when nothing about this listing could be answered.
 */
async function updateListing(listing, origins, { now, staleBefore, streetBudget }) {
  if (origins.length === 0) {
    // The user has no addresses, so there is no question to answer. Written anyway: it prunes rows
    // left over from addresses they deleted and stamps the listing, which is what keeps it from
    // sitting at the front of the queue forever crowding out listings that do have work to do.
    saveListingTravelTimes(listing.id, [], now);
    return true;
  }

  const stored = getTravelTimesForListings([listing.id]).get(listing.id) ?? [];
  const byLabel = new Map(stored.map((row) => [row.label, row]));

  /** @type {Object[]} */
  const entries = [];
  let answered = 0;
  let unavailable = 0;
  let deferred = 0;

  for (const origin of origins) {
    const sameLabel = byLabel.get(origin.label);
    if (sameLabel && stillValid(sameLabel, origin.coords, origin.referenceTime, staleBefore, origin.mode)) {
      // Already current. Keeping it also preserves an exact row somebody's detail page produced,
      // which a fresh estimate would otherwise write over with a rougher number.
      entries.push(carryOver(sameLabel, origin.label));
      answered += 1;
      continue;
    }

    // No row under this label, or the wrong one. Before recomputing, check whether some other row
    // already holds this exact journey - that is what a renamed address looks like.
    const renamed = stored.find((row) =>
      stillValid(row, origin.coords, origin.referenceTime, staleBefore, origin.mode),
    );
    if (renamed) {
      entries.push(carryOver(renamed, origin.label));
      answered += 1;
      continue;
    }

    if (origin.mode === 'transit' && origin.stops == null) {
      // The reachability lookup for this address failed. Carry whatever was stored, stale or not:
      // an old estimate is better than blanking the listing because of somebody else's outage.
      unavailable += 1;
      if (sameLabel) {
        entries.push(carryOver(sameLabel, origin.label));
      }
      continue;
    }

    const transit =
      origin.mode === 'transit' ? estimateTransitTime(origin.stops, listing.latitude, listing.longitude) : null;

    // A street routing is needed in two cases: the user asked for this address to be measured by
    // car or on foot, or public transport has nothing to say about this place and the alternative
    // is showing them nothing at all. Both come out of the same small budget, and neither happens
    // while the upstream is asking us to back off.
    const streetMode = origin.mode !== 'transit' ? origin.mode : transit == null ? 'car' : null;
    let street = null;
    if (streetMode != null && (streetBudget.remaining <= 0 || isTransitPaused())) {
      // Out of budget, or told to back off. Nothing was asked, so nothing is known: the pair is put
      // off rather than recorded as having no answer.
      deferred += 1;
      if (sameLabel) {
        entries.push(carryOver(sameLabel, origin.label));
      }
      continue;
    }
    if (streetMode != null) {
      streetBudget.remaining -= 1;
      const result = await getStreetRoute({
        mode: streetMode,
        fromLat: origin.coords.lat,
        fromLng: origin.coords.lng,
        toLat: listing.latitude,
        toLng: listing.longitude,
      });
      if (result.ok === true) {
        street = { mode: streetMode, ...result.route };
      } else if (result.reason === 'unavailable') {
        // Only an outage stops this listing being judged. "Nothing goes there" is an answer, and
        // one the failure counter is allowed to act on.
        unavailable += 1;
      }
      await sleep(REQUEST_SPACING);
    }

    entries.push(toEstimateRow(origin.label, origin.coords, origin.referenceTime, transit, now, street, origin.mode));
    if (transit != null || street != null) {
      answered += 1;
    }
  }

  if (deferred > 0) {
    // Some of this listing's addresses were never asked about. Keep whatever is already known, but
    // leave the listing due so the next run finishes it instead of the refresh window doing so a
    // month later.
    if (entries.length > 0) {
      saveListingTravelTimes(listing.id, entries, now, { stamp: false });
    }
    return false;
  }

  if (answered === 0 && entries.every((entry) => !hasAnyTime(entry))) {
    if (unavailable > 0) {
      // Nobody answered. That says nothing about this listing, so nothing about it changes and it
      // stays due - counting it would eventually retire perfectly good listings because the routing
      // service had a bad afternoon.
      return false;
    }
    // Answered, and not reachable from anywhere by public transport. Usually a bad geocode or a
    // place genuinely off the network; either way it is counted so it is eventually left alone.
    recordTravelTimeFailure(listing.id, now);
    return false;
  }

  saveListingTravelTimes(listing.id, entries, now);
  return true;
}

/**
 * The settings one run works from.
 *
 * @param {number} now
 * @returns {Promise<{staleBefore: number, limit: number, maxTravelMinutes: number}>}
 */
async function resolveRunSettings(now) {
  const settings = await getSettings();
  return {
    staleBefore: now - positiveInt(settings?.travelTimeMaxAgeDays, DEFAULT_MAX_AGE_DAYS) * 24 * 60 * 60 * 1000,
    limit: positiveInt(settings?.travelTimeLimitPerRun, DEFAULT_LIMIT_PER_RUN),
    maxTravelMinutes: positiveInt(settings?.travelTimeMaxMinutes, DEFAULT_MAX_TRAVEL_MINUTES),
    // Zero is a real answer here, unlike the others: it turns street routing off entirely, which an
    // operator who wants to be as light as possible on the routing service may well want.
    streetLookupsPerRun: nonNegativeInt(settings?.travelTimeStreetLookupsPerRun, DEFAULT_STREET_LOOKUPS_PER_RUN),
  };
}

/**
 * Update travel times for a specific set of listings, for one user's addresses.
 *
 * Used by the scraping pipeline so that a notification about a brand new listing can already say how
 * long the commute is. It costs at most one request per address, and usually none at all: the
 * reachability answer from the last sweep is still cached.
 *
 * Never throws. A missing travel time must not cost anybody a notification.
 *
 * @param {Array<{id: string, latitude: number, longitude: number}>} listings
 * @param {import('../../types/listing.js').Address[]} addresses
 * @param {Object} [options]
 * @param {number} [options.now=Date.now()]
 * @returns {Promise<number>} How many listings were updated.
 */
export async function updateTravelTimesForListings(listings, addresses, { now = Date.now() } = {}) {
  const routable = (listings || []).filter((listing) => isLocated(listing));
  const wanted = usableAddresses(addresses);
  if (routable.length === 0 || wanted.length === 0 || isTransitPaused()) {
    return 0;
  }

  try {
    const { staleBefore, maxTravelMinutes, streetLookupsPerRun } = await resolveRunSettings(now);
    const { resolved } = await resolveOrigins(wanted, { now, maxTravelMinutes });
    // A tighter budget than the sweep gets: somebody is waiting for a notification, and whatever
    // does not fit here is picked up by the next sweep within a couple of hours.
    const streetBudget = { remaining: Math.min(streetLookupsPerRun, routable.length) };
    let updated = 0;
    for (const listing of routable) {
      if (await updateListing(listing, resolved, { now, staleBefore, streetBudget })) {
        updated += 1;
      }
    }
    return updated;
  } catch (error) {
    logger.warn('Could not compute travel times for the new listings', error);
    return 0;
  }
}

/**
 * Replace a single listing's estimates with real journey plans.
 *
 * This is the expensive path - one street routing per address - so it only ever runs for a listing a
 * person is actually looking at. In exchange it answers for car, bike and walking too, and carries
 * the driving route the detail map draws.
 *
 * @param {{id: string, latitude: number, longitude: number}} listing
 * @param {import('../../types/listing.js').Address[]} addresses
 * @param {Object} [options]
 * @param {number} [options.now=Date.now()]
 * @returns {Promise<boolean>} False when nothing could be routed.
 */
export async function refineTravelTimesForListing(listing, addresses, { now = Date.now() } = {}) {
  const wanted = usableAddresses(addresses);
  if (!isLocated(listing) || wanted.length === 0 || isTransitPaused()) {
    return false;
  }

  const stored = getTravelTimesForListings([listing.id]).get(listing.id) ?? [];
  const byLabel = new Map(stored.map((row) => [row.label, row]));

  /** @type {Object[]} */
  const entries = [];
  let routed = 0;

  for (const address of wanted) {
    const referenceTime = referenceDeparture(now, address.departure).getTime();
    const existing = byLabel.get(address.label);
    const mode = preferredMode(address);

    // Already exact, still about the same journey, and able to describe itself. Nothing to gain
    // from asking again.
    if (
      existing &&
      existing.is_estimate === 0 &&
      stillValid(existing, address.coords, referenceTime, 0, null) &&
      describesItsJourney(existing)
    ) {
      // The mode is refreshed even here: a row written before it was recorded, or one whose address
      // has since been switched from the train to the car, would otherwise keep answering with the
      // wrong headline number on the card.
      entries.push({ ...carryOver(existing, address.label), estimateMode: mode });
      routed += 1;
      continue;
    }

    const result = await getTravelTimes({
      fromLat: address.coords.lat,
      fromLng: address.coords.lng,
      toLat: listing.latitude,
      toLng: listing.longitude,
      referenceTime,
    });

    if (result.ok === false && result.reason === 'unavailable') {
      // Keep what is stored rather than replacing a usable estimate with nothing.
      if (existing) {
        entries.push({ ...carryOver(existing, address.label), estimateMode: mode });
      }
      continue;
    }

    const times = result.ok === true ? result.times : null;
    // The journey planner and the reachability sweep do not always agree: the sweep can find the
    // listing well inside the region it can reach by public transport while the planner returns no
    // itinerary for that one departure - a walk to the stop just over its own limit is enough. The
    // estimate is then the better of the two answers, so it is kept rather than blanked, which is
    // what used to make a listing drop out of the public transport filter the moment somebody
    // opened it.
    const keptEstimate = times?.transit == null && existing?.is_estimate !== 0 && existing?.transit_minutes != null;
    entries.push({
      label: address.label,
      originLat: roundCoord(address.coords.lat),
      originLng: roundCoord(address.coords.lng),
      transitMinutes: times?.transit?.minutes ?? (keptEstimate ? existing.transit_minutes : null),
      transitTransfers: times?.transit?.transfers ?? (keptEstimate ? existing.transit_transfers : null),
      transitLegs: times?.transit?.legs ?? null,
      carMinutes: times?.car?.minutes ?? null,
      carDistanceMeters: times?.car?.distanceMeters ?? null,
      carGeometry: times?.car?.geometry ?? null,
      bikeMinutes: times?.bike?.minutes ?? null,
      bikeGeometry: times?.bike?.geometry ?? null,
      walkMinutes: times?.walk?.minutes ?? null,
      walkGeometry: times?.walk?.geometry ?? null,
      // An exact journey needs no stop list: it is the journey, not a guess made from one. A kept
      // estimate is still a guess, and has to be able to show which stops it was made from.
      viaStops: keptEstimate ? parseJson(existing.via_stops) : null,
      estimateMode: mode,
      // Flagged by whether the transit figure is exact, because that is the only one the flag
      // speaks about: the street times below came from a real routing either way.
      isEstimate: keptEstimate,
      referenceTime,
      computedAt: now,
    });
    if (times != null) {
      routed += 1;
    }
  }

  if (entries.length === 0) {
    return false;
  }

  saveListingTravelTimes(listing.id, entries, now);
  return routed > 0;
}

/**
 * Work through the listings whose travel times are missing or stale.
 *
 * Reads its own work list from the database, so a run cut short by the per-run cap loses nothing:
 * the next one starts where this one stopped, oldest first.
 *
 * @param {Object} [options]
 * @param {number} [options.now=Date.now()]
 * @param {number} [options.limit] Listings this run may work through. Defaults to the setting.
 * @returns {Promise<{listings: number, origins: number, streetLookups: number}>}
 */
export default async function runTravelTimeSweep({ now = Date.now(), limit } = {}) {
  if (isTransitPaused()) {
    logger.debug('Transitous is rate limiting us. Skipping the travel time sweep.');
    return { listings: 0, origins: 0, streetLookups: 0 };
  }

  const settings = await resolveRunSettings(now);
  const perRun = limit ?? settings.limit;

  const due = getListingsDueForTravelTimes({ limit: perRun, staleBefore: settings.staleBefore });
  if (due.length === 0) {
    logger.debug('No listings due for travel times.');
    return { listings: 0, origins: 0, streetLookups: 0 };
  }

  /** @type {Map<string, Array<Object>>} */
  const originsByUser = new Map();
  // Shared across the whole run rather than per listing, so a handful of unreachable places cannot
  // turn a sweep into a hundred street routings.
  const streetBudget = { remaining: settings.streetLookupsPerRun };
  let touched = 0;
  let origins = 0;

  for (const listing of due) {
    if (!originsByUser.has(listing.user_id)) {
      // The addresses are the job owner's, not any viewer's - the same rule the straight-line
      // distances follow, because the distances belong to whoever's search this is.
      const addresses = usableAddresses(getAddresses(getUserSettings(listing.user_id)));
      const { resolved } = await resolveOrigins(addresses, {
        now,
        maxTravelMinutes: settings.maxTravelMinutes,
      });
      origins += resolved.filter((origin) => origin.stops != null).length;
      originsByUser.set(listing.user_id, resolved);
    }

    // A user with no addresses still goes through: `updateListing` then writes an empty result,
    // which stamps the listing so it stops being due. Skipping it instead would leave it at the
    // front of the queue forever, crowding out the listings that do have work to do.
    try {
      await updateListing(listing, originsByUser.get(listing.user_id), {
        now,
        staleBefore: settings.staleBefore,
        streetBudget,
      });
      touched += 1;
    } catch (error) {
      logger.warn(`Could not compute travel times for listing ${listing.id}`, error);
      break;
    }
  }

  const streetLookups = settings.streetLookupsPerRun - streetBudget.remaining;
  logger.debug(
    `Travel time sweep touched ${touched} listing(s) from ${origins} reachability lookup(s) ` +
      `and ${streetLookups} street routing(s).`,
  );
  return { listings: touched, origins, streetLookups };
}
