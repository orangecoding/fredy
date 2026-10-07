/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Pages that have been through a site's front door once, for the providers that talk to a site's
 * own JSON endpoints from inside the browser.
 *
 * immowelt, SeLoger and leboncoin all sit behind DataDome, which fingerprints the TLS handshake node
 * cannot forge and answers any request from node with 403. A same-origin `fetch` issued by a page
 * that has loaded the site's home page - the cheapest, least scrutinised navigation there is - is
 * answered like the site's own, so that is how their transports make every request. Opening and
 * warming such a page is the same few steps for all of them, and keeping those steps in one place
 * is what keeps the transports from drifting apart on them.
 *
 * Pages are kept per browser rather than in module scope on purpose: two jobs can run at once (a
 * manual run started while the scheduler works through the others), each with its own browser, and
 * a single shared page would let the second job's requests run in the first job's session. A
 * WeakMap keyed on the run's own browser is scoped exactly like the browser is and disappears with
 * it. Within a browser they are kept per origin, because a page's session belongs to the site it
 * was opened on: the DataDome cookie is per origin, and a request from a page on another origin is
 * a cross-origin one the browser refuses.
 */

import logger from '../logger.js';

/** How long the warm-up navigation may take. */
const WARMUP_NAVIGATION_TIMEOUT = 60_000;

/** How long to wait for DataDome to hand out its cookie before trying anyway. */
const DATADOME_COOKIE_TIMEOUT = 15_000;

/** @type {WeakMap<object, Map<string, Promise<any>>>} */
const warmPages = new WeakMap();

/**
 * Open (or reuse) a page on an origin that has an established session.
 *
 * The warm-up waits for the `datadome` cookie to actually exist instead of sleeping for a guessed
 * interval: the cookie is what the later requests need, and a fixed sleep either wastes seconds or
 * fires the first request half-warmed. Not getting the cookie is not treated as fatal - not every
 * visitor is challenged - so the caller still gets a page to try with. A warm-up that fails is not
 * remembered, so the next call tries again.
 *
 * @param {any} browser the shared browser of the current job run
 * @param {string} origin the site to open the page on, e.g. `https://www.seloger.com`
 * @param {{label?: string}} [options] what the log line calls the site
 * @returns {Promise<any>} a page on that origin
 */
export async function acquireWarmPage(browser, origin, { label = origin } = {}) {
  const pages = warmPages.get(browser) ?? new Map();
  warmPages.set(browser, pages);

  const existing = pages.get(origin);
  if (existing != null) {
    try {
      const page = await existing;
      if (!page.isClosed()) return page;
    } catch {
      // fall through and warm a new one
    }
    pages.delete(origin);
  }

  const pending = (async () => {
    const page = await browser.newPage();
    try {
      await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded', timeout: WARMUP_NAVIGATION_TIMEOUT });
      await page
        .waitForFunction(() => /(^|;\s*)datadome=/.test(document.cookie), { timeout: DATADOME_COOKIE_TIMEOUT })
        .catch(() => logger.debug(`${label} did not hand out a datadome cookie; continuing without it.`));
      return page;
    } catch (error) {
      await page.close().catch(() => {});
      throw error;
    }
  })();

  pages.set(origin, pending);

  try {
    return await pending;
  } catch (error) {
    if (pages.get(origin) === pending) pages.delete(origin);
    throw error;
  }
}

/**
 * Close the warmed page of one origin, if the browser has one.
 *
 * @param {any} browser the browser holding the page
 * @param {string} origin the site whose page should be dropped
 * @returns {Promise<void>}
 */
export async function releaseWarmPage(browser, origin) {
  const pages = warmPages.get(browser);
  const pending = pages?.get(origin);
  if (pending == null) return;
  pages.delete(origin);
  if (pages.size === 0) warmPages.delete(browser);

  try {
    const page = await pending;
    if (!page.isClosed()) await page.close();
  } catch {
    // nothing to release
  }
}
