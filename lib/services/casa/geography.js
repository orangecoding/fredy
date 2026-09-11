/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Turns the place a search url names into the key the search api filters by.
 *
 * The api names a place with an opaque `hkey` and the level it sits at, and a url names it in
 * words. The id casa.it prints elsewhere (`IT-LAZ-058091`) is not accepted: sent as `id` it is
 * ignored in silence and the search widens to the whole country, which is the worst kind of wrong.
 * Only `hkey` works.
 *
 * The lookup is the same autocomplete the app's search box uses. It needs no key and no session.
 *
 * See `reverse-engineered-casa.md`.
 */

import { createPromiseCache } from '../../utils/promise-cache.js';
import { slugify } from '../../utils/slugify.js';
import logger from '../logger.js';

const SUGGEST_URL = 'https://smartsuggest.casa.it/smartsuggest/v1/suggest/';

/**
 * How long to wait for the lookup, in milliseconds. The same order as the other plain clients in
 * the repository: a bare `fetch` has no timeout of its own, and a host that accepts the connection
 * and then says nothing would hold a job run open for as long as the socket lives.
 */
const REQUEST_TIMEOUT = 15000;

/**
 * The statuses that are the service's answer about the place rather than about the moment.
 *
 * Only these may be remembered as "no such place". A 429 or anything the host answers while it is
 * unwell is the state of the minute, and the minute passes.
 */
const NO_SUCH_PLACE = new Set([404, 410]);

/** The catalogue to look places up in. */
const SITE = 'it_casa';

/**
 * What the api calls each level of the hierarchy. A name alone does not identify a place - Roma is
 * both a province and the town in it - so the level has to be chosen rather than ranked.
 */
export const LEVELS = { region: 4, province: 6, town: 9, zone: 10, subzone: 11 };

/**
 * Places already resolved, shared by every job. A town keeps its key.
 *
 * @type {ReturnType<typeof createPromiseCache<{hkey: string, level: number}|null>>}
 */
const places = createPromiseCache();

/**
 * The words a url spells a place with, as a name to look up.
 *
 * @param {string} slug
 * @returns {string}
 */
export function toQuery(slug) {
  return String(slug).replace(/-/g, ' ').trim();
}

/**
 * @param {any} place
 * @param {string} slug
 * @returns {boolean} whether this is the place the url spells that way
 */
function matches(place, slug) {
  // One place, one slug, and it arrives as a string rather than as the list its plural name
  // suggests.
  const slugs = String(place?.slugs ?? '')
    .split(',')
    .map((entry) => entry.trim());
  if (slugs.includes(slug)) return true;

  return slugify(place?.name) === slug;
}

/**
 * Look a place up by the name a url spells it with.
 *
 * @param {string} slug
 * @param {number[]} levels The levels worth accepting, in the order the url makes them likely.
 * @returns {Promise<{hkey: string, level: number}|null>} the place, or null when the catalogue
 *   holds no such name
 * @throws {Error} when the lookup could not be read - see `resolvePlace` for why the two have to
 *   be told apart
 */
async function lookUp(slug, levels) {
  const url = new URL(SUGGEST_URL);
  url.searchParams.set('query', toQuery(slug));
  url.searchParams.set('site', SITE);

  const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT) });
  if (!response.ok) {
    if (!NO_SUCH_PLACE.has(response.status)) {
      throw new Error(`the place lookup answered ${response.status} for "${slug}"`);
    }
    logger.warn(`Casa.it: the place lookup answered ${response.status} for "${slug}".`);
    return null;
  }

  const found = (await response.json())?.data?.results;
  const candidates = (Array.isArray(found) ? found : []).filter((place) => matches(place, slug));
  for (const level of levels) {
    const place = candidates.find((candidate) => Number(candidate?.level) === level);
    if (place?.hkey != null) return { hkey: String(place.hkey), level };
  }
  return null;
}

/**
 * Resolve one place named in a url.
 *
 * What the cache keeps is the promise, and it keeps a resolved one forever while dropping a
 * rejected one. So a lookup that could not be made has to reject rather than resolve with null:
 * answering null to a 503 would pin that town to "no such place" for the lifetime of the process,
 * and every run of every job searching it would fall back to rendering the website. The rejection
 * is turned back into a null here, once the cache has forgotten it, so no caller has to learn a new
 * shape - "not this run" and "no such place" both read as "read the page instead", and only one of
 * them is remembered.
 *
 * @param {string} slug
 * @param {number[]} [levels] Which levels to accept, most likely first.
 * @returns {Promise<{hkey: string, level: number}|null>}
 */
export function resolvePlace(slug, levels = [LEVELS.town, LEVELS.province, LEVELS.region, LEVELS.zone]) {
  // The levels are part of the key: the same name resolves to a different place depending on which
  // of them the url makes likely, and Roma the province is not Roma the town.
  return places
    .get(`${slug}|${levels.join(',')}`, () => lookUp(slug, levels))
    .catch((error) => {
      logger.warn(`Casa.it: the place lookup could not be read for "${slug}" (${error?.message ?? error}).`);
      return null;
    });
}

/**
 * Forget the places resolved so far. Exists for the tests, which serve their own.
 *
 * @returns {void}
 */
export function clearPlaceCache() {
  places.clear();
}
