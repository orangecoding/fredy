/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/** The fallback for a provider without a currency declaration. */
export const DEFAULT_CURRENCY = 'EUR';

/**
 * Resolve a provider's declaration, optionally narrowed for one listing.
 * @param {{currency?: string, currencyOf?: (listing: Object) => string}|null} meta
 * @param {Object} [listing]
 * @returns {string} ISO 4217 code; EUR when absent or malformed.
 */
export function currencyForListing(meta, listing) {
  const declared =
    typeof meta?.currency === 'string' && /^[A-Z]{3}$/.test(meta.currency) ? meta.currency : DEFAULT_CURRENCY;
  if (listing != null && typeof meta?.currencyOf === 'function') {
    try {
      const currency = meta.currencyOf(listing);
      if (typeof currency === 'string' && /^[A-Z]{3}$/.test(currency)) return currency;
    } catch {
      // A provider must not prevent the rest of a batch from being read.
    }
  }
  return declared;
}

/**
 * A job price ceiling has one unit, so all enabled sources must share it.
 * @param {Object[]} providers Job sources.
 * @param {Map<string, Object>} metadata Metadata by provider id.
 * @param {Object|null} specFilter Job constraints.
 * @returns {string|null}
 */
export function jobCurrencyProblem(providers, metadata, specFilter) {
  if (specFilter?.maxPrice == null || !Array.isArray(providers)) return null;
  const currencies = new Set(
    providers.filter((p) => p.enabled !== false).map((p) => currencyForListing(metadata.get(p.id), { link: p.url })),
  );
  return currencies.size > 1 ? 'A maximum price requires providers with the same currency.' : null;
}
