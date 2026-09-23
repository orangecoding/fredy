/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * ImmoScout Germany.
 *
 * Everything that talks to the portal lives in `lib/services/immoscout/mobileApi.js`, which is
 * shared with the Austrian site: both are answered by one mobile API off one index, so the only
 * thing a national site contributes is its identity and a reader for its own URL scheme. See that
 * file's header for the API itself.
 */

import { buildImmoscoutProvider } from '../services/immoscout/mobileApi.js';
import { convertWebToMobile } from '../services/immoscout/immoscout-web-translator.js';

const { metaInformation, config, createConfig } = buildImmoscoutProvider({
  id: 'immoscout',
  name: 'Immoscout',
  baseUrl: 'https://www.immobilienscout24.de/',
  countries: ['de'],
  toMobileSearchUrl: convertWebToMobile,
});

export { metaInformation, config, createConfig };
