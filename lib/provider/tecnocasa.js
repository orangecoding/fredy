/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Tecnocasa, the largest estate agency network in Italy.
 *
 * The site is the group's shared platform, which `lib/services/tecnocasa/network.js` reads. Only
 * the brand and the base url are its own.
 */

import { applyBlacklist, createNetworkConfig } from '../services/tecnocasa/network.js';
/** @import { ProviderConfig } from '../types/providerConfig.js' */

const BASE_URL = 'https://www.tecnocasa.it/';

/** @type {ProviderConfig} */
const config = createNetworkConfig('Tecnocasa');

export const metaInformation = {
  countries: ['it'],
  name: 'Tecnocasa',
  baseUrl: BASE_URL,
  id: 'tecnocasa',
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
