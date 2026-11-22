/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Runs a casa.it search through the api the app talks to.
 *
 * The api sorts by the date an advert was published, which the rendered page does not offer, so the
 * newest advert is the first one on the first page. A run reads that page, and the following ones
 * when its job asks for more than one.
 */

import { search } from './search-api.js';
import { translateSearchUrl } from './web-translator.js';

/** Newest first. The api reads this as `inserted|desc`, and answers an unknown token in its own order. */
const SORT = ['date-desc'];

/**
 * Read one result page of a search.
 *
 * @param {string} webUrl The job's search url, as it was copied off the website, its `page` naming
 *   the result page (see the provider's `pageUrl`; absent is the first).
 * @returns {Promise<any[]|null>} the adverts, newest first, or null when the url names a search the
 *   api cannot be asked for, or the api refused its first page, and the website has to be read
 *   instead. A later page the api refuses is the end of the search: an empty page.
 */
export async function searchListings(webUrl) {
  const translated = await translateSearchUrl(webUrl);
  if (translated == null) return null;

  const page = Math.max(1, Math.trunc(Number(new URL(webUrl).searchParams.get('page'))) || 1);
  const answer = await search({ ...translated, sort: SORT, page });
  if (answer == null) return page === 1 ? null : [];

  const adverts = [];
  const seen = new Set();
  for (const advert of answer.results) {
    if (advert?.listing_id == null || seen.has(advert.listing_id)) continue;
    seen.add(advert.listing_id);
    adverts.push(advert);
  }
  return adverts;
}
