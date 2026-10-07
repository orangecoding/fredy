/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Transport for leboncoin's `finder/search` endpoint.
 *
 * leboncoin sits behind DataDome, and the wall is at its tightest exactly where a scraper would
 * start: a search page navigated to directly is answered 403 with a captcha, even from a browser
 * that has just loaded the home page without trouble. The endpoint the search page reads its
 * adverts from is a different matter. Asked from inside a page on www.leboncoin.fr - the way the
 * site's own JavaScript asks it, with the web app's public api key - it answers like it answers the
 * site. Asked from node it does not: DataDome fingerprints the TLS handshake, which node cannot
 * forge, and answers 403 whatever the headers say.
 *
 * So a run costs one navigation - to the home page, the least scrutinised page there is - and one
 * `fetch` issued by that page per search. That is the same shape as the immowelt transport, for
 * the same reason, and the page is opened and warmed by the same code (`extractor/warmPages.js`).
 * It is what the measurements behind this module (September 2026) found to work where every
 * navigation to a result page ended at a captcha.
 *
 * Endpoint used:
 * - `POST https://api.leboncoin.fr/finder/search` - takes the body `search-model.js` builds and
 *   answers `{total, ads: [...]}`, every advert complete with its description, attributes,
 *   location and photos.
 */

import logger from '../logger.js';
import { trackPoi } from '../tracking/Tracker.js';
import { TRACKING_POIS } from '../../TRACKING_POIS.js';
import { acquireWarmPage, releaseWarmPage } from '../extractor/warmPages.js';
import { LEBONCOIN_ORIGIN } from './search-model.js';

/** The endpoint the search page posts its searches to. */
const FINDER_URL = 'https://api.leboncoin.fr/finder/search';

/**
 * The key leboncoin's web application sends with every request to its api. It is public - it ships
 * in the site's JavaScript to every visitor - and identifies the web client, not a user.
 */
const WEB_API_KEY = 'ba0c2dad52b3ec';

/** How long one search may take. */
const REQUEST_TIMEOUT = 45_000;

/**
 * Close the warmed page of a browser, if it has one.
 *
 * A run lets go of its page as soon as its search is done, so this is for the callers that warm one
 * by hand - tests and the fixture downloader.
 *
 * @param {any} browser
 * @returns {Promise<void>}
 */
export async function releaseSession(browser) {
  await releaseWarmPage(browser, LEBONCOIN_ORIGIN);
}

/**
 * Log a refused search, and count it towards the bot-detection POI when it was the bot wall.
 *
 * @param {number} status
 * @param {string} body the first part of the response body
 * @returns {Promise<void>}
 */
async function reportFailure(status, body) {
  if (status === 403 || status === 429) {
    logger.warn(`We have been detected as a bot :-/ leboncoin's finder answered ${status}.`);
    await trackPoi(`${TRACKING_POIS.DETECTED_AS_BOT}_leboncoin`);
    return;
  }
  // A body the endpoint cannot read is answered with a message naming what it choked on, which is
  // the only thing that turns "0 listings" into something a user can act on.
  logger.error(`leboncoin's finder answered ${status}: ${body}`);
}

/**
 * Run one search.
 *
 * A refusal is logged and answered with no adverts rather than thrown: the bot wall comes and goes,
 * and a run that finds nothing simply finds the same adverts next time.
 *
 * The page is closed once the search is done, answered or refused. A run asks the finder exactly
 * once - the answer carries everything, so there is no detail request to keep it for - and left
 * open it went on running the home page's ad and tracking scripts inside the job's browser, next to
 * every provider that ran after it.
 *
 * @param {any} browser the shared browser of the current job run
 * @param {import('./search-model.js').LeboncoinSearchBody} body what `convertSearchUrlToBody` built
 * @returns {Promise<any[]>} the raw adverts, newest first
 */
export async function searchAds(browser, body) {
  try {
    return await search(browser, body);
  } finally {
    await releaseSession(browser);
  }
}

/**
 * The body of {@link searchAds}, which owns the page's lifetime around it.
 *
 * @param {any} browser
 * @param {import('./search-model.js').LeboncoinSearchBody} body
 * @returns {Promise<any[]>}
 */
async function search(browser, body) {
  const page = await acquireWarmPage(browser, LEBONCOIN_ORIGIN, { label: 'leboncoin' });

  const result = await page.evaluate(
    async (url, apiKey, payload, timeout) => {
      try {
        const response = await Promise.race([
          fetch(url, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', api_key: apiKey },
            body: JSON.stringify(payload),
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('leboncoin search timed out')), timeout)),
        ]);
        const text = await response.text();
        if (response.status !== 200) return { error: { status: response.status, body: text.slice(0, 800) } };
        return { ads: JSON.parse(text).ads ?? [] };
      } catch (error) {
        return { error: { status: 0, body: String(error?.message || error) } };
      }
    },
    FINDER_URL,
    WEB_API_KEY,
    body,
    REQUEST_TIMEOUT,
  );

  if (result.error != null) {
    await reportFailure(result.error.status, result.error.body);
    return [];
  }
  return Array.isArray(result.ads) ? result.ads : [];
}
