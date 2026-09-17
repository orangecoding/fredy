/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it } from 'vitest';
import { extractNumber } from '../../lib/utils/extract-number.js';

describe('extractNumber', () => {
  it('returns null for null', () => {
    expect(extractNumber(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(extractNumber(undefined)).toBeNull();
  });

  it('returns null for unparseable string', () => {
    expect(extractNumber('Zimmer')).toBeNull();
  });

  it('passes through a number directly', () => {
    expect(extractNumber(3.5)).toBe(3.5);
  });

  it('parses a plain integer', () => {
    expect(extractNumber('2')).toBe(2);
  });

  it('parses German comma-decimal (e.g. "3,5 Zi.")', () => {
    // The bug: 3,5 was incorrectly returned as 35 in some code paths
    expect(extractNumber('3,5 Zi.')).toBe(3.5);
  });

  it('parses English dot-decimal (e.g. "3.5 Zimmer")', () => {
    // The bug: extractNumber stripped the dot, turning 3.5 into 35
    expect(extractNumber('3.5 Zimmer')).toBe(3.5);
  });

  it('parses English dot-decimal without unit', () => {
    expect(extractNumber('3.5')).toBe(3.5);
  });

  it('parses German thousands separator (e.g. "2.300\\u00a0€")', () => {
    // Non-breaking space after the digits
    expect(extractNumber('2.300\u00a0€')).toBe(2300);
  });

  it('parses German thousands separator without unit (e.g. "1.000")', () => {
    expect(extractNumber('1.000')).toBe(1000);
  });

  it('parses "1.310 €"', () => {
    expect(extractNumber('1.310 €')).toBe(1310);
  });

  it('parses German combined thousands + decimal (e.g. "1.234,56")', () => {
    expect(extractNumber('1.234,56')).toBe(1234.56);
  });

  it('parses size with comma decimal (e.g. "131,37\\u00a0m²")', () => {
    expect(extractNumber('131,37\u00a0m²')).toBe(131.37);
  });

  it('parses "1,5 Zi." as 1.5 (not 15)', () => {
    expect(extractNumber('1,5 Zi.')).toBe(1.5);
  });

  it('parses "1,5\\u00a0Zi." as 1.5 (with non-breaking space)', () => {
    expect(extractNumber('1,5\u00a0Zi.')).toBe(1.5);
  });
});
