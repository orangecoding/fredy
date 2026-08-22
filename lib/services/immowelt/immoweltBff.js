/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Transport for immowelt's search BFF.
 *
 * Immowelt serves its listings as JSON, but the whole origin sits behind DataDome. A plain
 * `fetch` from node is answered with 403 "Please enable JS" no matter which headers it carries,
 * and replaying a browser's `datadome` cookie into node does not help either - DataDome
 * fingerprints the TLS and HTTP/2 handshake, which node cannot forge. The API is therefore called
 * from inside the browser Fredy already runs: one warm-up navigation earns the cookie, and every
 * request after that is a same-origin `fetch` issued by the page itself.
 *
 * That is also the point of doing it this way. Scraping the rendered pages costs one full document
 * navigation for the result page plus one for every listing whose details are wanted; here it is a
 * single navigation to the (cheapest, least scrutinised) home page for the entire run, after which
 * the requests are XHRs on an established session. Fewer scored navigations per run means fewer
 * runs that end at a bot wall.
 *
 * Endpoints used:
 * - `POST /serp-bff/search` - takes `{criteria, paging}` (see `immowelt-search-model.js`), answers
 *   `{totalCount, classifieds: [{id}]}`. Ids only.
 * - `GET /classifiedList/{id},{id},…` with an `x-language` header - answers the full card payload
 *   per id: title, prices, key facts, address, gallery, agent contact and a 500 character
 *   description.
 * - `GET /search-mfe-bff/places/data` and `GET /search-mfe-bff/routing/isochrone` - the two calls
 *   that turn a commute area into a boundary, see {@link resolveCommuteAreas}.
 */

import logger from '../logger.js';
import { trackPoi } from '../tracking/Tracker.js';
import { TRACKING_POIS } from '../../TRACKING_POIS.js';
import { isochroneToPolylines } from './immowelt-search-model.js';

/** Origin every request goes to. Also the warm-up target. */
export const IMMOWELT_ORIGIN = 'https://www.immowelt.de';

/** How long the warm-up navigation may take. */
const WARMUP_NAVIGATION_TIMEOUT = 60_000;

/** How long to wait for DataDome to hand out its cookie before trying anyway. */
const DATADOME_COOKIE_TIMEOUT = 15_000;

/** How long one BFF round trip may take. */
const REQUEST_TIMEOUT = 45_000;

/**
 * How many ids one `/classifiedList` request may carry.
 *
 * The ids go into the path, and immowelt's edge answers 403 once that path grows past roughly a
 * kilobyte - 50 ids (665 characters) still pass, 100 ids (1315) do not. The limit is a property of
 * the request rather than of the session: it fires on the very first call from a fresh browser and
 * keeps firing at exactly that size. 30 is what immowelt's own result page asks for, which keeps
 * the requests both short enough and shaped like the ones the site makes itself.
 */
const CLASSIFIED_LIST_BATCH_SIZE = 30;

/**
 * The warmed page per browser instance.
 *
 * Keyed by the browser rather than kept in module scope on purpose: two jobs can run at once (a
 * manual run started while the scheduler works through the others), each with its own browser, and
 * a single shared page would let the second job's requests run in the first job's session. A
 * WeakMap keyed on the run's own browser is scoped exactly like the browser is and disappears with
 * it.
 *
 * @type {WeakMap<object, Promise<any>>}
 */
const warmPages = new WeakMap();

/**
 * Browsers whose session DataDome has refused an exposé for.
 *
 * Keyed on the browser for the same reason the warm pages are: it is exactly the lifetime of one
 * job run, so the next run starts unflagged without anything having to reset it.
 *
 * @type {WeakSet<object>}
 */
const blockedBrowsers = new WeakSet();

/**
 * Open (or reuse) a page that has an established immowelt session.
 *
 * The warm-up waits for the `datadome` cookie to actually exist instead of sleeping for a guessed
 * interval: the cookie is what the later XHRs need, and a fixed sleep either wastes seconds or
 * fires the first request half-warmed. Not getting the cookie is not treated as fatal - not every
 * visitor is challenged - so the caller still gets a page to try with.
 *
 * @param {any} browser the shared browser of the current job run
 * @returns {Promise<any>} a page on `IMMOWELT_ORIGIN`
 */
