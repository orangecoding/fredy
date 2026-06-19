/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterEach, expect } from 'vitest';
import { mockFredy } from './utils.js';
import * as mockStore from './mocks/mockStore.js';
import { get as getLastNotification } from './mocks/mockNotification.js';

describe('Issue reproduction: listings filtered by similarity or area should be marked as manually deleted', () => {
  it('should soft-delete listings filtered by similarity (hidden from overview, kept for _findNew dedup)', async () => {
    const Fredy = await mockFredy();

    const mockSimilarityCache = {
      checkAndAddEntry: () => ({ duplicate: true }), // always similar
    };

    const providerConfig = {
      url: 'http://example.com',
      getListings: () =>
        Promise.resolve([{ id: '1', title: 'test', address: 'addr', price: '100', link: 'http://example.com/1' }]),
      normalize: (l) => l,
      filter: () => true,
      crawlFields: { id: 'id', title: 'title', address: 'address', price: 'price' },
      requiredFieldNames: ['id', 'title', 'address', 'price'],
    };

    const mockedJob = {
      id: 'test-job',
      notificationAdapter: null,
      specFilter: null,
      spatialFilter: null,
    };

    const fredy = new Fredy(providerConfig, mockedJob, 'test-provider', mockSimilarityCache, undefined);

    // Clear deletedIds before test
    mockStore.deletedIds.length = 0;

    try {
      await fredy.execute();
    } catch {
      // Might throw NoNewListingsWarning if all are filtered out
    }

    // Similarity-filtered listings are soft-deleted: hidden from overview but hashes
    // remain in DB so _findNew skips them on the next run without re-processing.
    expect(mockStore.deletedIds).toContain('1');
  });

  it('should call deleteListingsById when listings are filtered by area', async () => {
    const Fredy = await mockFredy();

    const mockSimilarityCache = {
      checkAndAddEntry: () => ({ duplicate: false }), // never similar
    };

    const spatialFilter = {
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [0, 1],
                [1, 1],
                [1, 0],
                [0, 0],
              ],
            ],
          },
        },
      ],
    };

    const mockedJob = {
      id: 'test-job',
      notificationAdapter: null,
      specFilter: null,
      spatialFilter: spatialFilter,
    };

    const providerConfig = {
      url: 'http://example.com',
      getListings: () =>
        Promise.resolve([
          {
            id: '2',
            title: 'test',
            address: 'addr',
            price: '100',
            latitude: 2,
            longitude: 2,
            link: 'http://example.com/2',
          },
        ]), // outside polygon
      normalize: (l) => l,
      filter: () => true,
      crawlFields: { id: 'id', title: 'title', address: 'address', price: 'price' },
      requiredFieldNames: ['id', 'title', 'address', 'price'],
    };

    const fredy = new Fredy(providerConfig, mockedJob, 'test-provider', mockSimilarityCache, undefined);

    mockStore.deletedIds.length = 0;

    try {
      await fredy.execute();
    } catch {
      // Might throw NoNewListingsWarning if all are filtered out
    }

    expect(mockStore.deletedIds).toContain('2');
  });
});

