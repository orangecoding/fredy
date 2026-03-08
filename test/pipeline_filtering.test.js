/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { expect } from 'chai';
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
      getListings: () => Promise.resolve([{ id: '1', title: 'test', address: 'addr', price: '100' }]),
      normalize: (l) => l,
      filter: () => true,
      crawlFields: { id: 'id', title: 'title', address: 'address', price: 'price' },
    };

    const fredy = new Fredy(providerConfig, null, null, 'test-provider', 'test-job', mockSimilarityCache);

    // Clear deletedIds before test
    mockStore.deletedIds.length = 0;

    try {
      await fredy.execute();
    } catch {
      // Might throw NoNewListingsWarning if all are filtered out
    }

    expect(mockStore.deletedIds).to.include('1');
  });

  it('should call deleteListingsById when listings are filtered by area', async () => {
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

    const providerConfig = {
      url: 'http://example.com',
      getListings: () =>
        Promise.resolve([{ id: '2', title: 'test', address: 'addr', price: '100', latitude: 2, longitude: 2 }]), // outside polygon
      normalize: (l) => l,
      filter: () => true,
      crawlFields: { id: 'id', title: 'title', address: 'address', price: 'price' },
    };

    const fredy = new Fredy(providerConfig, null, spatialFilter, 'test-provider', 'test-job', mockSimilarityCache);

    // Clear deletedIds before test
    mockStore.deletedIds.length = 0;

    try {
      await fredy.execute();
    } catch {
      // Might throw NoNewListingsWarning if all are filtered out
    }

    expect(mockStore.deletedIds).to.include('2');
  });
});
