/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Turns the codes of a `/multi/` search url into the area it stands for.
 *
 * A search over several areas names each of them in a three-letter code - `/multi/vendita-case/
 * a5W,a7j,aR0,dJY/`. Nothing translates a code into a name: the api's catalogue of locations does
 * not carry the codes, the search page does not print them, and they encode nothing - they are row
 * numbers in a table only idealista holds.
 *
 * The map is therefore not looked for. The website draws those areas on its map, and the outline it
 * draws them from is served per code by the tile host, in the open: no bot wall, no session, no
 * browser. The api takes an outline as a search area, so a code is answered with its own border
 * rather than with the name and the id somebody would have to look up.
 *
 * The outline arrives as encoded polylines - the format google maps draws with - grouped by
 * parentheses, and is turned into the GeoJSON the api reads.
 *
 * An outline is enough to search by, and it is also what gives the code its name back: the adverts
 * inside it carry the id of the location they belong to, and the id every one of them shares is the
 * location the code stands for. Searching by that id rather than by the border is the same search
 * the website runs, down to the advert - a border catches a few neighbours whose coordinates sit on
 * the wrong side of it, and misses adverts the portal placed by address rather than by point.
 *
 * `reverse-engineered-idealista.md` records where else the map lives and why neither copy of it can
 * be harvested.
 */

import { call, searchPath } from './mobile-api.js';
import { createPromiseCache } from '../../utils/promise-cache.js';
import logger from '../logger.js';
/** @import { Portal } from './portal.js' */

/** The version of the tile set the outlines are served under. */
const TILE_SET = '19';

/**
 * Where the website's map reads an area's outline from. One tile host per country, the same shape
 * of path on each.
 *
 * @param {Portal} portal
 * @param {string} code
 * @returns {string}
 */
function outlineUrl(portal, code) {
  return `${portal.tiles}/${TILE_SET}/paths/${portal.country}/${code}`;
}

/**
 * How long to wait for the tile host, in milliseconds. The same order as the other plain clients in
 * the repository: a bare `fetch` has no timeout of its own, and a host that accepts the connection
 * and then says nothing would hold a job run open for as long as the socket lives.
 */
const REQUEST_TIMEOUT = 15000;

/** Coordinates are encoded to five decimal places, which is about a metre. */
const PRECISION = 1e5;

/** A code is three characters of the alphabet the website counts in. */
const CODE = /^[0-9A-Za-z]{3}$/;

/**
 * How far a simplified border may sit from the drawn one, in degrees - about fifty metres.
 *
 * An outline is drawn for a map and carries a point every few metres; one area of it runs to sixty
 * kilobytes, and a search naming four of them would be sent as a quarter of a megabyte of form
 * body. Thinning it costs a handful of adverts on the very edge of the area, which is a boundary
 * the portal itself only holds to within a house number.
 */
const SIMPLIFY_TOLERANCE = 5e-4;

/**
 * Outlines already read, keyed by country and code, so a job that runs every few minutes reads each
 * of its areas once. An outline is a border and borders do not move.
 *
 * @type {ReturnType<typeof createPromiseCache<number[][][]|null>>}
 */
const outlines = createPromiseCache();

/**
 * Decode one encoded polyline into its points.
 *
 * @param {string} encoded
 * @returns {number[][]} the points, as `[longitude, latitude]` pairs, which is GeoJSON's order
 */
export function decodePolyline(encoded) {
  const points = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < encoded.length) {
    // Each number is a chain of five-bit groups, low group first, each carried in a printable
    // character. The sixth bit says another group follows.
    for (const axis of [0, 1]) {
      let result = 0;
      let shift = 0;
      let byte;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20 && index < encoded.length);

      // The low bit holds the sign, and the value is the step from the point before it.
      const step = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) latitude += step;
      else longitude += step;
    }

    points.push([longitude / PRECISION, latitude / PRECISION]);
  }

  return points;
}

/**
 * The distance from a point to the line between two others, in degrees.
 *
 * @param {number[]} point
 * @param {number[]} start
 * @param {number[]} end
 * @returns {number}
 */
function distanceToSegment(point, start, end) {
  const runX = end[0] - start[0];
  const runY = end[1] - start[1];
  const length = runX * runX + runY * runY;
  if (length === 0) return Math.hypot(point[0] - start[0], point[1] - start[1]);

  const along = Math.max(0, Math.min(1, ((point[0] - start[0]) * runX + (point[1] - start[1]) * runY) / length));
  return Math.hypot(point[0] - (start[0] + along * runX), point[1] - (start[1] + along * runY));
}

/**
 * Drop the points of a ring that its shape does not need, keeping every one that is further than
 * the tolerance from the line its neighbours draw. Ramer-Douglas-Peucker, written as a loop because
 * a ring runs to thousands of points and the recursion would be as deep.
 *
 * @param {number[][]} ring
 * @param {number} tolerance
 * @returns {number[][]}
 */
