/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it } from 'vitest';
import { currencyForLink, jobCurrencyProblem } from '../../lib/services/providers/currency.js';
import { getCurrencyForListing } from '../../lib/services/providers/providerCurrency.js';
import { formatListing, formatPriceChange } from '../../lib/utils/formatListing.js';

describe('provider currencies', () => {
  it('uses explicit currency and preserves the EUR fallback', () => {
    expect(currencyForLink({ countries: ['pl'], currency: 'PLN' })).toBe('PLN');
    expect(currencyForLink(null)).toBe('EUR');
    expect(currencyForLink({ countries: ['ch'] })).toBe('EUR');
    expect(currencyForLink({ currency: 'CHF' })).toBe('CHF');
  });

  it('lets a host override the provider, with or without its www', () => {
    const meta = { currency: 'EUR', currencyByHost: { 'example.ch': 'CHF' } };
    expect(currencyForLink(meta, 'https://example.ch/advert/1')).toBe('CHF');
    expect(currencyForLink(meta, 'https://www.example.ch/advert/1')).toBe('CHF');
    expect(currencyForLink(meta, 'https://www.example.de/advert/1')).toBe('EUR');
    expect(currencyForLink(meta, null)).toBe('EUR');
    expect(currencyForLink(meta, 'not a url')).toBe('EUR');
  });

  it('defaults malformed declarations to EUR', () => {
    for (const currency of [null, '', 'pln', 'PL', 1]) {
      expect(currencyForLink({ currency })).toBe('EUR');
      expect(currencyForLink({ currencyByHost: { 'example.ch': currency } }, 'https://example.ch/')).toBe('EUR');
    }
  });

  it('loads explicit Swiss metadata and defaults unknown providers to EUR', async () => {
    expect(await getCurrencyForListing('flatfox', {})).toBe('CHF');
    expect(await getCurrencyForListing('unknown', {})).toBe('EUR');
    expect(await getCurrencyForListing('betterhomes', { link: 'https://www.betterhomes.ch/de/immobilien/' })).toBe(
      'CHF',
    );
    expect(await getCurrencyForListing('betterhomes', { link: 'https://www.betterhomes.at/de/immobilien/' })).toBe(
      'EUR',
    );
  });

  it('formats discovery and every price-change amount in PLN', () => {
    expect(formatListing({ price: 1050000, currency: 'PLN' }, 'en').price).toBe('1.050.000 PLN');
    const result = formatPriceChange(
      {
        listing: { price: 900000, currency: 'PLN' },
        oldPrice: 1000000,
        newPrice: 900000,
        changePercent: -10,
        direction: 'down',
      },
      'en',
    );
    expect(result.price).toBe('900.000 PLN');
    expect(result.oldPrice).toBe('1.000.000 PLN');
    expect(result.newPrice).toBe('900.000 PLN');
    expect(formatListing({ price: 1000 }).price).toBe('1.000 €');
  });

  it('refuses one price ceiling across currencies, ignoring disabled sources', () => {
    const metadata = new Map([
      ['polish', { currency: 'PLN' }],
      ['german', { countries: ['de'] }],
    ]);
    const sources = [{ id: 'polish' }, { id: 'german' }];
    expect(jobCurrencyProblem(sources, metadata, { maxPrice: 1000000 })).toMatch(/same currency/);
    expect(jobCurrencyProblem([{ id: 'polish' }], metadata, { maxPrice: 1000000 })).toBeNull();
    expect(jobCurrencyProblem([sources[0], { ...sources[1], enabled: false }], metadata, { maxPrice: 1 })).toBeNull();
    expect(jobCurrencyProblem(sources, metadata, null)).toBeNull();
  });

  it('reads a job source by its url, since one provider can span two currencies', () => {
    const metadata = new Map([['portal', { currency: 'EUR', currencyByHost: { 'portal.ch': 'CHF' } }]]);
    const swiss = { id: 'portal', url: 'https://www.portal.ch/search' };
    const german = { id: 'portal', url: 'https://www.portal.de/search' };
    expect(jobCurrencyProblem([swiss, german], metadata, { maxPrice: 1000 })).toMatch(/same currency/);
    expect(jobCurrencyProblem([swiss], metadata, { maxPrice: 1000 })).toBeNull();
  });
});
