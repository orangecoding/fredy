/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';

import { currencyForCountries, formatListing } from '../../lib/utils/formatListing.js';

describe('the currency in a notification', () => {
  // flatfox prices in francs, and a Zurich flat for CHF 1440 arrived as "1.440 €".
  it('prints francs for a listing that can only be in Switzerland', () => {
    expect(currencyForCountries(['ch'])).toBe('CHF');
    expect(formatListing({ price: 1440 }, 'de', 'CHF').price).toBe('1.440 CHF');
  });

  it('keeps euros everywhere else, a provider spanning several countries included', () => {
    expect(currencyForCountries(['de'])).toBe('EUR');
    expect(currencyForCountries(['de', 'at', 'ch'])).toBe('EUR');
    expect(currencyForCountries(null)).toBe('EUR');
    expect(formatListing({ price: 1200000 }, 'de').price).toBe('1.200.000 €');
  });
});
