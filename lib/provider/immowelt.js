/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Immowelt provider, reading listings from the same JSON API the website's own result page uses.
 *
 * Immowelt's result page stopped rendering listings server side: it is a micro-frontend that posts
 * the search to `/serp-bff/search` and asks `/classifiedList/{ids}` for the cards. Scraping the
 * rendered markup meant depending on `data-testid` attributes and hashed CSS classes that change
 * with every deploy, and it meant one full page navigation per listing to reach the description -
 * navigations that DataDome scores far harder than XHRs, and that were the bulk of Fredy's request
 * volume against immowelt.
 *
 * Reading the API instead needs exactly one navigation per job run (the warm-up that earns the
 * DataDome cookie, see `immoweltBff.js`), and hands back numbers instead of strings that have to be
 * parsed back out of German-formatted markup.
 *
 * Hashes changed with this switch. The old listing id was built from the card's `href`, which
 * carried the job's own search string as a query parameter; the id is now the classified id
 * immowelt itself uses. Listings already stored under the old scheme therefore count as new once,
 * which costs every immowelt job a single duplicate notification round on the first run after the
 * upgrade and nothing afterwards.
 */

import { IMMOWELT_HOSTS, siteOf } from '../services/immowelt/site.js';
import { extractExposeDescription } from '../services/immowelt/classified.js';
import { buildClassifiedProvider } from '../services/immowelt/platformProvider.js';

// Reading the card and the exposé is shared with SeLoger, which runs on the same platform - see
// `services/immowelt/classified.js`. Re-exported here because that is where it has always been.
export { extractExposeDescription };

// The whole config is the platform's, over immowelt's two sites - see
// `services/immowelt/platformProvider.js`. Which of them a search runs against is read off the
// job's own url on every run.
const { config, createConfig } = buildClassifiedProvider('immowelt');

/**
 * The country one listing is in, which is not the two the provider serves.
 *
 * `countries` has to name both - it is what the job form flags the provider with and what the map
 * takes its bounds from, and neither has a listing to ask. Everything that does hold a listing
 * wants one country: a geocoder searching `de,at` answers a Tyrolean street with its Bavarian
 * namesake, and the connectivity sweep would read an Austrian address against the German register.
 *
 * The link is what says which site an advert is on, and it is the one thing every stored row keeps -
 * the search url that found it belongs to the job, not to the listing, and a job's url can be
 * changed to the other country after the fact. A row whose link is missing or points somewhere else
 * answers null, and the caller keeps both.
 *
 * @param {{link?: string|null}|null|undefined} listing
 * @returns {string|null} `de`, `at`, or null when the link names no immowelt site.
 */
function countryOf(listing) {
  const site = siteOf(listing?.link);
  return site?.provider === 'immowelt' ? site.country : null;
}

export const metaInformation = {
  countries: ['de', 'at'],
  countryOf,
  // immowelt.at is the same application under a second domain - see `services/immowelt/site.js` -
  // so a job url may name either, and the form has to accept both rather than just `baseUrl`'s host.
  hosts: IMMOWELT_HOSTS,
  name: 'Immowelt',
  baseUrl: 'https://www.immowelt.de/',
  id: 'immowelt',
};
export { config, createConfig };
