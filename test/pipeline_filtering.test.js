/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { expect } from 'vitest';
import { mockFredy } from './utils.js';
import * as mockStore from './mocks/mockStore.js';

describe('Issue reproduction: listings filtered by similarity or area should be marked as manually deleted', () => {
  it('should call deleteListingsById when listings are filtered by similarity', async () => {
    const Fredy = await mockFredy();

    const mockSimilarityCache = {
      checkAndAddEntry: () => true, // always similar
    };

    const providerConfig = {
      url: 'http://example.com',
      getListings: () =>
        Promise.resolve([{ id: '1', title: 'test', address: 'addr', price: '100', link: 'http://example.com/1' }]),
      normalize: (l) => l,
      filter: () => true,
      crawlFields: { id: 'id', title: 'title', address: 'address', price: 'price' },
      fieldNames: ['id', 'title', 'address', 'price'],
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

    expect(mockStore.deletedIds).toContain('1');
  });

  // TODO: fix this test
  it.skip('should call deleteListingsById when listings are filtered by area', async () => {
    const Fredy = await mockFredy();

    const mockSimilarityCache = {
      checkAndAddEntry: () => false, // never similar
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
      fieldNames: ['id', 'title', 'address', 'price'],
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
