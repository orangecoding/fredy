/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The search api the casa.it android app talks to.
 *
 * `esapi.casa.it` is not the website. It serves JSON to an unauthenticated POST - no key, no token,
 * no signature, no cookie - and it is not behind the DataDome wall that answers `www.casa.it` with
 * an interstitial. `content-type` is the only header it needs.
 *
 * See `reverse-engineered-casa.md`.
 */

import logger from '../logger.js';

const SEARCH_URL = 'https://esapi.casa.it/listings/v2/search';

/** The catalogue this searches. The api serves several countries from one host. */
const SITE = 'it_casa';

/**
 * Adverts one page carries. The app asks for twenty and the website for fifty; fifty is taken,
 * because the same result set then costs less than half the requests.
 */
export const PAGE_SIZE = 50;

/**
 * Ask the api for one page of a search.
 *
 * @param {{where: any[], filters: Record<string, any>, modifiers?: Record<string, any>, sort?: string[], page?: number, size?: number}} search
 * @returns {Promise<{total: number, results: any[]}|null>} the page, or null when the api refused it
 */
export async function search({ where, filters, modifiers = {}, sort = [], page = 1, size = PAGE_SIZE }) {
  const body = {
    site: SITE,
    page,
    size,
    sort,
    query: [{ where, filters, modifiers }],
  };

  try {
    const response = await fetch(SEARCH_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      // A handled failure comes back as a 500 carrying the raw exception and the body it was sent,
      // which is the only place the reason appears. A bare 21-byte "Internal Server Error" instead
      // means a filter was sent as a list where the api wants one value, or the other way round.
      const refused = await response.text().catch(() => '');
      logger.error(`Casa.it answered ${response.status} ${response.statusText}: ${refused.slice(0, 300)}`.trimEnd());
      return null;
    }

    const payload = await response.json();
    const tier = payload?.data?.tiers?.find((entry) => entry?.tier === 'listings');
    return { total: Number(payload?.data?.total) || 0, results: Array.isArray(tier?.results) ? tier.results : [] };
  } catch (error) {
    logger.warn(`Casa.it: could not read search page ${page} (${error.message}).`);
    return null;
  }
}
