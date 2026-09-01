/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { fetchPlan, fetchStreetRoute, fetchOneToMany, fetchOneToManyIntermodal } from './transitousClient.js';
import { cached, roundCoord, FAILURE_TTL } from './transitCache.js';

/**
 * How long it actually takes to get from one of the user's addresses to a listing.
 *
 * The straight-line distance next to a listing is a poor proxy for that in a city with a river, a
 * ring line and no bridge where you want one: two flats the same crow-flying kilometre away can be
 * eight minutes and fifty minutes from the same office. This asks a routing engine instead.
 *
 * The numbers are only ever an addition. Where the lookup fails, the haversine distance stays
 * exactly as it was and nothing is displayed - an invented travel time would be worse than none.
 */

/**
 * The default time of day a travel time is measured at.
 *
 * A journey time is meaningless without a departure, and "now" is the wrong one - it makes two
 * listings routed an hour apart incomparable and answers with the night timetable if the sweep
 * happens to run at three in the morning. Eight in the morning is when most people make the trip
 * this feature exists to measure.
 */
export const DEFAULT_DEPARTURE = { time: '08:00' };

/**
 * The day is not the user's to pick, and deliberately so.
 *
 * A weekday timetable is the one worth comparing flats on, and asking somebody to choose between
 * Tuesday and Wednesday is a question with no useful answer. The next ordinary working day is used,
 * skipping Saturday and Sunday, whose reduced service would make one listing look worse than
 * another purely because of when the sweep happened to run.
 *
 * @param {Date} date - Mutated in place.
 * @returns {void}
 */
function skipToWeekday(date) {
  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() + 1);
  }
}

/** Journeys are stable enough to keep for a working day. */
const PLAN_TTL = 6 * 60 * 60 * 1000;

/** Modes that arrive as a direct, single-leg itinerary. */
const DIRECT_MODES = ['CAR', 'BIKE', 'WALK'];

/**
 * Parses a `HH:MM` string into hours and minutes.
 *
 * @param {string} time
 * @returns {{hours: number, minutes: number}|null} `null` when the string is not a valid time.
 */
function parseTime(time) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(time ?? '').trim());
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return null;
  }
  return { hours, minutes };
}

/**
 * The departure a stored travel time refers to: the next working day at the configured time.
 *
 * Always in the future, so the answer stays inside the timetable horizon the feeds actually cover,
 * and always on a weekday, so two listings measured days apart are still comparable. Built from
 * local wall-clock parts on purpose: a user who says "08:00" means eight in the morning where they
 * live, including across a daylight-saving change.
 *
 * @param {number|Date} [now=Date.now()] - Reference point, mainly so tests can pin it.
 * @param {{time?: string}} [departure] - `HH:MM`. Anything invalid or missing falls back to
 * {@link DEFAULT_DEPARTURE}.
 * @returns {Date}
 */
export function referenceDeparture(now = Date.now(), departure = DEFAULT_DEPARTURE) {
  const from = now instanceof Date ? now : new Date(now);
  const { hours, minutes } = parseTime(departure?.time) ?? parseTime(DEFAULT_DEPARTURE.time);

  const candidate = new Date(from.getFullYear(), from.getMonth(), from.getDate(), hours, minutes, 0, 0);
  if (candidate.getTime() <= from.getTime()) {
    candidate.setDate(candidate.getDate() + 1);
  }
  skipToWeekday(candidate);
  return candidate;
}

/**
 * @typedef {Object} ModeTime
 * @property {number} minutes - Door to door, rounded.
 *
 * @typedef {Object} TransitLeg
 * @property {string} mode - MOTIS mode, e.g. `WALK`, `SUBWAY`, `BUS`.
 * @property {string|null} line - The line as printed on the vehicle, for the legs that have one.
 * @property {string|null} color - `#rrggbb`, when the feed carries one.
 * @property {string|null} from - Where this leg starts. Null for the doorstep.
 * @property {string|null} to - Where it ends. Null for the destination.
 * @property {number} minutes
 * @property {string} geometry - Encoded polyline of this leg.
 *
 * @typedef {ModeTime & {transfers: number, legs: TransitLeg[]}} TransitTime
 *
 * @typedef {ModeTime & {distanceMeters: number|null, geometry: string|null}} StreetTime
 *
 * @typedef {Object} TravelTimes
 * @property {TransitTime|null} transit
 * @property {StreetTime|null} car
 * @property {StreetTime|null} bike
 * @property {StreetTime|null} walk
 */

/**
 * Rounds a duration in seconds to whole minutes.
 *
 * @param {unknown} seconds
 * @returns {number|null} `null` when the value is not a usable duration.
 */
