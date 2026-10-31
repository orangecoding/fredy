/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it } from 'vitest';
import { currencyForListing, jobCurrencyProblem } from '../../lib/services/providers/currency.js';
import { currencyContextForProviders, getCurrencyForListing } from '../../lib/services/providers/providerCurrency.js';
import { formatListing, formatPriceChange } from '../../lib/utils/formatListing.js';

describe('provider currencies', () => {
  it('uses explicit currency and preserves the EUR fallback and Swiss francs', () => {
    expect(currencyForListing({ countries: ['pl'], currency: 'PLN' })).toBe('PLN');
    expect(currencyForListing(null)).toBe('EUR');
    expect(currencyForListing({ countries: ['ch'] })).toBe('EUR');
    expect(currencyForListing({ currency: 'CHF' })).toBe('CHF');
    const meta = { currency: 'EUR', currencyOf: (l) => (l.link.endsWith('.ch') ? 'CHF' : 'EUR') };
    expect(currencyForListing(meta, { link: 'https://example.ch' })).toBe('CHF');
    expect(currencyForListing(meta, { link: 'https://example.de' })).toBe('EUR');
  });

  it('defaults malformed declarations and failed narrowing to EUR', () => {
    for (const currency of [null, '', 'pln', 'PL', 1]) {
      expect(currencyForListing({ currency })).toBe('EUR');
    }
    expect(
      currencyForListing(
        {
          currencyOf: () => {
            throw new Error('bad link');
          },
        },
        {},
      ),
    ).toBe('EUR');
  });

  it('loads explicit Swiss metadata and defaults unknown providers to EUR', async () => {
    expect(await getCurrencyForListing('flatfox', {})).toBe('CHF');
    expect(await getCurrencyForListing('unknown', {})).toBe('EUR');
    expect(await getCurrencyForListing('betterhomes', { link: 'https://www.betterhomes.ch/de/immobilien/' })).toBe(
      'CHF',
    );
  });

  it('builds EUR query predicates from metadata, including multi-currency hosts', () => {
    const context = currencyContextForProviders([
      { metaInformation: { id: 'polish', currency: 'PLN' } },
      {
        metaInformation: {
          id: 'mixed',
          currency: 'EUR',
          hosts: ['example.de', 'example.ch'],
          currencyOf: (listing) => (listing.link.includes('example.ch') ? 'CHF' : 'EUR'),
        },
      },
    ]);
    expect(context.resolve({ provider: 'polish' })).toBe('PLN');
    expect(context.resolve({ provider: 'missing' })).toBe('EUR');
    expect(context.euroSql).toContain("l.provider != 'polish'");
    expect(context.euroSql).toContain('https://example.de/%');
    expect(context.euroSql).not.toContain('https://example.ch/%');
  });

  it('formats discovery and every price-change amount in PLN', () => {
    expect(formatListing({ price: 1050000 }, 'en', 'PLN').price).toBe('1.050.000 PLN');
    const result = formatPriceChange(
      { listing: { price: 900000 }, oldPrice: 1000000, newPrice: 900000, changePercent: -10, direction: 'down' },
      'en',
      'PLN',
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
});
