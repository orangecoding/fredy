/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Turns the place a search url names into the ids the search endpoint filters by.
 *
 * A search url names its place in words - `/vendita-case/erbusco/` - while the endpoint wants
 * `idComune=7369`, and nothing in the url carries that number. The website knows it because its
 * page is rendered with the search already resolved, which is why reading a town search used to
 * mean opening a browser and clearing a bot wall.
 *
 * The android app resolves a place without any of that: it has a geography service of its own, on
 * a host that serves plain JSON to an unauthenticated request. It answers with the place and with
 * every place above it - quarter, town, province, region - and those are the same ids the website's
 * own endpoint filters by.
 *
 * See `reverse-engineered-immobiliare.md` for the levels this answers with and for why the url's
 * own grammar, rather than the service's ranking, says which one is meant.
 */

import { createPromiseCache } from '../../utils/promise-cache.js';
import { slugify } from '../../utils/slugify.js';
import logger from '../logger.js';

/** The host the android app talks to. Unrelated to www.immobiliare.it, and not behind DataDome. */
const BASE_URL = 'https://android-imm-v4.ws-app.com/b2c/v1';

/**
 * The app names itself in a structured user agent. The service answers a request without it, but a
 * client that looks like the app is the one it is meant to serve.
 */
const USER_AGENT =
  'WSCommand3<Furious>|REL|PRD|1080,2410,2.625|26.13.0|ANDROID|Google Pixel 10 Pro|17|PHO|2.0-01/09/2016-16:40|0|0';

/**
 * What each level of the answer is called, by the `type` the service tags it with, and the query
 * parameter the search endpoint filters that level by.
 *
 * A quarter is filtered as a list, which is how the website asks for several at once.
 */
const LEVELS = {
  '-1': { name: 'nation', param: 'idNazione' },
  0: { name: 'region', param: 'fkRegione' },
  1: { name: 'province', param: 'idProvincia' },
  2: { name: 'city', param: 'idComune' },
  3: { name: 'quarter', param: 'idMZona[]' },
};

/**
 * How long to wait for the geography service, in milliseconds. The same order as the other plain
 * clients in the repository: a bare `fetch` has no timeout of its own, and a host that accepts the
 * connection and then says nothing would hold a job run open for as long as the socket lives.
 */
const REQUEST_TIMEOUT = 15000;

/**
 * The statuses that are the service's answer about the place rather than about the moment.
 *
 * Only these may be remembered as "no such place". A 429 or anything the host answers while it is
 * unwell is the state of the minute, and the minute passes.
 */
const NO_SUCH_PLACE = new Set([404, 410]);

/**
 * The suffix the website hangs on a province, to tell `/vendita-case/brescia-provincia/` - every
 * town in the province - from `/vendita-case/brescia/`, which is the city.
 */
const PROVINCE_SUFFIX = '-provincia';

/**
 * Places already resolved. A town keeps its id, so a job running every few minutes asks once.
 *
 * @type {ReturnType<typeof createPromiseCache<Record<string, string>|null>>}
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
 * Whether a place the service returned is the one the url asked for.
 *
 * The service ranks by relevance and answers a town in another province as readily as the one meant,
 * so the name has to match rather than merely rank first.
 *
 * @param {any} place
 * @param {string} slug
 * @returns {boolean}
 */
function matches(place, slug) {
  // A label reads "Città Studi, Susa", qualifying the place with something the url leaves out.
  const head = String(place?.label ?? '').split(',')[0];
  return slugify(head) === slug;
}

/**
 * Look a place up by the name a url spells it with.
 *
 * @param {string} slug One path segment, for example `erbusco` or `citta-studi`.
 * @param {string} [within] The slug of the place above it, when the url names one, which is what
 *   tells two towns of the same name apart.
 * @returns {Promise<Record<string, string>|null>} the criteria naming that place and every place
 *   above it, or null when nothing matches
 * @throws {Error} when the service could not be read - see `resolvePlace` for why the two have to
 *   be told apart
 */
async function lookUp(slug, within) {
  const province = slug.endsWith(PROVINCE_SUFFIX);
  const named = province ? slug.slice(0, -PROVINCE_SUFFIX.length) : slug;
  // The url's own grammar says which level is meant, and it has to, because a name alone does not:
  // "Brescia" is a province, a town in it, and a quarter of a town in Rimini.
  const wantedType = province ? 1 : within == null ? 2 : 3;
  const query = within == null ? toQuery(named) : `${toQuery(named)} ${toQuery(within)}`;
  const response = await fetch(`${BASE_URL}/geography/autocomplete?query=${encodeURIComponent(query)}`, {
    headers: { 'user-agent': USER_AGENT, 'accept-language': 'it-IT' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });
  if (!response.ok) {
    if (!NO_SUCH_PLACE.has(response.status)) {
      throw new Error(`the geography service answered ${response.status} for "${query}"`);
    }
    logger.warn(`Immobiliare.it: the geography service answered ${response.status} for "${query}".`);
    return null;
  }

  const found = await response.json();
  const place = Array.isArray(found)
    ? found.find((entry) => entry?.type === wantedType && matches(entry, named))
    : null;
  if (place == null) return null;

  /** @type {Record<string, string>} */
  const criteria = {};
  for (const entry of [...(place.parents ?? []), place]) {
    const level = LEVELS[String(entry?.type)];
    if (level != null && entry?.id != null) criteria[level.param] = String(entry.id);
  }
  return criteria;
}

/**
 * Resolve the place a search url names.
 *
 * What the cache keeps is the promise, and it keeps a resolved one forever while dropping a
 * rejected one. So a lookup that could not be made has to reject rather than resolve with null:
 * answering null to a 503 would pin that town to "no such place" for the lifetime of the process,
 * and every run of every job searching it would go back to rendering the website behind its bot
 * wall. The rejection is turned back into a null here, once the cache has forgotten it, so no
 * caller has to learn a new shape - and `getListings` in the provider does not wrap this call, so a
 * throw escaping would end the run rather than fall back to the page.
 *
 * @param {string[]} slugs The path segments naming the place, widest first.
 * @returns {Promise<Record<string, string>|null>} the criteria to search it by, or null when the
 *   place cannot be found
 */
export function resolvePlace(slugs) {
  if (slugs.length === 0) return Promise.resolve(null);

  // The last segment is the place; the one before it, where there is one, tells it from its
  // namesakes. Deeper nesting than that names the same place twice over.
  const slug = slugs[slugs.length - 1];
  const within = slugs.length > 1 ? slugs[slugs.length - 2] : undefined;
  const key = `${within ?? ''}/${slug}`;

  return places
    .get(key, () => lookUp(slug, within))
    .catch((error) => {
      logger.warn(`Immobiliare.it: the geography service could not be read for "${key}" (${error?.message ?? error}).`);
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
