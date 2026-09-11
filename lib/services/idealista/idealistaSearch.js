/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
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
    if (response?.status?.() === 429) {
      logger.warn('Idealista rate limited this search. The run stops here.');
      return null;
    }

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
