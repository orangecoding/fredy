/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Runs a search against the idealista mobile api.
 *
 * The api takes what the website will not: it sorts by publication date. The website's robots.txt
 * disallows that sort, which is why reading the site means walking the whole result set in the
 * portal's own ranking and hoping the new advert is somewhere in it. Here the newest advert is the
 * first one on the first page, so a run reads the few pages that can hold everything published
 * since the run before it.
 *
 * Which of the three national apis is asked is decided by the portal the job's url belongs to
 * (`./portal.js`) and travels with every call, so nothing here is bound to one country.
 *
 * A search url is first read by idealista itself - `./deeplink.js` asks the parser its app uses and
 * is answered with the search in the api's own words. Where that cannot be asked, the url is
 * translated locally (`./web-translator.js`, with the table of filters in `./search-filters.js`) -
 * by place where it names one, by outline where it names areas in the website's shorthand
 * (`./zones.js`), and by the polygon itself where the user drew one on the map. Where the url names
 * several building conditions, the api is asked once per value and the answers are merged.
 */

import { call, MAX_ITEMS_PER_PAGE, searchPath } from './mobile-api.js';
import { resolveLocationId } from './locations.js';
import { locationsOf, multiPolygonOf, outlineOf, parseOutline } from './zones.js';
import { translateSearchUrl } from './web-translator.js';
import { NOT_A_SEARCH, parseSearchUrl } from './deeplink.js';
import { PORTALS, portalOf } from './portal.js';
import logger from '../logger.js';
/** @import { Portal } from './portal.js' */

/**
 * How many pages of a date-ordered search one run reads.
 *
 * The first page holds the fifty newest adverts, which is more than a search collects between two
 * runs of a job. A variant whose head is deeper - a wide search that already holds hundreds of
 * adverts when the job starts - is caught up whole the first time this process runs the url, and
 * from then on the head is the only traffic there is. The adverts carry no date a watermark could
 * be taken from, so the catch-up is keyed on the process having run the search at all: a restart
 * pays one thorough run per search again.
 */
const MAX_PAGES = 3;
const CATCHUP_PAGES = 12;

/**
 * A map that forgets its oldest entry once it holds more than `capacity`.
 *
 * Both memos below answer a question about a url, and a long-lived instance whose jobs are edited
 * over the months would otherwise keep an entry for every url it ever saw. Forgetting one costs a
 * request that has to be made again, never a wrong answer.
 *
 * @template T
 * @param {number} capacity
 * @returns {{get: (key: string) => T|undefined, has: (key: string) => boolean, set: (key: string, value: T) => void, clear: () => void}}
 */
function boundedMap(capacity) {
  /** @type {Map<string, T>} */
  const entries = new Map();
  return {
    get: (key) => entries.get(key),
    has: (key) => entries.has(key),
    set(key, value) {
      // Re-inserting moves the key to the young end, so what is dropped is the least recently
      // written entry rather than whatever happens to be first.
      entries.delete(key);
      entries.set(key, value);
      if (entries.size > capacity) entries.delete(/** @type {string} */ (entries.keys().next().value));
    },
    clear: () => entries.clear(),
  };
}

/**
 * The searches this process has already run to the end, keyed by the job and its url.
 *
 * By the job as well as the url because the catch-up is what a *job* has seen: two jobs watching
 * one search each need their own thorough first run, since what has been stored is per job. The
 * key falls back to the url alone when the caller names no job - a fixture run, a tool - which
 * only ever costs a deeper walk, never a missed advert.
 *
 * @type {ReturnType<typeof boundedMap<true>>}
 */
const caughtUp = boundedMap(500);

/**
 * What idealista's own parser answered for a url, since the answer depends on the url and nothing
 * else. Without this, every run of every job spends one paced request re-reading a url that has
 * not changed since the job was created.
 *
 * Only an answer that *is* a search is remembered. The other two are both the state of a moment
 * wearing the same clothes as a permanent verdict: a parser that could not be reached at all
 * answers null, and a parser that answered something other than a search answers the same sentinel
 * whether the url is genuinely one it will not serve or the host put a maintenance page, an error
 * document or a cache's holding reply behind a 200. Remembering the sentinel meant one odd reply
 * downgraded that job to the website path for the lifetime of the process. Not remembering it costs
 * one paced request per run for a url the parser really will not serve - which is a job that is
 * being read off the website anyway, and by far the more expensive half of that run.
 *
 * @type {ReturnType<typeof boundedMap<any>>}
 */
