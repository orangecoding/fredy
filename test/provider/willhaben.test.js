/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { mockFredy, providerConfig } from '../utils.js';
import * as provider from '../../lib/provider/willhaben.js';

/**
 * willhaben, Austria's largest property portal and the first provider Fredy ships that is not
 * German.
 *
 * The results are read out of the page's `__NEXT_DATA__` rather than its markup, so what these
 * tests pin is the shape of that payload: willhaben changing a class name is harmless, willhaben
 * renaming an attribute is not.
 *
 * Assertions are structural rather than literal, because the same file runs against the fixture
 * (`yarn test:offline`) and against the live portal (`yarn test`), where every listing differs.
 */
const TEST_TIMEOUT = 120_000;

describe('#willhaben provider testsuite()', () => {
  /** @type {any[]} */
  let listings;

  beforeAll(async () => {
    const Fredy = await mockFredy();
    const runConfig = provider.createConfig(providerConfig.willhaben, [], []);
    const job = { id: 'willhaben', notificationAdapter: null, spatialFilter: null, specFilter: null };

    const fredy = new Fredy(runConfig, job, provider.metaInformation.id, similarityCache, undefined);
    listings = await fredy.execute();
  }, TEST_TIMEOUT);

  it('finds listings', () => {
    expect(listings).toBeInstanceOf(Array);
    expect(listings.length).toBeGreaterThan(0);
  });

  it('reads the headline figures as numbers', () => {
    for (const listing of listings) {
      expect(typeof listing.price, `price of ${listing.id}`).toBe('number');
      expect(listing.price).toBeGreaterThan(0);
      expect(listing.size).toBeGreaterThan(0);
      expect(listing.rooms).toBeGreaterThan(0);
      // A flat with more rooms than this is a decimal separator read the wrong way round, which is
      // exactly how a "2.0" turns into twenty.
      expect(listing.rooms, `rooms of ${listing.id}`).toBeLessThan(30);
    }
  });

  it('links to the exposé rather than to a relative path', () => {
    for (const listing of listings) {
      expect(listing.link, `link of ${listing.id}`).toMatch(/^https:\/\/www\.willhaben\.at\/iad\//);
    }
  });

  /**
   * The reason {@link provider} filters the address at all. willhaben writes Vienna's districts as
   * "Wien, 03. Bezirk, Landstraße", and Nominatim answers that with nothing at all - the listing
   * then has no coordinates, so no area filter and no travel time. Dropping the district segment is
   * what makes the rest resolve.
   */
  it('leaves no Vienna district number in the address', () => {
    for (const listing of listings) {
      expect(listing.address, `address of ${listing.id}`).toBeTruthy();
      expect(listing.address, `address of ${listing.id}`).not.toMatch(/\d+\.\s*Bezirk/i);
    }
  });

  it('declares Austria, which is what sends the geocoder there', () => {
    expect(provider.metaInformation.countries).toEqual(['at']);
  });
});
