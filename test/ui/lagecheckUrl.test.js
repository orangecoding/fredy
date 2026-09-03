/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';

import { lagecheckUrl } from '../../ui/src/services/listings/lagecheckUrl.js';

describe('lagecheckUrl', () => {
  it('builds the link Lagecheck documents', () => {
    expect(
      lagecheckUrl({
        latitude: 51.17072,
        longitude: 6.83937,
        address: 'Holthausen, Düsseldorf-Stadtbezirk 9, Deutschland',
      }),
    ).toBe(
      'https://lagecheck.com/check?lat=51.17072&lng=6.83937&address=Holthausen%2C+D%C3%BCsseldorf-Stadtbezirk+9%2C+Deutschland',
    );
  });

  // The address is only a label on the far side, so a listing whose address never resolved still
  // gets a working link rather than none at all.
  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['whitespace', '   '],
  ])('leaves the address out when it is %s', (_name, address) => {
    expect(lagecheckUrl({ latitude: 51.17072, longitude: 6.83937, address })).toBe(
      'https://lagecheck.com/check?lat=51.17072&lng=6.83937',
    );
  });

  it('trims an address rather than encoding the padding', () => {
    expect(lagecheckUrl({ latitude: 1, longitude: 2, address: '  Köln  ' })).toBe(
      'https://lagecheck.com/check?lat=1&lng=2&address=K%C3%B6ln',
    );
  });

  // Without a point there is nothing to check, and the caller hides the whole block on null.
  it.each([
    ['no coordinates at all', {}],
    ['only a latitude', { latitude: 51.17072 }],
    ['only a longitude', { longitude: 6.83937 }],
    ['a null latitude', { latitude: null, longitude: 6.83937 }],
    ['a null longitude', { latitude: 51.17072, longitude: null }],
    ['coordinates that are not numbers', { latitude: '51.17072', longitude: '6.83937' }],
    ['a NaN coordinate', { latitude: Number.NaN, longitude: 6.83937 }],
    // -1 is the geocoder's "looked, found nothing", not a position in the Atlantic.
    ['the unresolved sentinel', { latitude: -1, longitude: -1, address: 'Somewhere' }],
    ['a half-written sentinel', { latitude: 51.17072, longitude: -1 }],
  ])('returns null for %s', (_name, listing) => {
    expect(lagecheckUrl(listing)).toBeNull();
  });

  it('survives being called with nothing', () => {
    expect(lagecheckUrl()).toBeNull();
  });

  it('keeps a negative longitude that is not the sentinel', () => {
    expect(lagecheckUrl({ latitude: 53.35, longitude: -6.26 })).toBe('https://lagecheck.com/check?lat=53.35&lng=-6.26');
  });
});
