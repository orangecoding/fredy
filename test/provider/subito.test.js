/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { mockFredy, providerConfig } from '../utils.js';
import * as provider from '../../lib/provider/subito.js';
import { readFile } from 'fs/promises';

/**
 * Subito.it, Italy's largest classifieds site and where private landlords advertise.
 *
 * The adverts are read out of the page's `__NEXT_DATA__`, and the search answers with two lists
 * rather than one: the results, and the promoted strip above them. Reading only the first loses
 * adverts, which is what {@link provider.parseListings} exists to prevent.
 *
 * Assertions are structural rather than literal, because the same file runs against the fixture
 * (`yarn test:offline`) and against the live site (`yarn test`), where every advert differs.
 */
const TEST_TIMEOUT = 120_000;

describe('#subito provider testsuite()', () => {
  /** @type {any[]} */
  let listings;

  beforeAll(async () => {
    const Fredy = await mockFredy();
    const runConfig = provider.createConfig(providerConfig.subito, [], []);
    const job = { id: 'subito', notificationAdapter: null, spatialFilter: null, specFilter: null };

    const fredy = new Fredy(runConfig, job, provider.metaInformation.id, similarityCache, undefined);
    listings = await fredy.execute();
  }, TEST_TIMEOUT);

  /**
   * Every portal carries adverts that leave a figure out - a price on request, a garage with no
   * rooms - and a live run will meet one sooner or later. What is pinned is that the figures that
   * are there are readable, not that every advert has them all.
   *
   * @param {string} field
   * @returns {any[]} the listings carrying that field
   */
  const carrying = (field) => {
    const found = listings.filter((listing) => listing[field] != null);
    expect(found.length, `no listing carried a ${field}`).toBeGreaterThan(0);
    return found;
  };

  it('finds listings', () => {
    expect(listings).toBeInstanceOf(Array);
    expect(listings.length).toBeGreaterThan(0);
  });

  it('reads the attribute keys as numbers', () => {
    for (const listing of carrying('price')) {
      expect(typeof listing.price, `price of ${listing.id}`).toBe('number');
      expect(listing.price, `price of ${listing.id}`).toBeGreaterThan(0);
    }
    for (const listing of carrying('size')) {
      expect(listing.size, `size of ${listing.id}`).toBeGreaterThan(0);
    }
    for (const listing of carrying('rooms')) {
      expect(listing.rooms, `rooms of ${listing.id}`).toBeGreaterThan(0);
      expect(listing.rooms, `rooms of ${listing.id}`).toBeLessThan(30);
    }
  });

  it('links to the advert page', () => {
    for (const listing of listings) {
      expect(listing.link, `link of ${listing.id}`).toMatch(/^https:\/\/www\.subito\.it\//);
    }
  });

  /** The whole advert text is in the search payload, so no listing should reach the user without it. */
  it('carries the description without a detail page', () => {
    for (const listing of carrying('description')) {
      expect(listing.description, `description of ${listing.id}`).toBeTypeOf('string');
    }
  });

  it('drops the country from the address, which a search inside Italy already knows', () => {
    for (const listing of carrying('address')) {
      expect(listing.address, `address of ${listing.id}`).not.toMatch(/,\s*Italia$/i);
    }
  });

  /**
   * The coordinates arrive as strings. Parsed with the reader the html scrapers use, where a dot
   * is a thousands separator, 41.9279404 becomes a latitude of forty-one million.
   */
  it('reads the coordinate strings as decimals', () => {
    for (const listing of carrying('latitude')) {
      // Italy's mainland box, which is what the map allows for an Italian provider.
      expect(listing.latitude, `latitude of ${listing.id}`).toBeGreaterThan(35);
      expect(listing.latitude, `latitude of ${listing.id}`).toBeLessThan(48);
      expect(listing.longitude, `longitude of ${listing.id}`).toBeGreaterThan(6);
      expect(listing.longitude, `longitude of ${listing.id}`).toBeLessThan(19);
    }
  });

  it('sorts newest first', () => {
    expect(provider.config.sortByDateParam).toBe('order=datedesc');
  });

  it('declares Italy, which is what sends the geocoder there', () => {
    expect(provider.metaInformation.countries).toEqual(['it']);
  });
});

/**
 * Read against the recorded page rather than through the pipeline, because what is asserted is a
 * property of the payload the two lists come out of - and offline is the only mode where the same
 * page is guaranteed to hold both of them.
 */
describe('the two lists a subito search answers with', () => {
  it.runIf(process.env.TEST_MODE === 'offline')('takes the promoted adverts as well as the results', async () => {
    const html = await readFile(new URL('../testFixtures/subito.html', import.meta.url), 'utf-8');
    const items = JSON.parse(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html)[1]).props.pageProps
      .initialState.items;

    const promotedOnly = items.galleryList.filter(
      (advert) => !items.originalList.some((result) => result.urn === advert.urn),
    );
    expect(promotedOnly.length, 'the fixture has to carry promoted adverts for this to mean anything').toBeGreaterThan(
      0,
    );

    const parsed = provider.parseListings(html);
    const urns = parsed.map((advert) => advert.urn);

    expect(parsed.length).toBe(items.originalList.length + promotedOnly.length);
    expect(new Set(urns).size, 'an advert in both lists is one advert').toBe(urns.length);
  });
});