export function simplifyRing(ring, tolerance = SIMPLIFY_TOLERANCE) {
  if (ring.length <= 3) return ring;

  const keep = new Array(ring.length).fill(false);
  keep[0] = true;
  keep[ring.length - 1] = true;

  const pending = [[0, ring.length - 1]];
  while (pending.length > 0) {
    const [first, last] = /** @type {number[]} */ (pending.pop());
    let furthest = -1;
    let distance = tolerance;

    for (let index = first + 1; index < last; index++) {
      const candidate = distanceToSegment(ring[index], ring[first], ring[last]);
      if (candidate > distance) {
        distance = candidate;
        furthest = index;
      }
    }

    if (furthest > 0) {
      keep[furthest] = true;
      pending.push([first, furthest], [furthest, last]);
    }
  }

  return ring.filter((_, index) => keep[index]);
}

/**
 * Read the outline of one area out of what the tile host serves.
 *
 * The rings are wrapped in parentheses, `((ring)(ring))`. Each is taken as an area of its own,
 * which is what a border made of several pieces - an island, a detached hamlet - needs.
 *
 * @param {string} body
 * @returns {number[][][]} one ring per area, empty when there was nothing to read
 */
export function parseOutline(body) {
  return [...String(body).matchAll(/\(([^()]+)\)/g)]
    .map((match) => simplifyRing(decodePolyline(match[1])))
    .filter((ring) => ring.length >= 3);
}

/**
 * @param {number[][][]} rings
 * @returns {{type: string, coordinates: number[][][][]}} the shape the api searches by, each ring
 *   an area of its own
 */
export function multiPolygonOf(rings) {
  return { type: 'MultiPolygon', coordinates: rings.map((ring) => [ring]) };
}

/**
 * The statuses that are the tile host's answer about the code rather than about the moment.
 *
 * Only these two may be remembered as "there is no such area". Everything else a host can answer
 * with - a 429, a 502 from the load balancer in front of it, a 503 while it is being deployed - is
 * the state of the minute, and the minute passes.
 */
const NO_SUCH_AREA = new Set([404, 410]);

/**
 * Fetch the outline of one area.
 *
 * What is cached is the promise, and `createPromiseCache` keeps a resolved value forever while
 * dropping a rejected one. So the two kinds of failure must not look alike here: a transient one
 * throws, is forgotten, and is tried again on the next run; only a host that has said the code does
 * not exist resolves with null and is believed. Answering null to a 503 pinned the outline - and
 * with it the location the outline names - to null for the lifetime of the process, and every run
 * of that job fell back to reading the website until Fredy was restarted.
 *
 * @param {Portal} portal The country whose map is read.
 * @param {string} code The three-letter code the url names the area with.
 * @returns {Promise<number[][][]|null>} its rings, or null when the host does not know the code
 * @throws {Error} when the host could not be read - a refusal of the moment, worth asking again
 */
function readOutline(portal, code) {
  return outlines.get(`${portal.country}|${code}`, async () => {
    const response = await fetch(outlineUrl(portal, code), { signal: AbortSignal.timeout(REQUEST_TIMEOUT) });
    if (!response.ok) {
      if (!NO_SUCH_AREA.has(response.status)) {
        throw new Error(`the tile host answered ${response.status} for the area "${code}"`);
      }
      logger.warn(`Idealista: no outline is published for the area "${code}" (${response.status}).`);
      return null;
    }
    // A body the host served and that holds no ring is an answer about the code, the same as a 404.
    const rings = parseOutline(await response.text());
    return rings.length === 0 ? null : rings;
  });
}

/**
 * The area a `/multi/` search covers, as the api wants it.
 *
 * @param {Portal} portal The country the search runs in.
 * @param {string[]} codes The codes the url names, in any order.
 * @returns {Promise<{type: string, coordinates: number[][][][]}|null>} the outline of all of them
 *   together, or null when any one of them is an area the host knows nothing about - a search
 *   missing one of its areas is the wrong search, not a smaller one
 * @throws {Error} when the tile host could not be read at all. Deliberately not caught anywhere
 *   below the provider: `getListings` already treats a throw as "the api could not be asked, read
 *   the website instead", which is the right answer for this run, and the throw is what keeps the
 *   next run from being served a remembered failure.
 */
export async function outlineOf(portal, codes) {
  if (codes.length === 0 || !codes.every((code) => CODE.test(code))) return null;

  const outlined = await Promise.all(codes.map((code) => readOutline(portal, code)));
  if (outlined.some((rings) => rings == null)) return null;

  return multiPolygonOf(/** @type {number[][][]} */ (outlined.flat()));
}

/**
 * Adverts read to work out which location a code stands for. Fifty is one page, and a page is a
 * wide enough sample that no single street can carry the answer on its own.
 */
const SAMPLE_SIZE = 50;

/** Where a location id stops being a country and starts being a province, in every country. */
const PROVINCE_DEPTH = 4;

