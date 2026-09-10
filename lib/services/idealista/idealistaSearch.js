/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Transport for idealista's search pages, through the run's own browser.
 *
 * This is one of the two ways `./website.js` reads a result page, and the one taken when no
 * challenge-solving scrape service is configured: `FREDY_CHALLENGE_SOLVER_URL` buys a session
 * cookie that turns every page into a plain request, and without it there is still the browser the
 * job already has.
 *
 * idealista serves its results as server-rendered markup, so unlike immowelt there is no JSON
 * endpoint worth reaching for - the page itself is the payload. What it does share with immowelt is
 * the wall in front of it: the whole origin sits behind DataDome, and a plain `fetch` from node is
 * answered with 403 and a "Please enable JS" stub no matter which headers it carries.
 *
 * The stub is not a dead end though. It is DataDome's *interstitial* (`dd.rt === 'i'`), a JavaScript
 * challenge that solves itself in a real browser and then reloads the page that was asked for. So
 * the whole transport is: navigate once, let the challenge run, read the document that replaces it.
 * Measured against idealista.com, .it and .pt, the challenge clears in four to six seconds - from
 * an address DataDome has no quarrel with, which a datacenter's rarely is.
 *
 * This cannot go through {@link module:lib/services/extractor/puppeteerExtractor} the way the other
 * scraping providers do, because that extractor reads the status of the *first* response and treats
 * 403 as bot detection. Here the 403 is the normal case and says nothing about whether the run will
 * succeed - only the document that follows it does.
 *
 * What the challenge escalates to when DataDome is unconvinced is a captcha (`dd.rt === 'c'`), and
 * that one never solves itself - a datacenter IP gets it on the first request. There is nothing to
 * do about it here: the wait runs out, the run reports no listings, and the remedy is the same
 * residential proxy the other bot-walled providers need.
 */

import logger from '../logger.js';
import { trackPoi } from '../tracking/Tracker.js';
import { TRACKING_POIS } from '../../TRACKING_POIS.js';

/** How long the navigation to the search page may take. */
const NAVIGATION_TIMEOUT = 60_000;

/**
 * How long DataDome's challenge may run before the page is given up on.
 *
 * Generous on purpose: the cost of waiting too long is one slow provider in a job run, the cost of
 * waiting too short is a run that reports no listings at all.
 */
const CHALLENGE_TIMEOUT = 45_000;

/**
 * The element that says the real page has arrived.
 *
 * `main#main-content` wraps the result list on every one of the three domains and is equally present on a
 * search that matched nothing, which is what makes it the right marker: waiting for a listing card
 * instead would turn "no results today" into a timeout. DataDome's interstitial is a bare `<body>`
 * holding a script and a one-line message, so it can never satisfy this.
 */
const RESULTS_CONTAINER = 'main#main-content';

/**
 * Fetch one idealista search page, waiting out DataDome if it steps in front of it.
 *
 * @param {string} url the url of one result page
 * @param {any} browser the shared browser of the current job run
 * @returns {Promise<string|null>} the page source, or null when it never got past the challenge
 */
export async function fetchSearchHtml(url, browser) {
  const page = await browser.newPage();

  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT });

    try {
      await page.waitForFunction(
        (selector) => document.querySelector(selector) != null,
        { timeout: CHALLENGE_TIMEOUT, polling: 500 },
        RESULTS_CONTAINER,
      );
    } catch {
      // Only now is the status worth reading. A 403 that resolved into a result page is DataDome
      // doing its normal thing; a 403 still standing when the wait ran out is the run being refused.
      const status = response?.status?.() ?? 0;
      logger.warn(
        `idealista did not serve a result page for ${url} (status ${status}). ` +
          'If this keeps happening, the run is being challenged with a captcha and needs a proxy.',
      );
      await trackPoi(`${TRACKING_POIS.DETECTED_AS_BOT}_idealista`);
      return null;
    }

    return await page.content();
  } catch (error) {
    logger.error(`Error loading the idealista search page ${url}:`, error?.message || error);
    return null;
  } finally {
    await page.close().catch(() => {});
  }
}
