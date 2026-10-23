/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it } from 'vitest';
import { matchesExcludedLocation, normalizeExcludedLocations } from '../../lib/utils/excludedLocations.js';

describe('job excluded locations', () => {
  it('trims, drops blanks and deduplicates without changing the first spelling or the input', () => {
    const values = [' Neukölln ', '', '  ', 'NEUKÖLLN', 'Wedding', ' wedding '];
    expect(normalizeExcludedLocations(values)).toEqual(['Neukölln', 'Wedding']);
    expect(values[0]).toBe(' Neukölln ');
  });

  it('treats composed and decomposed place names as the same text', () => {
    expect(normalizeExcludedLocations(['Neukölln', 'Neuko\u0308lln'])).toEqual(['Neukölln']);
    expect(matchesExcludedLocation('Berlin, Neuko\u0308lln', ['NEUKÖLLN'])).toBe(true);
  });

  it.each([
    ['12043 Berlin, NEUKÖLLN', [' Neukölln '], true],
    ['Berlin-Wedding, Müllerstraße 1', ['Spandau', 'Wedding'], true],
    ['Berlin Mitte', ['Neukölln'], false],
    ['Berlin Mitte', ['  '], false],
    ['Berlin Mitte', [], false],
    ['Berlin Mitte', undefined, false],
    [undefined, ['Neukölln'], false],
    [null, ['Neukölln'], false],
    ['', ['Neukölln'], false],
    ['NO ADDRESS FOUND', ['No'], false],
    [' no address found ', ['Address'], false],
  ])('matches address %s against %j: %s', (address, excluded, expected) => {
    expect(matchesExcludedLocation(address, excluded)).toBe(expected);
  });
});