async function acquireWarmPage(browser) {
  const existing = warmPages.get(browser);
  if (existing != null) {
    try {
      const page = await existing;
      if (!page.isClosed()) return page;
    } catch {
      // fall through and warm a new one
    }
    warmPages.delete(browser);
  }

  const pending = (async () => {
    const page = await browser.newPage();
    try {
      await page.goto(`${IMMOWELT_ORIGIN}/`, {
        waitUntil: 'domcontentloaded',
        timeout: WARMUP_NAVIGATION_TIMEOUT,
      });
      await page
        .waitForFunction(() => /(^|;\s*)datadome=/.test(document.cookie), { timeout: DATADOME_COOKIE_TIMEOUT })
        .catch(() => logger.debug('Immowelt did not hand out a datadome cookie; continuing without it.'));
      return page;
    } catch (error) {
      await page.close().catch(() => {});
      throw error;
    }
  })();

  warmPages.set(browser, pending);

  try {
    return await pending;
  } catch (error) {
    warmPages.delete(browser);
    throw error;
  }
}

/**
 * Close the warmed page of a browser, if there is one.
 *
 * Not needed for the job runs themselves - `closeBrowser` takes the page down with the browser -
 * but tests and the fixture downloader reuse one browser across several calls and want to let go
 * of the page explicitly.
 *
 * @param {any} browser the browser whose session should be dropped
 * @returns {Promise<void>}
 */
export async function releaseSession(browser) {
  const pending = warmPages.get(browser);
  if (pending == null) return;
  warmPages.delete(browser);
  try {
    const page = await pending;
    if (!page.isClosed()) await page.close();
  } catch {
    // nothing to release
  }
}

/**
 * Report a blocked request the same way the puppeteer extractor does, so the bot-detection POI
 * stays comparable no matter which path a provider takes.
 *
 * @param {number} status the http status the BFF answered with
 * @param {string} step which call was blocked, for the log line
 * @param {string} body the first part of the response body
 * @returns {Promise<void>}
 */
async function reportFailure(status, step, body) {
  if (status === 403 || status === 429) {
    logger.warn(`We have been detected as a bot :-/ Immowelt ${step} answered ${status}.`);
    await trackPoi(`${TRACKING_POIS.DETECTED_AS_BOT}_immowelt`);
    return;
  }
  // The BFF validates the criteria with typia and names both the offending path and the values it
  // would have accepted. That message is the only thing that turns "0 listings" into something a
  // user can act on, so it is logged in full rather than swallowed.
  logger.error(`Immowelt ${step} answered ${status}: ${body}`);
}

/**
 * Draw the boundary of every commute area of a search.
 *
 * A commute area ("15 minutes' walk of Schwanseestraße") is the one search area immowelt's url
 * does not spell out. Its own page resolves it in two steps before every search, and this is the
 * same two: the place's coordinates from `/search-mfe-bff/places/data`, then the reachable area
 * from `/search-mfe-bff/routing/isochrone`, which answers with the polygons that get encoded into
 * `location.polylines`. Both are same-origin calls on the warmed session, like every other request
 * here - the routing service is behind the same DataDome wall as the rest of the origin.
 *
 * A commute that cannot be resolved ends the run rather than searching without it: dropping the
 * boundary leaves the bare place id, which is the street instead of the quarter around it, and the
 * job would quietly report a different set of flats than the saved search describes.
 *
 * @param {any} browser the shared browser of the current job run
 * @param {import('./immowelt-search-model.js').CommuteArea[]} commutes the areas to draw
 * @returns {Promise<string[]>} one encoded polyline per reachable area
 * @throws {Error} when immowelt does not answer with a boundary for one of them
 */
