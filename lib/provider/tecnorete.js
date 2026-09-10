/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Tecnorete, the second estate agency network of the Tecnocasa group.
 *
 * The agencies and the adverts are its own - a search here and a search on tecnocasa.it return
 * different listings - but the site is the group's shared platform, which
 * `lib/services/tecnocasa/network.js` reads.
 */

import { applyBlacklist, createNetworkConfig } from '../services/tecnocasa/network.js';
/** @import { ProviderConfig } from '../types/providerConfig.js' */

const BASE_URL = 'https://www.tecnorete.it/';

/** @type {ProviderConfig} */
const config = createNetworkConfig('Tecnorete');

export const metaInformation = {
  countries: ['it'],
  name: 'Tecnorete',
  baseUrl: BASE_URL,
  id: 'tecnorete',
};

/**
 * Build a run-scoped provider configuration.
 *
 * @param {{url: string, enabled?: boolean}} sourceConfig The job's entry for this provider.
 * @param {string[]} [blacklist] Terms to filter listings out by.
 * @returns {ProviderConfig} A configuration usable by a single pipeline run.
 */
export const createConfig = (sourceConfig, blacklist = []) => ({
  ...config,
  enabled: sourceConfig.enabled,
  url: sourceConfig.url,
  filter: (listing) => applyBlacklist(listing, blacklist ?? []),
});

export { config };
