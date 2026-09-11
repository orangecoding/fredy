/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Runs a casa.it search through the api the app talks to.
 *
 * The api sorts by the date an advert was published, which the rendered page does not offer, so the
 * newest advert is the first one on the first page and a run reads the few pages that can hold
 * everything published since the run before it.
 */

import { PAGE_SIZE, search } from './search-api.js';
import { translateSearchUrl } from './web-translator.js';
import logger from '../logger.js';

/**
 * How many pages of a date-ordered search one run reads. The first page holds the fifty newest
 * adverts; the rest is the margin for a job that was stopped for a while.
 */
const MAX_PAGES = 4;

/** Newest first. The api reads this as `inserted|desc`, and answers an unknown token in its own order. */
const SORT = ['date-desc'];

/**
 * Read the adverts of a search.
 *
 * @param {string} webUrl The job's search url, as it was copied off the website.
 * @returns {Promise<any[]|null>} the adverts, newest first, or null when the url names a search the
 *   api cannot be asked for and the website has to be read instead
 */
export async function searchListings(webUrl) {
  const translated = await translateSearchUrl(webUrl);
  if (translated == null) return null;

  const adverts = [];
  const seen = new Set();

  for (let page = 1; page <= MAX_PAGES; page++) {
    const answer = await search({ ...translated, sort: SORT, page });
    // A refusal on the first page is a search the api would not take, and the website still holds
    // it; later on it is the end of what this run can read.
    if (answer == null) return page === 1 ? null : adverts;

    for (const advert of answer.results) {
      if (advert?.listing_id == null || seen.has(advert.listing_id)) continue;
      seen.add(advert.listing_id);
      adverts.push(advert);
    }

    if (answer.results.length < PAGE_SIZE || adverts.length >= answer.total) break;
    if (page === MAX_PAGES && answer.total > adverts.length) {
      logger.debug(`Casa.it: read ${adverts.length} of ${answer.total} adverts, newest first.`);
    }
  }

  return adverts;
}
