/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it } from 'vitest';
import {
  compileExcludedLocations,
  matchesExcludedLocation,
  normalizeExcludedLocations,
} from '../../lib/utils/excludedLocations.js';

describe('job excluded locations', () => {
  it('trims, drops blanks and deduplicates without changing the first spelling or the input', () => {
    const values = [' Neukölln ', '', '  ', 'NEUKÖLLN', 'Wedding', ' wedding '];
    expect(normalizeExcludedLocations(values)).toEqual(['Neukölln', 'Wedding']);
    expect(values[0]).toBe(' Neukölln ');
  });

  it('treats composed and decomposed place names as the same text', () => {
    expect(normalizeExcludedLocations(['Neukölln', 'Neuko\u0308lln'])).toEqual(['Neukölln']);
    expect(matchesExcludedLocation('Berlin, Neuko\u0308lln', compileExcludedLocations(['NEUKÖLLN']))).toBe(true);
  });

  it('compiles normalized exclusions once for reuse across addresses', () => {
    const locations = [' Spandau ', 'SPANDAU', '', 'Neuko\u0308lln'];
    const matchers = compileExcludedLocations(locations);
    expect(matchers).toHaveLength(2);
    locations[0] = 'Wedding';
    expect(matchesExcludedLocation('Berlin, Spandau', matchers)).toBe(true);
    expect(matchesExcludedLocation('Berlin, Spandau', matchers)).toBe(true);
    expect(matchesExcludedLocation('Berlin, Neukölln', matchers)).toBe(true);
    expect(matchesExcludedLocation('Berlin, Wedding', matchers)).toBe(false);
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
    expect(matchesExcludedLocation(address, compileExcludedLocations(excluded))).toBe(expected);
  });

  it.each([
    ['Berlin, Spandauer Damm 1', 'Spandau'],
    ['Berlin, Mittenwalder Straße 1', 'Mitte'],
    ['Berlin, Buchholzer Straße 1', 'Buch'],
    ['Berlin, Köpenicker Straße 1', 'Köpenick'],
    ['äSpandau', 'Spandau'],
    ['Spandauä', 'Spandau'],
    ['𐐀Spandau', 'Spandau'],
    ['Spandau𐐀', 'Spandau'],
    ['1Spandau', 'Spandau'],
    ['Spandau1', 'Spandau'],
    ['١Spandau', 'Spandau'],
    ['Spandau١', 'Spandau'],
  ])('does not match a location inside a Unicode word: %s / %s', (address, location) => {
    expect(matchesExcludedLocation(address, compileExcludedLocations([location]))).toBe(false);
  });

  it.each([
    ['Spandau', 'Spandau'],
    ['Berlin, Spandau', 'Spandau'],
    ['Spandau, Berlin', 'Spandau'],
    ['Berlin-Mitte, Chausseestraße 1', 'Mitte'],
    ['Berlin (Buch), Straße 1', 'Buch'],
    ['Köpenick / Berlin', 'Köpenick'],
    ['_Spandau_', 'Spandau'],
    ['Berlin, Äußere Neustadt', 'Äußere Neustadt'],
  ])('matches a complete location between word boundaries: %s / %s', (address, location) => {
    expect(matchesExcludedLocation(address, compileExcludedLocations([location]))).toBe(true);
  });

  it.each([
    ['St. Pauli', 'St. Pauli', true],
    ['Stx Pauli', 'St. Pauli', false],
    ['Halle (Saale)', 'Halle (Saale)', true],
    ['Halle Saale', 'Halle (Saale)', false],
    ['A+B', 'A+B', true],
    ['AB', 'A+B', false],
    ['Nord[1]', 'Nord[1]', true],
    ['Nord1', 'Nord[1]', false],
    ['West\\Ost', 'West\\Ost', true],
    ['WestOst', 'West\\Ost', false],
    ['Alt.*?^${2}|', 'Alt.*?^${2}|', true],
    ['Alt', 'Alt.*?^${2}|', false],
  ])('treats regex metacharacters as literal location text: %s / %s', (address, location, expected) => {
    expect(matchesExcludedLocation(address, compileExcludedLocations([location]))).toBe(expected);
  });
});
