/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Transport for Bien'ici's JSON endpoints.
 *
 * Bien'ici needs no browser. Its result page is a single page application that reads the same
 * endpoints any client may read, and nothing stands in front of them - a plain request with an
 * ordinary user agent is answered like the page's own. So a run is one search, preceded by one place
 * lookup per place the url names on the first run of the day, and a price or activity probe is one
 * request per listing.
 *
 * Endpoints used:
 * - `GET https://res.bienici.com/place.json?q=<slug>&type=<types>&prefix=no` - the place a url
 *   slug names, with the `zoneIds` the search is limited by. The page makes the same call.
 * - `GET https://www.bienici.com/realEstateAds.json?filters=<json>` - one page of adverts,
 *   `{total, from, perPage, realEstateAds}`.
 * - `GET https://www.bienici.com/realEstateAd.json?id=<id>` - one advert, and a 404 once it has
 *   been taken down.
 *
 * @see lib/services/bienici/search-model.js for how a search url becomes `filters`.
 */

import { BIENICI_ORIGIN, buildFilters, placeMatchesSlug } from './search-model.js';

/** Where the place lookup lives. A host of its own, next to the site's static resources. */
const PLACE_ENDPOINT = 'https://res.bienici.com/place.json';

/** How long one request may take before the run gives up on it. */
const REQUEST_TIMEOUT = 30_000;

/**
 * How long a place lookup is remembered. A slug names the same zones tomorrow as it does today, and
 * a day is short enough that a place Bien'ici renames reaches the jobs searching it the day after.
 */
const PLACE_LOOKUP_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * The place lookups of the last day, by what was asked.
 *
 * Module scope on purpose, and not the kind the stateless-provider rule is about: nothing in here
 * belongs to a run. It is the answer to a question every run of every job asks the same way, and
 * asking it again on every run put one round trip per place in front of each search.
 *
 * @type {Map<string, {expires: number, body: any}>}
 */
const placeLookups = new Map();

/** An ordinary desktop browser, which is all the endpoints ask of a client. */
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

/**
 * @param {string} url
 * @returns {Promise<{status: number, body: any}>} the parsed body, or null for an empty or non-JSON one
 */
async function getJson(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT, Referer: `${BIENICI_ORIGIN}/` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });
  if (!response.ok) return { status: response.status, body: null };
  try {
    return { status: response.status, body: await response.json() };
  } catch {
    return { status: response.status, body: null };
  }
}

/**
 * Ask Bien'ici's place lookup what one slug names, the way its own search page does.
 *
 * An answer is remembered for {@link PLACE_LOOKUP_TTL_MS}; a failed lookup is not, so the next run
 * asks again rather than failing on a stale error.
 *
 * @param {import('./search-model.js').BieniciPlaceQuery} place
 * @returns {Promise<{status: number, body: any}>} the lookup's answer, `body` null when there was none
 */
export async function lookUpPlace(place) {
  const key = `${place.q}|${place.type}`;
  const now = Date.now();
  const remembered = placeLookups.get(key);
  if (remembered != null && remembered.expires > now) return { status: 200, body: remembered.body };

  const query = new URLSearchParams({ q: place.q, type: place.type, prefix: 'no' });
  const answer = await getJson(`${PLACE_ENDPOINT}?${query}`);
  if (answer.body != null) {
    for (const [known, entry] of placeLookups) {
      if (entry.expires <= now) placeLookups.delete(known);
    }
    placeLookups.set(key, { expires: now + PLACE_LOOKUP_TTL_MS, body: answer.body });
  }
  return answer;
}

/**
 * Resolve the places a search url names into the zones the search endpoint is limited by.
 *
 * A place that cannot be resolved, or resolves to a different place than the one named, ends the
 * run: searching the rest would quietly drop an area the user asked for, and searching the lookup's
 * best guess would report flats in a town nobody asked about. The places are looked up at once
 * rather than one after the other.
 *
 * @param {import('./search-model.js').BieniciPlaceQuery[]} places
 * @param {string} searchUrl the url, for the error messages
 * @returns {Promise<string[]>} every zone id, in the order of the places; empty for none
 * @throws {Error} when a place is unknown or the lookup does not answer
 */
export async function resolveZoneIds(places, searchUrl) {
  const answers = await Promise.all(places.map((place) => lookUpPlace(place)));
  const zoneIds = [];

  for (const [index, place] of places.entries()) {
    const { status, body } = answers[index];

    if (body == null) {
      throw new Error(`Bien'ici's place lookup answered ${status} for '${place.slug}', so the job cannot run.`);
    }
    if (!placeMatchesSlug(place.slug, body) || !Array.isArray(body.zoneIds) || body.zoneIds.length === 0) {
      throw new Error(
        `Bien'ici does not know the place '${place.slug}' any more (its lookup suggests '${body.name ?? 'nothing'}'). ` +
          `Searching elsewhere would report flats you never asked about, so the job stops instead. Run the search ` +
          `on bienici.com again and paste its new address. Url: ${searchUrl}`,
      );
    }
    zoneIds.push(...body.zoneIds.map(String));
  }

  return [...new Set(zoneIds)];
}

/**
 * Run a search and hand back its first page of adverts, newest first.
 *
 * @param {import('./search-model.js').BieniciSearch} search the url, as `parseSearchUrl` read it
 * @param {string[]} zoneIds the zones {@link resolveZoneIds} found for it
 * @returns {Promise<any[]>} the raw adverts
 * @throws {Error} when the endpoint refuses the search. That is either a filter it no longer
 *   accepts or an outage, and both are worth a line in the job's log rather than an empty result.
 */
export async function searchAds(search, zoneIds) {
  const query = new URLSearchParams({ filters: JSON.stringify(buildFilters(search.filters, zoneIds)) });
  if (search.extensionType != null) query.set('extensionType', search.extensionType);

  const { status, body } = await getJson(`${BIENICI_ORIGIN}/realEstateAds.json?${query}`);
  if (body == null || !Array.isArray(body.realEstateAds)) {
    // A refused filter is answered 200 with `{success: false, errors}`, not with an error status.
    const reason = body?.errors ? JSON.stringify(body.errors).slice(0, 400) : `status ${status}`;
    throw new Error(`Bien'ici refused the search (${reason}).`);
  }
  return body.realEstateAds;
}

/**
 * Ask about one advert.
 *
 * @param {string} id the advert's id, as the search answers it
 * @returns {Promise<{status: number, ad: any|null}>} the advert when there is one
 */
export async function fetchAd(id) {
  const { status, body } = await getJson(`${BIENICI_ORIGIN}/realEstateAd.json?id=${encodeURIComponent(id)}`);
  return { status, ad: body != null && typeof body === 'object' && body.id != null ? body : null };
}
