/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { normalizeHost } from '../jobs/providerUrl.js';

/** The fallback for a provider without a currency declaration. */
export const DEFAULT_CURRENCY = 'EUR';

/**
 * The one currency the finance module models. Its rates and purchase costs are German, so a listing
 * priced in anything else gets no calculation and no affordability verdict.
 */
export const FINANCE_CURRENCY = 'EUR';

/**
 * @param {unknown} value
 * @returns {boolean} Whether this is shaped like an ISO 4217 code.
 */
const isCurrencyCode = (value) => typeof value === 'string' && /^[A-Z]{3}$/.test(value);

/**
 * Which currency a link on this provider is priced in.
 *
 * Declared data and the link's host, nothing else: a job's search url, a listing's advert link and
 * the job form's lookup of the same `currencyByHost` all have to reach the same answer.
 *
 * @param {{currency?: string, currencyByHost?: Record<string, string>}|null|undefined} meta
 * @param {string|null} [link] A listing's link or a job's search url.
 * @returns {string} ISO 4217 code; EUR when absent or malformed.
 */
export function currencyForLink(meta, link) {
  const byHost = meta?.currencyByHost?.[normalizeHost(link)];
  if (isCurrencyCode(byHost)) return byHost;
  return isCurrencyCode(meta?.currency) ? meta.currency : DEFAULT_CURRENCY;
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
    providers.filter((p) => p.enabled !== false).map((p) => currencyForLink(metadata.get(p.id), p.url)),
  );
  return currencies.size > 1 ? 'A maximum price requires providers with the same currency.' : null;
}