function toMinutes(seconds) {
  return Number.isFinite(seconds) && seconds >= 0 ? Math.round(Number(seconds) / 60) : null;
}

/**
 * Picks the direct itinerary for one mode.
 *
 * @param {import('./transitousClient.js').PlanItinerary[]} direct
 * @param {string} mode
 * @returns {import('./transitousClient.js').PlanItinerary|undefined}
 */
function directFor(direct, mode) {
  return direct.find((itinerary) => itinerary?.legs?.length === 1 && itinerary.legs[0]?.mode === mode);
}

/**
 * The drawable parts of a transit journey.
 *
 * Kept per leg rather than as one line, because a journey is not one thing: the walk to the stop,
 * the U6, the change, the bus. The map colours them separately, which is the difference between a
 * route you can read and a squiggle.
 *
 * @param {import('./transitousClient.js').PlanItinerary} itinerary
 * @returns {TransitLeg[]}
 */
function transitLegs(itinerary) {
  // MOTIS names the two ends of the whole journey START and END rather than giving them a place.
  // Those are the user's own doorstep and the flat, which the UI already knows about.
  const placeName = (place) => {
    const name = place?.name;
    return typeof name === 'string' && name.length > 0 && name !== 'START' && name !== 'END' ? name : null;
  };

  return (itinerary.legs ?? [])
    .filter((leg) => typeof leg?.legGeometry?.points === 'string')
    .map((leg) => ({
      mode: leg.mode ?? 'UNKNOWN',
      line: leg.routeShortName || null,
      color: leg.routeColor ? `#${leg.routeColor}` : null,
      // The stops the journey actually calls at. This is what somebody wants when they ask "how do
      // I get there?" - a duration on its own does not answer that.
      from: placeName(leg.from),
      to: placeName(leg.to),
      minutes: toMinutes(leg.duration) ?? 0,
      geometry: leg.legGeometry.points,
    }));
}

/**
 * Reduces a routing answer to the handful of numbers worth keeping.
 *
 * A mode that is missing from the response is missing from the result. That is not the same as an
 * error: no walk entry means the walk was longer than the ceiling the client asks for, and no
 * transit itinerary means there is no public transport connection, both of which are true answers
 * and are shown as such.
 *
 * @param {import('./transitousClient.js').PlanResponse|null} plan
 * @returns {TravelTimes|null} `null` when nothing usable came back at all.
 */
export function normalizePlan(plan) {
  if (plan == null) {
    return null;
  }

  const direct = Array.isArray(plan.direct) ? plan.direct : [];
  const itineraries = Array.isArray(plan.itineraries) ? plan.itineraries : [];

  /** @type {TravelTimes} */
  const result = { transit: null, car: null, bike: null, walk: null };

  for (const mode of DIRECT_MODES) {
    const itinerary = directFor(direct, mode);
    const minutes = toMinutes(itinerary?.duration);
    if (minutes == null) {
      continue;
    }
    const leg = itinerary.legs[0];
    result[mode.toLowerCase()] = {
      minutes,
      distanceMeters: Number.isFinite(leg?.distance) ? Math.round(leg.distance) : null,
      // The encoded polyline is kept as it arrived. The detail map decodes it to draw the way
      // actually taken instead of a line through the buildings in between, and it can do that for
      // every mode, not only for driving.
      geometry: typeof leg?.legGeometry?.points === 'string' ? leg.legGeometry.points : null,
    };
  }

  // The fastest connection is the one a person would compare listings on. MOTIS returns the
  // alternatives sorted by departure, not by duration, so this has to be picked explicitly.
  let fastest = null;
  for (const itinerary of itineraries) {
    const minutes = toMinutes(itinerary?.duration);
    if (minutes != null && (fastest == null || minutes < fastest.minutes)) {
      fastest = {
        minutes,
        transfers: Number.isFinite(itinerary.transfers) ? Number(itinerary.transfers) : 0,
        legs: transitLegs(itinerary),
      };
    }
  }
  result.transit = fastest;

  const routed = result.transit != null || result.car != null || result.bike != null || result.walk != null;
  return routed ? result : null;
}

/**
 * @typedef {{ok: true, times: TravelTimes}
 *   | {ok: false, reason: 'unavailable'}
 *   | {ok: false, reason: 'unroutable'}} TravelTimeResult
 */

