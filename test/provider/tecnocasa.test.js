/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { mockFredy, providerConfig } from '../utils.js';
import * as provider from '../../lib/provider/tecnocasa.js';

/**
 * Tecnocasa, the largest estate agency network in Italy.
 *
 * Its pages hand their data to Vue as JSON attributes, so what these tests pin is the shape of
 * those payloads rather than the markup around them. The detail run matters as much as the search
 * one: the cards carry no description at all, and the enrichment is the only thing that gives the
 * blacklist something to work on.
 *
 * Assertions are structural rather than literal, because the same file runs against the fixtures
 * (`yarn test:offline`) and against the live site (`yarn test`), where every advert differs. The
 * test pipeline enriches one listing only, which is why the description is asserted on that one.
 */
const TEST_TIMEOUT = 120_000;

describe('#tecnocasa provider testsuite()', () => {
  /** @type {any[]} */
  let listings;
  /** @type {any} */
  let runConfig;

  beforeAll(async () => {
    const Fredy = await mockFredy();
    runConfig = provider.createConfig(providerConfig.tecnocasa, [], []);
    const job = { id: 'tecnocasa', notificationAdapter: null, spatialFilter: null, specFilter: null };

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
   * Every figure arrives as a display string - "€ 170.000", "75 Mq", "3 locali" - and the euro sign
   * in front of the price is what a plain number reader gives up on.
   */
  it('reads the display strings as numbers', () => {
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
      expect(listing.link, `link of ${listing.id}`).toMatch(/^https:\/\/www\.tecnocasa\.it\//);
    }
  });

  /**
   * The card writes "Roma, Via Casilina - Casilina": the town first, then the street, then the
   * quarter the agency files it under. Nominatim answers that whole line with nothing.
   */
  it('turns the subtitle into an address and drops the quarter', () => {
    for (const listing of carrying('address')) {
      expect(listing.address, `address of ${listing.id}`).not.toContain(' - ');
    }
  });

  it('declares Italy, which is what sends the geocoder there', () => {
    expect(provider.metaInformation.countries).toEqual(['it']);
  });

  describe('with provider_details enabled', () => {
    /** @type {any} */
    let enriched;

    beforeAll(async () => {
      if (!listings?.length) throw new Error('No listings from the search run to enrich');
      enriched = await runConfig.fetchDetails(listings[0]);
    }, TEST_TIMEOUT);

    /**
     * The card carries no description at all and every title in a search reads "Trilocale in
     * vendita", so without this the blacklist has nothing to work on.
     */
    it('adds the description the card does not carry, as plain text', () => {
      expect(enriched.description).toBeTypeOf('string');
      expect(enriched.description).not.toBe('');
      expect(enriched.description).not.toMatch(/<\/?[a-z][a-z0-9]*[^>]*>/i);
    });

    /** Coordinates off the advert spare the pipeline a Nominatim request per listing. */
    it('takes the coordinates off the advert page rather than geocoding them', () => {
      // Italy's mainland box, which is what the map allows for an Italian provider.
      expect(enriched.latitude).toBeGreaterThan(35);
      expect(enriched.latitude).toBeLessThan(48);
      expect(enriched.longitude).toBeGreaterThan(6);
      expect(enriched.longitude).toBeLessThan(19);
    });

    it('keeps the street and names the town', () => {
      expect(enriched.address).toBeTypeOf('string');
      expect(enriched.address).toContain(',');
    });

    /** The search pages carry no date anywhere; only the advert page stamps one. */
    it('reads the publish date the advert page stamps', () => {
      expect(enriched.publishedAt).toBe(Date.UTC(2026, 6, 23, 17, 57, 55));
    });
  });
});
