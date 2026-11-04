/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { formatListingPrice } from '../../ui/src/services/price/priceService.js';
import { formatEuro, formatEuroCompact } from '../../ui/src/components/cards/chartTheme.js';

/**
 * `Intl` separates the amount from the currency symbol with a narrow no-break space, which is
 * invisible in a diff and would make every assertion here a guessing game.
 * @param {string} value
 * @returns {string}
 */
const normalize = (value) => value.replace(/[\u00a0\u202f]/g, ' ');

describe('formatListingPrice', () => {
  it('keeps PLN amounts and currency in each locale', () => {
    expect(normalize(formatListingPrice(1050000, 'de-DE', 'PLN'))).toBe('1.050.000 PLN');
    expect(normalize(formatListingPrice(97.18, 'en-US', 'PLN'))).toContain('97.18');
    expect(formatListingPrice(1050000, 'en-US', 'PLN')).not.toContain('€');
  });
  it('groups thousands and appends the symbol, German style', () => {
    expect(normalize(formatListingPrice(776515, 'de-DE'))).toBe('776.515 €');
  });

  it('follows the reader locale for separator and symbol position', () => {
    expect(normalize(formatListingPrice(776515, 'en-US'))).toBe('€776,515');
  });

  it('drops the cents a whole price does not have', () => {
    expect(normalize(formatListingPrice(1016, 'de-DE'))).toBe('1.016 €');
  });

  it('prints both digits when a price does carry cents', () => {
    expect(normalize(formatListingPrice(1016.5, 'de-DE'))).toBe('1.016,50 €');
    expect(normalize(formatListingPrice(1016.55, 'de-DE'))).toBe('1.016,55 €');
  });

  it('accepts the numeric strings the storage layer hands back', () => {
    expect(normalize(formatListingPrice('776515', 'de-DE'))).toBe('776.515 €');
  });

  it('formats in German when no locale is given', () => {
    expect(normalize(formatListingPrice(776515))).toBe('776.515 €');
  });

  it('falls back to German rather than throwing on an empty locale', () => {
    expect(normalize(formatListingPrice(776515, ''))).toBe('776.515 €');
  });

  it('hands back text prices unchanged, as providers wrote them', () => {
    expect(formatListingPrice('auf Anfrage', 'de-DE')).toBe('auf Anfrage €');
  });

  it('formats zero rather than treating it as missing', () => {
    expect(normalize(formatListingPrice(0, 'de-DE'))).toBe('0 €');
  });

  it('reuses one formatter per locale and precision', () => {
    // Same output on the second call is the only observable proof the cache did not go stale.
    expect(formatListingPrice(1234, 'de-DE')).toBe(formatListingPrice(1234, 'de-DE'));
    expect(normalize(formatListingPrice(1234, 'en-US'))).toBe('€1,234');
  });
});

describe('formatEuro (charts)', () => {
  it('shares the listing format so a chart and a card read alike', () => {
    expect(normalize(formatEuro(776515, 'de-DE'))).toBe(normalize(formatListingPrice(776515, 'de-DE')));
  });

  it('rounds away the cents an axis label has no room for', () => {
    expect(normalize(formatEuro(1016.55, 'de-DE'))).toBe('1.017 €');
  });

  it('keeps its own dash for values that are not numbers', () => {
    expect(formatEuro(null, 'de-DE')).toBe('–');
    expect(formatEuro('auf Anfrage', 'de-DE')).toBe('–');
  });

  it('rounds another currency the same way', () => {
    expect(normalize(formatEuro(1016.55, 'de-DE', 'CHF'))).toBe('1.017 CHF');
  });
});

describe('formatEuroCompact', () => {
  it('stays compact whatever the currency, which a purchase price under the map slider needs', () => {
    expect(normalize(formatEuroCompact(1250000, 'de-DE'))).toBe('1,3 Mio. €');
    expect(normalize(formatEuroCompact(1250000, 'de-DE', 'CHF'))).toBe('1,3 Mio. CHF');
  });
});
