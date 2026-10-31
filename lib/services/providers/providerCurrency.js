/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { getProviders } from '../../utils.js';
import { currencyForListing } from './currency.js';

/**
 * @typedef {{resolve: (listing: Object) => string, euroSql: string}} CurrencyContext
 */

/**
 * Resolve metadata once for a request or job run. No provider-specific map or mutable registry.
 * @param {Object[]} providers Loaded provider modules.
 * @returns {CurrencyContext}
 */
export function currencyContextForProviders(providers) {
  const metadata = new Map(providers.map((p) => [p.metaInformation.id, p.metaInformation]));
  const quote = (value) => `'${value.replaceAll("'", "''")}'`;
  const conditions = [...metadata.values()].flatMap((meta) => {
    if (typeof meta.currencyOf === 'function') {
      const hosts = meta.hosts ?? (meta.baseUrl ? [new URL(meta.baseUrl).hostname.replace(/^www\./, '')] : []);
      const euroLinks = hosts
        .filter((host) => currencyForListing(meta, { link: `https://${host}/` }) === 'EUR')
        .flatMap((host) => [
          `l.link LIKE ${quote(`https://${host}/%`)}`,
          `l.link LIKE ${quote(`https://www.${host}/%`)}`,
        ]);
      return [`(l.provider != ${quote(meta.id)}${euroLinks.length ? ` OR ${euroLinks.join(' OR ')}` : ''})`];
    }
    return currencyForListing(meta) === 'EUR' ? [] : [`l.provider != ${quote(meta.id)}`];
  });
  return {
    resolve: (listing) => currencyForListing(metadata.get(listing?.provider), listing),
    euroSql: conditions.length ? conditions.join(' AND ') : '1 = 1',
  };
}

/** @returns {Promise<ReturnType<typeof currencyContextForProviders>>} */
export async function getCurrencyContext() {
  return currencyContextForProviders(await getProviders());
}

/** @returns {Promise<(listing: Object) => string>} */
export async function listingCurrencyResolver() {
  return (await getCurrencyContext()).resolve;
}

/** @param {string} providerId @param {Object|null} listing @returns {Promise<string>} */
export async function getCurrencyForListing(providerId, listing) {
  const meta = (await getProviders()).find((p) => p.metaInformation.id === providerId)?.metaInformation;
  return currencyForListing(meta, listing);
}