/**
 * Travel times between two coordinates, cached and deduplicated.
 *
 * Rounding the coordinates to the cache precision is what makes a batch run affordable: every flat
 * in the same building, and every listing whose address only geocoded to the middle of the village,
 * collapses onto one upstream request.
 *
 * The two ways of failing are kept apart because they deserve opposite treatment. `unavailable`
 * means the request never got an answer - a timeout, a rate limit, an outage - and the caller must
 * change nothing and try again later. `unroutable` means the engine answered and there is no way to
 * make this trip, which is a fact about the listing and worth remembering so it stops being asked.
 *
 * @param {Object} params
 * @param {number} params.fromLat
 * @param {number} params.fromLng
 * @param {number} params.toLat
 * @param {number} params.toLng
 * @param {number|Date} params.referenceTime - The departure the answer should refer to.
 * @returns {Promise<TravelTimeResult>}
 */
export async function getTravelTimes({ fromLat, fromLng, toLat, toLng, referenceTime }) {
  const from = { lat: roundCoord(fromLat), lng: roundCoord(fromLng) };
  const to = { lat: roundCoord(toLat), lng: roundCoord(toLng) };
  const time = new Date(referenceTime).toISOString();

  return cached(
    `plan:${from.lat},${from.lng}>${to.lat},${to.lng}@${time}`,
    // An outage is re-asked in a minute; a real answer, including "there is no route", is kept.
    (result) => (result.ok === false && result.reason === 'unavailable' ? FAILURE_TTL : PLAN_TTL),
    async () => {
      const plan = await fetchPlan({ fromLat: from.lat, fromLng: from.lng, toLat: to.lat, toLng: to.lng, time });
      if (plan == null) {
        return { ok: false, reason: 'unavailable' };
      }
      const times = normalizePlan(plan);
      return times == null ? { ok: false, reason: 'unroutable' } : { ok: true, times };
    },
  );
}

/**
 * A single street route, for the two cases where the cheap reachability answer will not do.
 *
 * The scheduled sweep normally answers by asking once per address which stops are reachable, which
 * costs nothing per listing but says nothing about a village with no bus, and nothing at all to
 * somebody who drives everywhere. Both of those are worth one street routing rather than leaving
 * the listing blank everywhere except its own detail page.
 *
 * Callers are expected to bound how many of these they do per run.
 *
 * @param {Object} params
 * @param {'car'|'bike'|'walk'} params.mode
 * @param {number} params.fromLat
 * @param {number} params.fromLng
 * @param {number} params.toLat
 * @param {number} params.toLng
 * @returns {Promise<{ok: true, route: Object}|{ok: false, reason: 'unavailable'|'unroutable'}>}
 */
export async function getStreetRoute({ mode, fromLat, fromLng, toLat, toLng }) {
  const from = { lat: roundCoord(fromLat), lng: roundCoord(fromLng) };
  const to = { lat: roundCoord(toLat), lng: roundCoord(toLng) };

  return cached(
    // No departure in the key: MOTIS does not model traffic, so the trip is the same all week.
    `street:${mode}:${from.lat},${from.lng}>${to.lat},${to.lng}`,
    (result) => (result.ok === false && result.reason === 'unavailable' ? FAILURE_TTL : PLAN_TTL),
    async () => {
      const { answered, route } = await fetchStreetRoute({
        mode: mode.toUpperCase(),
        fromLat: from.lat,
        fromLng: from.lng,
        toLat: to.lat,
        toLng: to.lng,
      });
      if (!answered) {
        return { ok: false, reason: 'unavailable' };
      }
      // Answered with no connection. Usually a coordinate outside the map the instance loaded,
      // which will not fix itself, so it counts against the listing rather than being retried on
      // every sweep for the rest of time.
      return route == null ? { ok: false, reason: 'unroutable' } : { ok: true, route };
    },
  );
}

/**
 * The street modes a place type can be measured in, and how MOTIS spells them.
 * @type {Record<string, string>}
 */
const STREET_PROFILE = { walk: 'WALK', bike: 'BIKE', car: 'CAR' };

/**
 * How long a journey to a nearby place may take before it stops being one, in seconds.
 *
 * A ceiling on the routing rather than on what the user will accept - that is the job's travel time
 * limit. It exists so an unroutable candidate is abandoned quickly instead of the engine searching
 * the whole map for a two hour walk nobody would make.
 * @type {number}
 */
const PLACE_MAX_SECONDS = 3 * 60 * 60;

/**
 * @typedef {Object} PlaceMatch
 * @property {number} index - Which candidate won, as an index into that group's own list.
 * @property {number} minutes
 * @property {number|null} distanceMeters
 * @property {number|null} transfers - Transit only.
 * @property {{minutes: number, distanceMeters: number|null}|null} walk - The direct walk to the
 *   winner, when the answer came from the intermodal endpoint. Often quicker than the connection,
 *   and worth being able to say so.
 */

