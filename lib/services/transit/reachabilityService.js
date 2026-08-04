/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { fetchOneToAll } from './transitousClient.js';
import { cached, roundCoord, FAILURE_TTL } from './transitCache.js';
import { distanceMeters } from '../listings/distanceCalculator.js';

/**
 * How long it takes to get from one of the user's addresses to anywhere by public transport.
 *
 * The obvious way to answer that for a listing is to ask the routing engine about that one journey.
 * It is also the wrong way at this scale: a job with fifty new listings and two saved addresses is a
 * hundred routings, and the Transitous maintainers asked us not to do that to a service run by
 * volunteers - every one of those includes street routing, which is the expensive part.
 *
 * So the question is turned around. One request per address returns the travel time to every stop in
 * the region, and the remaining bit - the walk from the last stop to the front door - is estimated
 * from the straight-line distance. That is the approach their own debug UI uses, and it is an
 * estimate rather than a journey plan, which is why everything derived from it is marked as one.
 */

/**
 * Fallback ceiling for the reachability query, in minutes, when the setting is missing.
 *
 * Also the size dial: a big city answers for about nine megabytes at ninety minutes and about two
 * at thirty. Ninety covers any commute somebody would seriously consider.
 */
export const DEFAULT_MAX_TRAVEL_MINUTES = 90;

/**
 * Walking speed in metres per minute, matching MOTIS' own default of about 1.33 m/s.
 */
const WALK_METRES_PER_MINUTE = 80;

/**
 * Streets do not run in straight lines. Real walking distance in a built-up area is roughly a third
 * longer than the crow-flying one, and pretending otherwise would make every estimate optimistic in
 * the same direction.
 */
const WALK_DETOUR_FACTOR = 1.3;

/**
 * How far somebody will walk from the last stop, in metres.
 *
 * Beyond this the stop is not really serving the address, and a "transit" time that is mostly a
 * forty minute walk would say more about the walk than about the connection.
 */
const MAX_EGRESS_METRES = 1200;

/**
 * A reachability answer is a picture of the timetable, not of the moment, so it keeps for a working
 * day. It is also the single most expensive request Fredy makes, which is the other half of the
 * reason this number is high.
 */
const REACHABILITY_TTL = 12 * 60 * 60 * 1000;

/**
 * The stops reachable from an address, cached per address and departure.
 *
 * Deduplicated in flight, so a sweep that starts while a notification is already asking the same
 * question makes one request rather than two.
 *
 * @param {Object} params
 * @param {number} params.lat
 * @param {number} params.lng
 * @param {number|Date} params.referenceTime - The departure the answer should refer to.
 * @param {number} [params.maxTravelMinutes=DEFAULT_MAX_TRAVEL_MINUTES]
 * @returns {Promise<import('./transitousClient.js').ReachableStop[]|null>} `null` when the lookup
 * failed, which is not the same as an empty list - that means nothing is reachable at all.
 */
export async function getReachableStops({ lat, lng, referenceTime, maxTravelMinutes = DEFAULT_MAX_TRAVEL_MINUTES }) {
  const origin = { lat: roundCoord(lat), lng: roundCoord(lng) };
  const time = new Date(referenceTime).toISOString();

  return cached(
    // The ceiling is part of the key: a cached ninety minute answer contains a thirty minute one,
    // but not the other way round, and quietly serving the smaller one would truncate every
    // estimate derived from it.
    `reach:${origin.lat},${origin.lng}@${time}/${maxTravelMinutes}`,
    (value) => (value == null ? FAILURE_TTL : REACHABILITY_TTL),
    () =>
      fetchOneToAll({
        lat: origin.lat,
        lng: origin.lng,
        time,
        maxTravelTime: maxTravelMinutes,
      }),
  );
}

/**
 * The walk from a stop to a front door, in minutes.
 *
 * @param {number} meters - Straight-line distance.
 * @returns {number}
 */
function walkMinutes(meters) {
  return (meters * WALK_DETOUR_FACTOR) / WALK_METRES_PER_MINUTE;
}

/**
 * How many candidate stops to keep alongside an estimate.
 *
 * Enough to show the work - "via which stop, and what were the alternatives" - without storing a
 * timetable per listing.
 */
const KEPT_CANDIDATES = 3;

/**
 * @typedef {Object} ViaStop
 * @property {string} name
 * @property {number} lat
 * @property {number} lng
 * @property {number} minutes - Time from the origin to this stop.
 * @property {number} transfers
 * @property {number} walkMeters - Straight-line metres from this stop to the destination.
 * @property {number} totalMinutes - Including the estimated walk at the end.
 */

/**
 * Estimates how long it takes to reach a place, given what is reachable from the origin.
 *
 * Every stop within walking distance is a candidate, and the best one wins - which is not always the
 * nearest, because a stop two minutes further on may be on a line that is ten minutes quicker.
 *
 * The runners-up come back too. An estimate that cannot say where it came from is hard to trust, and
 * "via Hauptbahnhof, 6 minutes' walk" is the sentence that makes it checkable.
 *
 * @param {import('./transitousClient.js').ReachableStop[]|null} stops - As returned by
 * {@link getReachableStops}.
 * @param {number} lat - Destination.
 * @param {number} lng
 * @returns {{minutes: number, transfers: number, via: ViaStop[]}|null} `null` when no stop is close
 * enough, which means the place is not sensibly reachable by public transport.
 */
export function estimateTransitTime(stops, lat, lng) {
  if (!Array.isArray(stops) || stops.length === 0) {
    return null;
  }

  /** @type {ViaStop[]} */
  const candidates = [];
  for (const stop of stops) {
    const meters = distanceMeters(stop.lat, stop.lng, lat, lng);
    if (meters > MAX_EGRESS_METRES) {
      continue;
    }
    candidates.push({
      name: stop.name ?? '',
      lat: stop.lat,
      lng: stop.lng,
      minutes: stop.minutes,
      transfers: stop.transfers,
      walkMeters: Math.round(meters),
      totalMinutes: Math.round(stop.minutes + walkMinutes(meters)),
    });
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => a.totalMinutes - b.totalMinutes || a.walkMeters - b.walkMeters);
  const best = candidates[0];

  // Several platforms of one station can survive the coordinate dedup as distinct points, and a
  // list repeating the same station three times explains nothing.
  const seen = new Set();
  const via = candidates
    .filter((candidate) => {
      const key = candidate.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, KEPT_CANDIDATES);

  return { minutes: best.totalMinutes, transfers: best.transfers, via };
}