async function resolveCommuteAreas(browser, commutes) {
  const page = await acquireWarmPage(browser);

  const result = await page.evaluate(
    async (targets, timeout) => {
      const withTimeout = (promise) =>
        Promise.race([
          promise,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('immowelt routing request timed out')), timeout),
          ),
        ]);

      const read = async (step, url) => {
        const response = await withTimeout(fetch(url));
        const body = await response.text();
        if (response.status !== 200) {
          return { error: { step, status: response.status, body: body.slice(0, 400) } };
        }
        try {
          return { data: JSON.parse(body) };
        } catch {
          return { error: { step, status: response.status, body: body.slice(0, 400) } };
        }
      };

      try {
        const isochrones = [];

        for (const commute of targets) {
          const place = await read(
            `place lookup for '${commute.placeId}'`,
            `/search-mfe-bff/places/data?placesIds%5B%5D=${encodeURIComponent(commute.placeId)}&parentTypes%5B%5D=AD08`,
          );
          if (place.error != null) return { error: place.error };

          const coordinates = place.data?.places?.[0]?.coordinates;
          if (!Number.isFinite(coordinates?.lat) || !Number.isFinite(coordinates?.lng)) {
            return {
              error: {
                step: `place lookup for '${commute.placeId}'`,
                status: 200,
                body: 'the place has no coordinates to travel from',
              },
            };
          }

          const area = await read(
            `routing around '${commute.placeId}'`,
            `/search-mfe-bff/routing/isochrone?id=${encodeURIComponent(commute.placeId)}&lat=${coordinates.lat}` +
              `&lng=${coordinates.lng}&commuteMode=${encodeURIComponent(commute.mode)}` +
              `&commuteDuration=${encodeURIComponent(commute.duration)}`,
          );
          if (area.error != null) return { error: area.error };

          isochrones.push(area.data?.isochrone ?? []);
        }

        return { isochrones };
      } catch (error) {
        return { error: { step: 'routing request', status: 0, body: String(error?.message || error) } };
      }
    },
    commutes,
    REQUEST_TIMEOUT,
  );

  if (result.error != null) {
    // 403 and 429 are the bot wall rather than a broken url, and they count towards the same POI
    // every other refused immowelt request does.
    await reportFailure(result.error.status, result.error.step, result.error.body);
    throw new Error(
      `Immowelt could not tell Fredy which area this job's commute time covers (${result.error.step} answered ` +
        `${result.error.status}). Searching without it would cover the address instead of everything around it, ` +
        `so the job stops instead.`,
    );
  }

  const polylines = result.isochrones.flatMap((isochrone) => isochroneToPolylines(isochrone));

  if (polylines.length === 0) {
    throw new Error(
      `Immowelt's routing service answered with no reachable area for this job's commute time, so there is ` +
        `nothing to search in.`,
    );
  }

  return polylines;
}

/**
 * Finish a translated search url into the body the BFF is posted.
 *
 * Everything but the commute areas is already in `criteria`; those are replaced here by the
 * polylines they turned out to describe. The BFF unions the polylines of a search, so a resolved
 * commute joins the areas already in the criteria rather than replacing them - which is what
 * immowelt's own page does with the several islands a transit area consists of.
 *
 * @param {any} browser the shared browser of the current job run
 * @param {{criteria: object, paging: object, commutes?: import('./immowelt-search-model.js').CommuteArea[]}} request
 *   the translated search url
 * @returns {Promise<{criteria: object, paging: object}>} the body to post
 * @throws {Error} when a commute area cannot be resolved into a boundary
 */
export async function resolveSearchAreas(browser, { criteria, paging, commutes = [] }) {
  if (commutes.length === 0) return { criteria, paging };

  const polylines = await resolveCommuteAreas(browser, commutes);

  return {
    criteria: {
      ...criteria,
      location: { ...criteria.location, polylines: [...(criteria.location?.polylines ?? []), ...polylines] },
    },
    paging,
  };
}

/**
 * Run the search and resolve the resulting ids into full card payloads.
 *
 * A batch that fails does not sink the ones that succeeded. Anything missed stays unstored, so it
 * simply counts as new on the next run - reporting half a result page beats reporting none.
 *
 * @param {any} browser the shared browser of the current job run
 * @param {{criteria: object, paging: object, commutes?: import('./immowelt-search-model.js').CommuteArea[]}} request
 *   the body for `/serp-bff/search`, as `convertSearchUrlToRequest` built it
 * @returns {Promise<any[]>} the raw classifieds, or an empty array when the search was refused
 * @throws {Error} when a commute area of the search cannot be resolved into a boundary
 */
