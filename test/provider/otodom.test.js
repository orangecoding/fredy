/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { mockFredy, providerConfig } from '../utils.js';
import * as provider from '../../lib/provider/otodom.js';
import * as mockStore from '../mocks/mockStore.js';
import * as mockNotification from '../mocks/mockNotification.js';

const similarityCache = { checkAndAddEntry: () => false };

describe('Otodom provider pipeline', () => {
  let listings;
  let pipeline;
  beforeAll(async () => {
    mockStore.resetListings();
    const Fredy = await mockFredy();
    pipeline = new Fredy(
      provider.createConfig(providerConfig.otodom),
      { id: 'otodom', dealType: 'buy', notificationAdapter: [{ id: 'test' }], spatialFilter: null, specFilter: null },
      'otodom',
      similarityCache,
    );
    listings = await pipeline.execute();
    const priced = mockNotification.get().payload?.find((listing) => listing.price != null);
    expect(priced?.price).toContain('PLN');
  }, 180_000);

  it('does not notify again for unchanged adverts', async () => {
    const hashes = listings.map((listing) => listing.id);
    const spy = vi.spyOn(mockStore, 'getKnownListingHashesForJobAndProvider').mockReturnValue(hashes);
    mockNotification.reset();
    try {
      await pipeline.execute();
      expect(mockNotification.get()).toEqual({});
    } finally {
      spy.mockRestore();
    }
  }, 180_000);

  it('finds Polish house adverts with PLN prices and canonical links', () => {
    expect(listings.length).toBeGreaterThan(0);
    expect(new Set(listings.map((listing) => listing.link)).size).toBe(listings.length);
    for (const listing of listings) {
      expect(listing.link).toMatch(/^https:\/\/www.otodom.pl\/pl\/oferta\//);
      expect(listing.title).toBeTypeOf('string');
      expect(listing.currency).toBe('PLN');
      if (listing.price != null) expect(listing.price).toBeGreaterThan(0);
    }
    expect(listings.some((listing) => listing.address?.includes('małopolskie'))).toBe(true);
  });
});