describe('Blacklist is re-applied after detail enrichment', () => {
  afterEach(() => {
    mockStore.setUserSettings(null);
  });

  it('filters out a listing whose blacklisted term only appears in the enriched description', async () => {
    const Fredy = await mockFredy();
    const providerId = 'test-provider';

    mockStore.setUserSettings({
      provider_details: [providerId],
      blacklist_filter_on_provider_details: true,
    });

    const mockSimilarityCache = {
      checkAndAddEntry: () => false,
    };

    const blacklist = ['allkauf'];

    // The search results page returns a clean snippet (no blacklisted term).
    // fetchDetails simulates loading the full detail page and discovers the
    // blacklisted term hidden deep in the description.
    const providerConfig = {
      url: 'http://example.com',
      getListings: () =>
        Promise.resolve([
          {
            id: 'kept',
            title: 'Nice house',
            address: 'Some street',
            price: '500000',
            link: 'http://example.com/kept',
            description: 'Cozy home with garden',
          },
          {
            id: 'blacklisted',
            title: 'Eleganz trifft Raumkomfort',
            address: 'Other street',
            price: '600000',
            link: 'http://example.com/blacklisted',
            description: 'Eleganz trifft Raumkomfort',
          },
        ]),
      normalize: (l) => l,
      filter: (l) => {
        const text = `${l.title ?? ''} ${l.description ?? ''}`.toLowerCase();
        return !blacklist.some((term) => text.includes(term));
      },
      fetchDetails: (listing) => {
        if (listing.id === 'blacklisted') {
          return Promise.resolve({
            ...listing,
            description: 'Mit allkauf Haus wird dein Traum vom Eigenheim wahr.',
          });
        }
        return Promise.resolve(listing);
      },
      crawlFields: {
        id: 'id',
        title: 'title',
        address: 'address',
        price: 'price',
        link: 'link',
        description: 'description',
      },
      requiredFieldNames: ['id', 'title', 'address', 'price', 'link', 'description'],
    };

    const mockedJob = {
      id: 'blacklist-test-job',
      notificationAdapter: null,
      specFilter: null,
      spatialFilter: null,
    };

    const fredy = new Fredy(providerConfig, mockedJob, providerId, mockSimilarityCache, undefined);

    const result = await fredy.execute();

    expect(result).toBeInstanceOf(Array);
    const ids = result.map((l) => l.id);
    expect(ids).toContain('kept');
    expect(ids).not.toContain('blacklisted');

    const notification = getLastNotification();
    const notifiedIds = (notification?.payload ?? []).map((p) => p.id);
    expect(notifiedIds).not.toContain('blacklisted');
  });

  it('short-circuits the pipeline when all listings get blacklisted after enrichment', async () => {
    const Fredy = await mockFredy();
    const providerId = 'all-blacklisted-provider';

    mockStore.setUserSettings({
      provider_details: [providerId],
      blacklist_filter_on_provider_details: true,
    });

    const mockSimilarityCache = {
      checkAndAddEntry: () => false,
    };

    const blacklist = ['allkauf'];

    const providerConfig = {
      url: 'http://example.com',
      getListings: () =>
        Promise.resolve([
          {
            id: 'only',
            title: 'Eleganz trifft Raumkomfort',
            address: 'Some street',
            price: '700000',
            link: 'http://example.com/only',
            description: 'Eleganz trifft Raumkomfort',
          },
        ]),
      normalize: (l) => l,
      filter: (l) => {
        const text = `${l.title ?? ''} ${l.description ?? ''}`.toLowerCase();
        return !blacklist.some((term) => text.includes(term));
      },
      fetchDetails: (listing) =>
        Promise.resolve({
          ...listing,
          description: 'Mit allkauf Haus wird dein Traum vom Eigenheim wahr.',
        }),
      crawlFields: {
        id: 'id',
        title: 'title',
        address: 'address',
        price: 'price',
        link: 'link',
        description: 'description',
      },
      requiredFieldNames: ['id', 'title', 'address', 'price', 'link', 'description'],
    };

    const mockedJob = {
      id: 'all-blacklisted-job',
      notificationAdapter: null,
      specFilter: null,
      spatialFilter: null,
    };

    const fredy = new Fredy(providerConfig, mockedJob, providerId, mockSimilarityCache, undefined);

    // Should resolve to undefined (NoNewListingsWarning is caught in _handleError).
    const result = await fredy.execute();
    expect(result).toBeUndefined();
  });

  it('does NOT re-filter when blacklist_filter_on_provider_details is disabled', async () => {
    const Fredy = await mockFredy();
    const providerId = 'opt-out-provider';

    // provider_details enabled (so fetchDetails runs) but blacklist re-filter NOT enabled.
    mockStore.setUserSettings({
      provider_details: [providerId],
      blacklist_filter_on_provider_details: false,
    });

    const mockSimilarityCache = {
      checkAndAddEntry: () => false,
    };

    const blacklist = ['allkauf'];

    const providerConfig = {
      url: 'http://example.com',
      getListings: () =>
        Promise.resolve([
          {
            id: 'leaks-through',
            title: 'Eleganz trifft Raumkomfort',
            address: 'Other street',
            price: '600000',
            link: 'http://example.com/leaks-through',
            description: 'Eleganz trifft Raumkomfort',
          },
        ]),
      normalize: (l) => l,
      filter: (l) => {
        const text = `${l.title ?? ''} ${l.description ?? ''}`.toLowerCase();
        return !blacklist.some((term) => text.includes(term));
      },
      fetchDetails: (listing) =>
        Promise.resolve({
          ...listing,
          description: 'Mit allkauf Haus wird dein Traum vom Eigenheim wahr.',
        }),
      crawlFields: {
        id: 'id',
        title: 'title',
        address: 'address',
        price: 'price',
        link: 'link',
        description: 'description',
      },
      requiredFieldNames: ['id', 'title', 'address', 'price', 'link', 'description'],
    };

    const mockedJob = {
      id: 'opt-out-job',
      notificationAdapter: null,
      specFilter: null,
      spatialFilter: null,
    };

    const fredy = new Fredy(providerConfig, mockedJob, providerId, mockSimilarityCache, undefined);

    const result = await fredy.execute();

    // Listing leaks through because user has not opted in to the stricter check.
    expect(result).toBeInstanceOf(Array);
    expect(result.map((l) => l.id)).toContain('leaks-through');
  });
});