export async function searchClassifieds(browser, request) {
  const payload = await resolveSearchAreas(browser, request);
  const page = await acquireWarmPage(browser);

  const result = await page.evaluate(
    async (payload, timeout, batchSize) => {
      const withTimeout = (promise) =>
        Promise.race([
          promise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('immowelt bff request timed out')), timeout)),
        ]);

      try {
        const searchResponse = await withTimeout(
          fetch('/serp-bff/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify(payload),
          }),
        );
        const searchBody = await searchResponse.text();
        if (searchResponse.status !== 200) {
          return { error: { step: 'search', status: searchResponse.status, body: searchBody.slice(0, 800) } };
        }

        const ids = (JSON.parse(searchBody).classifieds || []).map((entry) => entry?.id).filter(Boolean);
        if (ids.length === 0) return { classifieds: [] };

        const classifieds = [];
        let failure = null;

        for (let offset = 0; offset < ids.length; offset += batchSize) {
          const batch = ids.slice(offset, offset + batchSize);
          const listResponse = await withTimeout(
            fetch(`/classifiedList/${batch.join(',')}`, { headers: { 'x-language': 'de' } }),
          );
          const listBody = await listResponse.text();
          if (listResponse.status !== 200) {
            failure ??= { step: 'classifiedList', status: listResponse.status, body: listBody.slice(0, 800) };
            break;
          }
          classifieds.push(...JSON.parse(listBody));
        }

        return { classifieds, error: failure };
      } catch (error) {
        return { error: { step: 'request', status: 0, body: String(error?.message || error) } };
      }
    },
    payload,
    REQUEST_TIMEOUT,
    CLASSIFIED_LIST_BATCH_SIZE,
  );

  const classifieds = Array.isArray(result.classifieds) ? result.classifieds : [];

  if (result.error != null) {
    await reportFailure(result.error.status, result.error.step, result.error.body);
    if (classifieds.length > 0) {
      logger.warn(`Immowelt returned ${classifieds.length} listing(s) before the request was refused; keeping those.`);
    }
  }

  return classifieds;
}

/**
 * Load an exposé page as markup, without navigating to it.
 *
 * The exposé carries the untruncated description, which the card payload only has the first 500
 * characters of. Fetching it as a subresource of the already-open session rather than navigating
 * there keeps the enrichment to one XHR per listing instead of one full page load with its ~1.5 MB
 * of assets and its own DataDome challenge.
 *
 * Once DataDome refuses one exposé it refuses the rest of them too, and every further attempt is
 * another strike against an address that is already flagged. The first refusal therefore ends the
 * enrichment for this run: the session is dropped and the remaining listings are stored with the
 * card's truncated description, which is what they would have got anyway.
 *
 * @param {any} browser the shared browser of the current job run
 * @param {string} url absolute url of the exposé
 * @returns {Promise<string|null>} the markup, or null when the request was refused
 */
export async function fetchExposeHtml(browser, url) {
  if (blockedBrowsers.has(browser)) return null;

  const page = await acquireWarmPage(browser);

  const result = await page.evaluate(
    async (target, timeout) => {
      try {
        const response = await Promise.race([
          fetch(target, { headers: { Accept: 'text/html' } }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('immowelt expose request timed out')), timeout)),
        ]);
        const body = await response.text();
        if (response.status !== 200) {
          return { error: { status: response.status, body: body.slice(0, 400) } };
        }
        return { html: body };
      } catch (error) {
        return { error: { status: 0, body: String(error?.message || error) } };
      }
    },
    url,
    REQUEST_TIMEOUT,
  );

  if (result.error != null) {
    await reportFailure(result.error.status, `exposé ${url}`, result.error.body);
    if (result.error.status === 403 || result.error.status === 429) {
      blockedBrowsers.add(browser);
      await releaseSession(browser);
      logger.warn('Skipping the remaining immowelt exposés of this run; the session has been refused.');
    }
    return null;
  }

  return result.html;
}
