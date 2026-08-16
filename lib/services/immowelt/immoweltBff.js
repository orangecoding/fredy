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
 */

import logger from '../logger.js';
import { trackPoi } from '../tracking/Tracker.js';
import { TRACKING_POIS } from '../../TRACKING_POIS.js';

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
 * Run the search and resolve the resulting ids into full card payloads.
 *
 * A batch that fails does not sink the ones that succeeded. Anything missed stays unstored, so it
 * simply counts as new on the next run - reporting half a result page beats reporting none.
 *
 * @param {any} browser the shared browser of the current job run
 * @param {{criteria: object, paging: object}} request the body for `/serp-bff/search`
 * @returns {Promise<any[]>} the raw classifieds, or an empty array when the search was refused
 */
export async function searchClassifieds(browser, request) {
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
    request,
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
 * @param {any} browser the shared browser of the current job run
 * @param {string} url absolute url of the exposé
 * @returns {Promise<string|null>} the markup, or null when the request was refused
 */
export async function fetchExposeHtml(browser, url) {
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
    return null;
  }

  return result.html;
}