const parsedUrls = boundedMap(200);

/**
 * The parameters every search sends, whatever the url asked for.
 *
 * `quality` and `gallery` are what makes the answer carry a description and a photo; without them
 * the api serves a shorter advert that Fredy has less to show and less to deduplicate on.
 *
 * @type {Array<[string, string]>}
 */
/**
 * @param {Portal} portal
 * @returns {Array<[string, string]>}
 */
function commonParams(portal) {
  return [
    ['order', 'publicationDate'],
    ['sort', 'desc'],
    ['locale', portal.country],
    ['quality', 'high'],
    ['gallery', 'true'],
    ['maxItems', String(MAX_ITEMS_PER_PAGE)],
  ];
}

/**
 * @typedef {{searchType: string, params: Array<[string, string]>}} SearchArea Where to search, and
 *   under which search type the api reads it.
 */

/**
 * Read one page of a search.
 *
 * @param {Portal} portal
 * @param {SearchArea} area
 * @param {import('./web-translator.js').WebSearch} search
 * @param {Array<[string, string]>} filters One of the search's parameter sets.
 * @param {number} page Counted from one.
 * @returns {Promise<any>} the api's answer
 */
function readPage(portal, area, search, filters, page) {
  return call(portal, searchPath(portal), {
    query: [
      ['adIds', ''],
      ['searchType', area.searchType],
    ],
    body: [
      ['operation', search.operation],
      ['propertyType', search.propertyType],
      ...area.params,
      ['numPage', String(page)],
      ...commonParams(portal),
      ...filters,
    ],
  });
}

/**
 * Work out where a translated url searches.
 *
 * @param {Portal} portal
 * @param {import('./web-translator.js').WebSearch} search
 * @returns {Promise<SearchArea|null>} null when the place cannot be pinned down
 */
async function areaOf(portal, search) {
  if (search.drawnShape != null) {
    // The polygon the user drew, in the very encoding the tile host serves borders in.
    const rings = parseOutline(search.drawnShape);
    if (rings.length === 0) return null;
    return { searchType: 'drawn', params: [['shape', JSON.stringify(multiPolygonOf(rings))]] };
  }

  if (search.locationCodes.length > 0) {
    // The locations behind the codes are the search the website runs. Their borders are only the
    // shape of it, so they are used where a code cannot be named - a new area the portal has drawn
    // but has no adverts in yet.
    const locations = await locationsOf(portal, search.locationCodes, search);
    if (locations != null) {
      return { searchType: 'locationIds', params: [['locationIds', `[${locations.join(',')}]`]] };
    }

    const outline = await outlineOf(portal, search.locationCodes);
    if (outline == null) return null;
    logger.debug('Idealista: searching the borders of the areas, having failed to name them.');
    return { searchType: 'drawn', params: [['shape', JSON.stringify(outline)]] };
  }

  const locationId = await resolveLocationId(portal, search.locationSlugs, search);
  if (locationId == null) return null;
  return { searchType: 'locationIds', params: [['locationIds', `[${locationId}]`]] };
}

/**
 * Ask idealista's parser about a url, remembering what it answers.
 *
 * @param {Portal} portal
 * @param {string} webUrl
 * @returns {Promise<any>} the parsed search, the parser's own "this is not a search" answer, or
 *   null when the parser could not be reached at all. Only the first of the three is remembered -
 *   see `parsedUrls`.
 */
async function parseOnce(portal, webUrl) {
  const key = `${portal.country}|${webUrl}`;
  if (parsedUrls.has(key)) return parsedUrls.get(key);

  const parsed = await parseSearchUrl(portal, webUrl);
  if (parsed != null && parsed !== NOT_A_SEARCH) parsedUrls.set(key, parsed);
  return parsed;
}

/**
 * Run a search the api can answer.
 *
 * The parser first: one request reads the url the way the portal does, filters and place together.
 * The local translation stands behind it, for the runs where the parser cannot be asked.
 *
 * @param {Portal} portal The site the url was copied from, whose api answers the search.
 * @param {string} webUrl The job's search url, as it was copied off the website.
 * @param {string|null} [jobKey] The job the search is run for, which is what the catch-up is
 *   remembered per.
 * @returns {Promise<any[]|null>} the adverts, newest first, or null when the url names a search the
 *   api cannot be asked for and the website has to be read instead
 */