/**
 * How far the count for the location may sit from the count for its border before the two are
 * taken to be different places. A border is always a little the wider of the two.
 */
const TOTAL_TOLERANCE = 0.2;

/** @type {ReturnType<typeof createPromiseCache<string|null>>} */
const located = createPromiseCache();

/**
 * The deepest location id every one of these adverts sits under.
 *
 * Adverts outside the province the sample is mostly in are dropped first: one advert whose point
 * fell across a provincial border would otherwise pull the answer up to the country.
 *
 * @param {string[]} locationIds
 * @returns {string|null}
 */
export function sharedLocationId(locationIds) {
  const ids = locationIds.filter((id) => typeof id === 'string' && id.split('-').length > PROVINCE_DEPTH);
  if (ids.length === 0) return null;

  /** @type {Map<string, number>} */
  const provinces = new Map();
  for (const id of ids) {
    const province = id.split('-').slice(0, PROVINCE_DEPTH).join('-');
    provinces.set(province, (provinces.get(province) ?? 0) + 1);
  }
  const [dominant] = [...provinces].sort(([, left], [, right]) => right - left)[0];

  const inside = ids.filter((id) => id.startsWith(`${dominant}-`)).map((id) => id.split('-'));
  let depth = PROVINCE_DEPTH;
  while (inside.every((parts) => parts.length > depth && parts[depth] === inside[0][depth])) depth++;

  return depth === PROVINCE_DEPTH ? dominant : inside[0].slice(0, depth).join('-');
}

/**
 * @param {Portal} portal
 * @param {SearchCriteria} criteria
 * @returns {Array<[string, string]>}
 */
function criteriaParams(portal, { operation, propertyType }) {
  return [
    ['operation', operation],
    ['propertyType', propertyType],
    ['locale', portal.country],
    ['numPage', '1'],
  ];
}

/**
 * @typedef {{operation: string, propertyType: string}} SearchCriteria What the search is for. The
 *   location a code stands for does not depend on it, but the sample of adverts does.
 */

/**
 * Work out which location a code stands for.
 *
 * @param {Portal} portal
 * @param {string} code
 * @param {SearchCriteria} criteria
 * @returns {Promise<string|null>} the location id, or null when the sample does not agree on one
 */
async function locate(portal, code, criteria) {
  const outline = await outlineOf(portal, [code]);
  if (outline == null) return null;

  const sampled = await call(portal, searchPath(portal), {
    query: [
      ['adIds', ''],
      ['searchType', 'drawn'],
    ],
    body: [...criteriaParams(portal, criteria), ['maxItems', String(SAMPLE_SIZE)], ['shape', JSON.stringify(outline)]],
  });

  const candidate = sharedLocationId((sampled?.elementList ?? []).map((advert) => advert?.locationId));
  if (candidate == null) return null;

  // The sample says where the adverts are; this says whether that location is the whole of what the
  // border covers, rather than a corner of it that the sample happened to sit in.
  const named = await call(portal, searchPath(portal), {
    query: [
      ['adIds', ''],
      ['searchType', 'locationIds'],
    ],
    body: [...criteriaParams(portal, criteria), ['maxItems', '1'], ['locationIds', `[${candidate}]`]],
  });

  const border = sampled?.total ?? 0;
  if (Math.abs((named?.total ?? 0) - border) > Math.max(5, border * TOTAL_TOLERANCE)) {
    logger.debug(`Idealista: "${code}" covers ${border} adverts but ${candidate} holds ${named?.total}.`);
    return null;
  }

  logger.debug(`Idealista: the area "${code}" is ${candidate} (${named?.searchTitle}).`);
  return candidate;
}

/**
 * The locations a `/multi/` search covers.
 *
 * @param {Portal} portal The country the search runs in.
 * @param {string[]} codes The codes the url names.
 * @param {SearchCriteria} criteria
 * @returns {Promise<string[]|null>} their location ids, or null when any one of them cannot be
 *   named - a search missing one of its areas is the wrong search, not a smaller one
 * @throws {Error} when the tile host could not be read, for the reason `outlineOf` gives. The
 *   rejection also drops the entry from `located`, so a code is not remembered as unnameable
 *   because its border happened to be unreadable once.
 */
export async function locationsOf(portal, codes, criteria) {
  if (codes.length === 0 || !codes.every((code) => CODE.test(code))) return null;

  const found = await Promise.all(
    codes.map((code) =>
      located.get(`${portal.country}|${criteria.operation}|${criteria.propertyType}|${code}`, () =>
        locate(portal, code, criteria),
      ),
    ),
  );

  return found.some((id) => id == null) ? null : /** @type {string[]} */ (found);
}

/**
 * Forget the outlines and the locations this process has read. Exists for the tests, which serve
 * their own tile host; nothing in a running instance ever needs it, because a border does not move.
 *
 * @returns {void}
 */
export function resetZoneMemory() {
  outlines.clear();
  located.clear();
}
