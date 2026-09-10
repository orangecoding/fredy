/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { mockFredy, providerConfig } from '../utils.js';
import * as provider from '../../lib/provider/casa.js';

/**
 * Casa.it, one of the three national portals Italian agencies publish to.
 *
 * The results are read out of `window.__INITIAL_STATE__` rather than out of the markup, so what
 * these tests pin is the shape of that store. The store arrives escaped twice - a JSON document
 * inside a JavaScript string literal - which is the part most likely to be got wrong, and it keeps
 * the results in a different half depending on the search: `search` for a town search, `searchMap`
 * for a map search. Both shapes run through the same assertions here.
 *
 * Assertions are structural rather than literal, because the same file runs against the fixtures
 * (`yarn test:offline`) and against the live portal (`yarn test`), where every advert differs.
 */
const TEST_TIMEOUT = 120_000;

/** The two search shapes the provider reads, each with the source config a job would carry. */
const searchShapes = [
  { shape: 'town search', source: providerConfig.casa },
  { shape: 'map search', source: { url: providerConfig.casa.mapSearchUrl, enabled: true } },
];

describe.each(searchShapes)('#casa provider testsuite() - $shape', ({ shape, source }) => {
  /** @type {any[]} */
  let listings;

  beforeAll(async () => {
    const Fredy = await mockFredy();
    const runConfig = provider.createConfig(source, [], []);
    // Both shapes are answered by the same api and so by the same fixture. Deduplication is per
    // job, so they have to run as two jobs or the second one finds nothing new.
    const job = { id: `casa-${shape}`, notificationAdapter: null, spatialFilter: null, specFilter: null };

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

  /**
   * The store carries the price twice, as a number on the map marker and as "1.900" on the card.
   * Read as a decimal, that card figure is one euro ninety.
   */
  it('reads the headline figures as numbers', () => {
    for (const listing of carrying('price')) {
      expect(typeof listing.price, `price of ${listing.id}`).toBe('number');
      // Ten is the guard against "1.900" read as a decimal, which would arrive as one euro ninety.
      expect(listing.price, `price of ${listing.id}`).toBeGreaterThan(10);
    }
    for (const listing of carrying('size')) {
      expect(listing.size, `size of ${listing.id}`).toBeGreaterThan(0);
    }
    for (const listing of carrying('rooms')) {
      expect(listing.rooms, `rooms of ${listing.id}`).toBeGreaterThan(0);
      // The bound only has to catch a misparse, not police the market: the live portal carries
      // adverts whose rooms an agency typed wrongly by a factor of ten (32 and 73 were both read
      // off it on the same day), and those are real figures arriving as real numbers.
      expect(listing.rooms, `rooms of ${listing.id}`).toBeLessThan(100);
    }
  });

  it('builds an absolute link out of the relative path the store holds', () => {
    for (const listing of listings) {
      expect(listing.link, `link of ${listing.id}`).toMatch(/^https:\/\/www\.casa\.it\/immobili\//);
    }
  });

  /**
   * An agency that keeps the street to itself leaves the town as the whole address, so the comma is
   * what an advert publishing a street carries, not what every advert carries.
   */
  it('names the town alongside the street', () => {
    const addressed = carrying('address');
    for (const listing of addressed) {
      expect(listing.address.trim(), `address of ${listing.id}`).not.toBe('');
    }
    const named = addressed.filter((listing) => listing.address.includes(', '));
    expect(named.length, 'no listing named both a street and a town').toBeGreaterThan(0);
  });

  it('brings the coordinates with it', () => {
    for (const listing of carrying('latitude')) {
      // Italy's mainland box, which is what the map allows for an Italian provider.
      expect(listing.latitude, `latitude of ${listing.id}`).toBeGreaterThan(35);
      expect(listing.latitude, `latitude of ${listing.id}`).toBeLessThan(48);
      expect(listing.longitude, `longitude of ${listing.id}`).toBeGreaterThan(6);
      expect(listing.longitude, `longitude of ${listing.id}`).toBeLessThan(19);
    }
  });

  it('serves the photo off the image host, resized the way the cdn demands', () => {
    for (const listing of carrying('image')) {
      // The cdn answers a bare /listing path with a 400 "invalid uri format"; every url it serves
      // is a resized one, so the size segment has to be in.
      expect(listing.image, `image of ${listing.id}`).toMatch(/^https:\/\/images-1\.casa\.it\/\d+x\d+\//);
    }
  });

  /**
   * The api stamps every advert with the moment of its last edit - the field the site's own
   * "aggiornato il" reads - and both search shapes are read through the api, so both carry it. The
   * rendered store would not, but no url in the test set is left for it to answer.
   */
  it('carries the date the portal last edited the advert', () => {
    for (const listing of carrying('publishedAt')) {
      expect(typeof listing.publishedAt, `publishedAt of ${listing.id}`).toBe('number');
      expect(listing.publishedAt, `publishedAt of ${listing.id}`).toBeGreaterThan(0);
      expect(listing.publishedAt, `publishedAt of ${listing.id}`).toBeLessThanOrEqual(Date.now());
    }
  });

  /** Anything casa.it does not recognise falls back to relevance without saying so. */
  it('sorts by the criterion casa.it actually knows', () => {
    expect(provider.config.sortByDateParam).toBe('sortType=date_desc');
  });

  it('declares Italy, which is what sends the geocoder there', () => {
    expect(provider.metaInformation.countries).toEqual(['it']);
  });
});

describe('the result pages casa.it spreads a search over', () => {
  /** A store carrying one advert, in whichever half the search shape fills. */
  const store = (half, totalPages) =>
    `<script>window.__INITIAL_STATE__ = JSON.parse(${JSON.stringify(
      JSON.stringify({ [half]: { list: [{ id: 1 }], paginator: { totalPages } } }),
    )})</script>`;

  it('counts the pages of either search shape', () => {
    expect(provider.parseSearch(store('search', 4))).toEqual({ listings: [{ id: 1 }], totalPages: 4 });
    expect(provider.parseSearch(store('searchMap', 8))).toEqual({ listings: [{ id: 1 }], totalPages: 8 });
    expect(provider.parseSearch('<html></html>')).toBeNull();
  });

  it('names the page in the query, leaving a first page as the job wrote it', () => {
    const search = 'https://www.casa.it/srp/map/?tr=vendita&geopolygon={%22polygon%22:[]}';

    expect(provider.pageUrl(search, 1)).toBe(search);
    expect(new URL(provider.pageUrl(search, 3)).searchParams.get('page')).toBe('3');
    // A url that already names a page is rewritten rather than appended to.
    expect(new URL(provider.pageUrl(`${search}&page=3`, 5)).searchParams.get('page')).toBe('5');
    expect(new URL(provider.pageUrl(`${search}&page=3`, 1)).searchParams.has('page')).toBe(false);
  });
});
