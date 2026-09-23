/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * ImmoScout Austria.
 *
 * A provider of its own rather than a second country on `immoscout`, because the two sites agree
 * on nothing a user can see: `immobilienscout24.at` is a separate web application with its own URL
 * scheme (`/regional/<bundesland>/<gemeinde>/<slug>`), its own filter vocabulary and its own
 * identifier space. What they do share is the index behind them - Austrian adverts are syndicated
 * into the German one and reachable through the same mobile API under an `/at/...` geocode - so
 * this module is a descriptor over the shared client and not a second copy of it.
 *
 * Splitting the two also keeps the country of a listing knowable. The mobile API answers with one
 * identifier space for both sites, so an Austrian advert's link looks exactly like a German one's
 * and a single provider covering `['de', 'at']` could never tell them apart for the geocoder or
 * the map. One provider per site declares one country and the question does not arise.
 *
 * Two limits of the Austrian half of the index, both enforced in `at-paths.js`:
 * - its geocodes stop at the Gemeinde, so a district URL is widened to its municipality
 * - renting and buying cannot be searched at once, so the site's plural slugs are refused with the
 *   single-deal alternatives named
 */

import { buildImmoscoutProvider } from '../services/immoscout/mobileApi.js';
import { convertAtWebToMobile } from '../services/immoscout/immoscout-web-translator.js';

const { metaInformation, config, createConfig } = buildImmoscoutProvider({
  id: 'immoscoutAt',
  name: 'Immoscout Österreich',
  baseUrl: 'https://www.immobilienscout24.at/',
  countries: ['at'],
  toMobileSearchUrl: convertAtWebToMobile,
});

export { metaInformation, config, createConfig };
