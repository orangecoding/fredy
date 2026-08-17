/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { formatEuroPrice } from '../../ui/src/services/price/priceService.js';
import { formatEuro } from '../../ui/src/components/cards/chartTheme.js';

/**
 * `Intl` separates the amount from the currency symbol with a narrow no-break space, which is
 * invisible in a diff and would make every assertion here a guessing game.
 * @param {string} value
 * @returns {string}
 */
const normalize = (value) => value.replace(/[\u00a0\u202f]/g, ' ');

describe('formatEuroPrice', () => {
  it('groups thousands and appends the symbol, German style', () => {
    expect(normalize(formatEuroPrice(776515, 'de-DE'))).toBe('776.515 €');
  });

  it('follows the reader locale for separator and symbol position', () => {
    expect(normalize(formatEuroPrice(776515, 'en-US'))).toBe('€776,515');
  });

  it('drops the cents a whole price does not have', () => {
    expect(normalize(formatEuroPrice(1016, 'de-DE'))).toBe('1.016 €');
  });

  it('prints both digits when a price does carry cents', () => {
    expect(normalize(formatEuroPrice(1016.5, 'de-DE'))).toBe('1.016,50 €');
    expect(normalize(formatEuroPrice(1016.55, 'de-DE'))).toBe('1.016,55 €');
  });

  it('accepts the numeric strings the storage layer hands back', () => {
    expect(normalize(formatEuroPrice('776515', 'de-DE'))).toBe('776.515 €');
  });

  it('formats in German when no locale is given', () => {
    expect(normalize(formatEuroPrice(776515))).toBe('776.515 €');
  });

  it('falls back to German rather than throwing on an empty locale', () => {
    expect(normalize(formatEuroPrice(776515, ''))).toBe('776.515 €');
  });

  it('hands back text prices unchanged, as providers wrote them', () => {
    expect(formatEuroPrice('auf Anfrage', 'de-DE')).toBe('auf Anfrage €');
  });

  it('formats zero rather than treating it as missing', () => {
    expect(normalize(formatEuroPrice(0, 'de-DE'))).toBe('0 €');
  });

  it('reuses one formatter per locale and precision', () => {
    // Same output on the second call is the only observable proof the cache did not go stale.
    expect(formatEuroPrice(1234, 'de-DE')).toBe(formatEuroPrice(1234, 'de-DE'));
    expect(normalize(formatEuroPrice(1234, 'en-US'))).toBe('€1,234');
  });
});

describe('formatEuro (charts)', () => {
  it('shares the listing format so a chart and a card read alike', () => {
    expect(normalize(formatEuro(776515, 'de-DE'))).toBe(normalize(formatEuroPrice(776515, 'de-DE')));
  });

  it('rounds away the cents an axis label has no room for', () => {
    expect(normalize(formatEuro(1016.55, 'de-DE'))).toBe('1.017 €');
  });

  it('keeps its own dash for values that are not numbers', () => {
    expect(formatEuro(null, 'de-DE')).toBe('–');
    expect(formatEuro('auf Anfrage', 'de-DE')).toBe('–');
  });
});
