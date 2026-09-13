/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { mockFredy, providerConfig } from '../utils.js';
import * as provider from '../../lib/provider/tecnorete.js';
import * as tecnocasa from '../../lib/provider/tecnocasa.js';

/**
 * Tecnorete, the second estate agency network of the Tecnocasa group.
 *
 * It reads through the same platform module as tecnocasa, so what this file pins is the half that
 * is its own - the brand, the base url, the hostname the adverts live on - plus one run over the
 * shared reader against a tecnorete page, which is what would fail if the two sites ever stopped
 * being the same application.
 *
 * Assertions are structural rather than literal, because the same file runs against the fixtures
 * (`yarn test:offline`) and against the live site (`yarn test`), where every advert differs.
 */
const TEST_TIMEOUT = 120_000;

describe('#tecnorete provider testsuite()', () => {
  /** @type {any[]} */
  let listings;
  /** @type {any} */
  let runConfig;

  beforeAll(async () => {
    const Fredy = await mockFredy();
    runConfig = provider.createConfig(providerConfig.tecnorete, [], []);
    const job = { id: 'tecnorete', notificationAdapter: null, spatialFilter: null, specFilter: null };

    const fredy = new Fredy(runConfig, job, provider.metaInformation.id, similarityCache, undefined);
    listings = await fredy.execute();
  }, TEST_TIMEOUT);

  /**
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

  // The two brands share a reader, so a listing landing on the wrong hostname is how a mix-up
  // between them would show.
  it('links to a tecnorete advert page', () => {
    for (const listing of listings) {
      expect(listing.link, `link of ${listing.id}`).toMatch(/^https:\/\/www\.tecnorete\.it\//);
    }
  });

  it('turns the subtitle into an address and drops the quarter', () => {
    for (const listing of carrying('address')) {
      expect(listing.address, `address of ${listing.id}`).not.toContain(' - ');
    }
  });

  it('declares Italy, which is what sends the geocoder there', () => {
    expect(provider.metaInformation.countries).toEqual(['it']);
  });

  // Both brands build on one template, and a template shared by reference would let a run of one
  // brand carry the other one's url and blacklist.
  it('is a provider of its own rather than a second name for tecnocasa', () => {
    expect(provider.metaInformation.id).not.toBe(tecnocasa.metaInformation.id);
    expect(provider.metaInformation.baseUrl).not.toBe(tecnocasa.metaInformation.baseUrl);
    expect(provider.config).not.toBe(tecnocasa.config);
  });

  describe('with provider_details enabled', () => {
    /** @type {any} */
    let enriched;

    beforeAll(async () => {
      if (!listings?.length) throw new Error('No listings from the search run to enrich');
      enriched = await runConfig.fetchDetails(listings[0]);
    }, TEST_TIMEOUT);

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

    /**
     * The search pages carry no date anywhere; the advert page stamps the one the agency published
     * or last edited the advert on, which is what sorts the list and tells an old advert from a new
     * one.
     */
    it('reads the publish date the advert page stamps', () => {
      expect(enriched.publishedAt).toBe(Date.UTC(2026, 5, 4, 15, 49, 58));
    });
  });
});