/**
 * Which of several candidate places is actually nearest, for several place types at once.
 *
 * One request for every group, not one per group. That is the entire reason place types are
 * affordable: the obvious implementation asks per candidate, which is eight routings per listing
 * per place type and exactly the traffic the Transitous maintainers asked Fredy not to generate.
 * Both endpoints answer positionally, so several shortlists can be concatenated into one `many` and
 * split apart again by offset afterwards.
 *
 * Callers group by what actually has to match: the mode, and for public transport the departure as
 * well, because two place types asked about at eight and at half five are not one question.
 *
 * Nearest is decided here rather than by straight-line distance, because a river, a railway or a
 * motorway can put the closest supermarket on the wrong side of all three. The shortlist is ranked
 * by straight line; the winner is chosen by how long it actually takes.
 *
 * Not cached, deliberately. The origin is one listing's front door and is not rounded to a cache
 * cell: at this scale a 1.1 km snap is the difference between an eight and a twenty minute walk,
 * which is the whole answer. The expensive half - the candidate list itself - is what gets cached,
 * in `poi_places`.
 *
 * @param {Object} params
 * @param {'transit'|'car'|'bike'|'walk'} params.mode
 * @param {number} params.fromLat - The listing.
 * @param {number} params.fromLng
 * @param {Array<{label: string, candidates: Array<{lat: number, lng: number}>}>} params.groups -
 *   Each group's candidates ranked by straight line.
 * @param {number|Date} params.referenceTime - Only meaningful for public transport.
 * @returns {Promise<{ok: true, matches: Map<string, PlaceMatch>}|{ok: false, reason: 'unavailable'|'unroutable'}>}
 * `matches` omits a group nothing was routable for, which is not the same as the whole request
 * failing - one village with no pharmacy must not cost the supermarket its answer.
 */
export async function getPlaceMatrix({ mode, fromLat, fromLng, groups, referenceTime }) {
  const usable = (Array.isArray(groups) ? groups : []).filter(
    (group) => Array.isArray(group?.candidates) && group.candidates.length > 0,
  );
  if (usable.length === 0) {
    return { ok: false, reason: 'unroutable' };
  }

  /** @type {Array<{lat: number, lng: number}>} */
  const destinations = [];
  /** @type {Array<{label: string, start: number, end: number}>} */
  const spans = [];
  for (const group of usable) {
    const start = destinations.length;
    destinations.push(...group.candidates);
    spans.push({ label: group.label, start, end: destinations.length });
  }

  const answers =
    mode === 'transit'
      ? await fetchOneToManyIntermodal({
          fromLat,
          fromLng,
          destinations,
          time: new Date(referenceTime).toISOString(),
          maxTravelTime: Math.round(PLACE_MAX_SECONDS / 60),
          maxDirectSeconds: PLACE_MAX_SECONDS,
        })
      : await fetchOneToMany({
          mode: STREET_PROFILE[mode] ?? STREET_PROFILE.walk,
          fromLat,
          fromLng,
          destinations,
          maxSeconds: PLACE_MAX_SECONDS,
        });

  if (answers == null) {
    return { ok: false, reason: 'unavailable' };
  }

  /** @type {Map<string, PlaceMatch>} */
  const matches = new Map();
  for (const span of spans) {
    let best = null;
    for (let index = span.start; index < span.end; index += 1) {
      const answer = answers[index];
      // The two endpoints answer in different shapes; both are positional, so the index is what
      // ties an answer back to the place it is about.
      const seconds = mode === 'transit' ? answer?.transit?.seconds : answer?.seconds;
      if (!Number.isFinite(seconds)) {
        continue;
      }
      if (best == null || seconds < best.seconds) {
        best = { index: index - span.start, seconds, answer };
      }
    }
    if (best == null) {
      continue;
    }

    const walkSeconds = mode === 'transit' ? best.answer?.street?.seconds : null;
    matches.set(span.label, {
      index: best.index,
      minutes: toMinutes(best.seconds),
      distanceMeters: Number.isFinite(best.answer?.meters) ? Math.round(best.answer.meters) : null,
      transfers: mode === 'transit' ? (best.answer?.transit?.transfers ?? 0) : null,
      walk: Number.isFinite(walkSeconds)
        ? {
            minutes: toMinutes(walkSeconds),
            distanceMeters: Number.isFinite(best.answer?.street?.meters) ? Math.round(best.answer.street.meters) : null,
          }
        : null,
    });
  }

  // Every candidate of every group answered "no route". A fact about this place rather than an
  // outage, so the caller is allowed to count it against the listing.
  if (matches.size === 0) {
    return { ok: false, reason: 'unroutable' };
  }
  return { ok: true, matches };
}
