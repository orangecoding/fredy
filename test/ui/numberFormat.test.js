/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { formatDecimal } from '../../ui/src/services/number/numberService.js';

describe('formatDecimal', () => {
  it('writes the decimal separator the reader language uses', () => {
    // Issue #463: a German reader saw "5.5 Zimmer" and "112.33 m²" where the language writes a comma.
    expect(formatDecimal(5.5, 'de-DE')).toBe('5,5');
    expect(formatDecimal(112.33, 'de-DE')).toBe('112,33');
  });

  it('follows the reader locale rather than always writing German', () => {
    expect(formatDecimal(5.5, 'en-US')).toBe('5.5');
    expect(formatDecimal(112.33, 'en-US')).toBe('112.33');
  });

  it('leaves a whole figure without decimals', () => {
    expect(formatDecimal(4, 'de-DE')).toBe('4');
    expect(formatDecimal(74, 'en-US')).toBe('74');
  });

  it('groups thousands, which a large floor area has', () => {
    expect(formatDecimal(1200, 'de-DE')).toBe('1.200');
    expect(formatDecimal(1200, 'en-US')).toBe('1,200');
  });

  it('accepts the numeric strings the storage layer hands back', () => {
    expect(formatDecimal('5.5', 'de-DE')).toBe('5,5');
  });

  it('formats in German when no locale is given', () => {
    expect(formatDecimal(5.5)).toBe('5,5');
  });

  it('falls back to German rather than throwing on an empty locale', () => {
    expect(formatDecimal(5.5, '')).toBe('5,5');
  });

  it('hands back a value that is not a number unchanged', () => {
    expect(formatDecimal('auf Anfrage', 'de-DE')).toBe('auf Anfrage');
  });
});
