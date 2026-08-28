/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { mockFredy, providerConfig } from '../utils.js';
import * as provider from '../../lib/provider/flatfox.js';

/**
 * Flatfox, the first Swiss provider Fredy ships.
 *
 * Unlike every other provider here it reads a JSON API, and it reads two endpoints rather than one:
 * the pins carry the keys of everything matching the search, the second call turns those keys into
 * listings. Both are served from fixtures offline, so a run that only manages the first request
 * would surface as an empty result rather than passing quietly.
 *
 * Assertions are structural, because the same file runs against the fixture (`yarn test:offline`)
 * and against the live API (`yarn test`).
 */
const TEST_TIMEOUT = 120_000;

describe('#flatfox provider testsuite()', () => {
  /** @type {any[]} */
  let listings;

  beforeAll(async () => {
    const Fredy = await mockFredy();
    const runConfig = provider.createConfig(providerConfig.flatfox, [], []);
    const job = { id: 'flatfox', notificationAdapter: null, spatialFilter: null, specFilter: null };

    const fredy = new Fredy(runConfig, job, provider.metaInformation.id, similarityCache, undefined);
    listings = await fredy.execute();
  }, TEST_TIMEOUT);

  it('gets through both requests and finds listings', () => {
    expect(listings).toBeInstanceOf(Array);
    expect(listings.length).toBeGreaterThan(0);
  });

  /**
   * The API answers with English decimals - `number_of_rooms: "2.0"` - while every other provider
   * here reads German-formatted text off a page. Parsed with the German reader, that dot is a
   * thousands separator and a two-room flat comes out with twenty.
   */
  it('reads the API decimals as decimals, not as thousands separators', () => {
    const withRooms = listings.filter((listing) => listing.rooms != null);
    expect(withRooms.length).toBeGreaterThan(0);

    for (const listing of withRooms) {
      expect(listing.rooms, `rooms of ${listing.id}`).toBeGreaterThan(0);
      expect(listing.rooms, `rooms of ${listing.id}`).toBeLessThan(30);
    }
  });

  it('carries a price and an address on every listing', () => {
    for (const listing of listings) {
      expect(typeof listing.price, `price of ${listing.id}`).toBe('number');
      expect(listing.price).toBeGreaterThan(0);
      expect(listing.address, `address of ${listing.id}`).toBeTruthy();
    }
  });

  /**
   * `price_display` and `rent_gross` are the Bruttomiete, Nebenkosten included, while the
   * affordability check adds a Nebenkosten surcharge to whatever `price` holds - so quoting the
   * gross figure counted them twice. Driven through `normalize` with a synthetic payload rather
   * than asserted on `listings`, because the normalized listing no longer carries the raw rent
   * fields the comparison needs, and because this has to hold against the live API too.
   */
  it('quotes the Nettomiete, and falls back to the gross figure when there is none', () => {
    const { normalize } = provider.createConfig(providerConfig.flatfox, []);
    const base = { pk: 1, title: 'Wohnung', url: '/de/flat/1', surface_living: 80, number_of_rooms: 3, city: 'Zürich' };

    expect(normalize({ ...base, price_display: 2710, rent_gross: 2710, rent_net: 2550 }).price).toBe(2550);
    expect(normalize({ ...base, price_display: 3020, rent_gross: 3020, rent_net: null }).price).toBe(3020);
  });

  it('links to the German listing page', () => {
    for (const listing of listings) {
      expect(listing.link, `link of ${listing.id}`).toMatch(/^https:\/\/flatfox\.ch\/de\//);
    }
  });

  it('declares Switzerland, which is what sends the geocoder there', () => {
    expect(provider.metaInformation.countries).toEqual(['ch']);
  });
});