export async function searchListings(portal, webUrl, jobKey = null) {
  const parsed = await parseOnce(portal, webUrl);
  let search = parsed?.search ?? null;
  let area = parsed?.area ?? null;

  if (search == null || area == null) {
    search = translateSearchUrl(portal, webUrl);
    area = search == null ? null : await areaOf(portal, search);
  }

  if (search == null) {
    logger.debug(`Idealista: ${webUrl} names a search the mobile api has no terms for; reading the website.`);
    return null;
  }

  if (area == null) {
    logger.debug(`Idealista: the api knows no area called "${webUrl}"; reading the website instead.`);
    return null;
  }

  const adverts = [];
  const seen = new Set();
  const walked = `${jobKey ?? ''}|${webUrl}`;
  const pageCap = caughtUp.has(walked) ? MAX_PAGES : CATCHUP_PAGES;

  for (const filters of search.variants) {
    for (let page = 1; page <= pageCap; page++) {
      const answer = await readPage(portal, area, search, filters, page);
      const found = Array.isArray(answer?.elementList) ? answer.elementList : [];

      for (const advert of found) {
        if (advert?.propertyCode == null || seen.has(advert.propertyCode)) continue;
        seen.add(advert.propertyCode);
        adverts.push(advert);
      }

      if (found.length < MAX_ITEMS_PER_PAGE || page >= (answer?.totalPages ?? 0)) break;
    }
  }

  caughtUp.set(walked, true);
  return adverts;
}

/**
 * Forget what this process remembers about the searches it has run - which ones it has caught up
 * with, and what the parser said about their urls. Exists for the tests.
 *
 * @returns {void}
 */
export function resetSearchMemory() {
  caughtUp.clear();
  parsedUrls.clear();
}

/**
 * Read one advert by the code that names it on the website.
 *
 * The search endpoint answers by id as readily as by place, which is what lets a stored listing be
 * checked - and priced again - without rendering the page it came from.
 *
 * @param {string} propertyCode
 * @param {string|null} [link] The advert's own url, which says which country's api holds it. A
 *   caller that kept only the code is answered by the Italian api: it is where every advert stored
 *   before this provider covered three countries came from.
 * @returns {Promise<any|null>} the advert, or null when idealista no longer carries it
 */
export async function readAdvert(propertyCode, link = null) {
  const portal = portalOf(link) ?? PORTALS['idealista.it'];
  const answer = await call(portal, searchPath(portal), {
    query: [['adIds', String(propertyCode)]],
    body: [
      ['operation', 'sale'],
      ['propertyType', 'homes'],
      ['locale', portal.country],
      ['numPage', '1'],
      ['maxItems', '1'],
    ],
  });

  // An advert is returned whatever operation and property type the query names - both are required
  // parameters that the id makes moot - so the answer is empty only when the advert is gone.
  return answer?.elementList?.[0] ?? null;
}

/**
 * The one advert's detail, which is where the api keeps the dates the search does not carry. Note
 * the version: the detail is served under `3` where everything else is under `3.5`.
 *
 * @param {Portal} portal
 * @param {string} propertyCode
 * @returns {string}
 */
function detailPath(portal, propertyCode) {
  return `/api/3/${portal.country}/detail/${propertyCode}`;
}

/**
 * Read the date the portal itself states an advert was last modified.
 *
 * The search answers no dates at all - not `firstActivationDate`, not anything else - while the
 * detail the android app opens for one advert carries `modificationDate`, as both the epoch
 * milliseconds and the sentence the website prints under them ("Annuncio aggiornato un'ora fa").
 * The value is what a list orders by; the text is the site's own business.
 *
 * @param {Portal} portal The site the advert lives on.
 * @param {string} propertyCode The code that names the advert on the website.
 * @returns {Promise<number|null>} Epoch milliseconds, or null when the api gives no date.
 */
export async function readAdvertModificationDate(portal, propertyCode) {
  const detail = await call(portal, detailPath(portal, propertyCode), {
    method: 'GET',
    query: [
      ['language', portal.country],
      ['quality', 'high'],
      ['typology', 'homes'],
    ],
  });
  const value = detail?.modificationDate?.value;
  return typeof value === 'number' && value > 0 ? value : null;
}
