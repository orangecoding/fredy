/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterEach, expect, vi } from 'vitest';
import { readFile } from 'fs/promises';
import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { get } from '../mocks/mockNotification.js';
import { mockFredy, providerConfig } from '../utils.js';
import * as provider from '../../lib/provider/inberlinwohnen.js';

const snapshot = (item, tuple = true) => ({
  id: JSON.stringify({ data: { item: tuple ? [item, { s: 'arr' }] : item } }),
});

describe('#inberlinwohnen testsuite()', () => {
  provider.init(providerConfig.inberlinwohnen, []);
  afterEach(() => vi.restoreAllMocks());

  it('should parse listings from the Livewire snapshot', async () => {
    if (process.env.TEST_MODE === 'offline') {
      const html = await readFile(new URL('../testFixtures/inberlinwohnen.html', import.meta.url), 'utf8');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, text: async () => html });
    }
    const Fredy = await mockFredy();
    const mockedJob = {
      id: 'inberlinwohnen',
      notificationAdapter: null,
      spatialFilter: null,
      specFilter: null,
    };
    const fredy = new Fredy(provider.config, mockedJob, provider.metaInformation.id, similarityCache, undefined);

    const listings = await fredy.execute();

    expect(listings.length).toBeGreaterThan(0);
    const notification = get();
    expect(notification.serviceName).toBe('inberlinwohnen');
    expect(notification.payload.length).toBeGreaterThan(0);
    notification.payload.forEach((listing) => {
      expect(listing.id).toBeTypeOf('string');
      expect(listing.title).toBeTypeOf('string');
      expect(listing.title).not.toBe('');
      expect(listing.link).toMatch(/^https:\/\//);
      expect(listing.price).toMatch(/ €$/);
      expect(listing.size).toMatch(/ m²$/);
      expect(listing.rooms).toMatch(/ Zimmer$/);
      expect(listing.address).toContain('Berlin');
      expect(listing.image).toContain('https://inberlinwohnen.de/storage/images/apartments/');
      expect(listing.description).toContain('Gesamtmiete:');
    });

    if (process.env.TEST_MODE === 'offline') {
      expect(notification.payload).toHaveLength(1);
      expect(notification.payload[0]).toMatchObject({
        title: 'Wohnung perfekt für Altbaufans',
        link: 'https://www.degewo.de/de/properties/W1100-41909-0008-0303.html',
        price: '600.37 €',
        size: '51.04 m²',
        rooms: '2 Zimmer',
        address: 'Firlstraße 31, 12459 Berlin, Treptow-Köpenick',
        image: 'https://inberlinwohnen.de/storage/images/apartments/sample.webp',
      });
      expect(notification.payload[0].description).toContain('WBS: unbekannt');
    }
  });

  it('should fetch every server-rendered result page', async () => {
    const item = (id) =>
      `<div wire:snapshot='${JSON.stringify({ data: { item: [{ id, title: `Listing ${id}` }, { s: 'arr' }] } })}'></div>`;
    const page = (items, itemIds = null) => `<!doctype html><html><body>
      ${
        itemIds == null
          ? ''
          : `<div wire:snapshot='${JSON.stringify({ data: { itemIds: [itemIds, { s: 'arr' }], itemsPerPage: 2 } })}'></div>`
      }
      ${items.map(item).join('')}
    </body></html>`;
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => page([1, 2], [1, 2, 3, 4, 5]) })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => page([3, 4]) })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => page([5]) });

    const listings = await provider.config.getListings('https://inberlinwohnen.de/wohnungsfinder/?district=mitte');

    expect(listings).toHaveLength(5);
    expect(listings.map((listing) => JSON.parse(listing.id).data.item[0].id)).toEqual([1, 2, 3, 4, 5]);
    expect(fetchMock).toHaveBeenNthCalledWith(1, new URL('https://inberlinwohnen.de/wohnungsfinder/?district=mitte'), {
      headers: { Accept: 'text/html' },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      new URL('https://inberlinwohnen.de/wohnungsfinder/?district=mitte&page=2'),
      { headers: { Accept: 'text/html' } },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      new URL('https://inberlinwohnen.de/wohnungsfinder/?district=mitte&page=3'),
      { headers: { Accept: 'text/html' } },
    );
  });

  it('should support object snapshots and rent fallbacks', () => {
    const baseItem = {
      id: 19252,
      title: 'Fallback listing',
      deeplink: '/wohnungsfinder/fallback',
      rooms: '2,0',
      area: '51,04',
    };

    const objectListing = provider.config.normalize(snapshot({ ...baseItem, rentGross: '503,91' }, false));
    const netRentListing = provider.config.normalize(snapshot({ ...baseItem, rentNet: '428,38' }));

    expect(objectListing.price).toBe(503.91);
    expect(objectListing.link).toBe('https://inberlinwohnen.de/wohnungsfinder/fallback');
    expect(netRentListing.price).toBe(428.38);
    expect(netRentListing.id).toBe(objectListing.id);
    expect(provider.config.normalize(snapshot({ ...baseItem, deeplink: 'http://%' })).link).toBeNull();
  });

  it('should apply blacklist terms to titles and descriptions', () => {
    provider.init(providerConfig.inberlinwohnen, ['wbs']);

    expect(provider.config.filter({ title: 'Wohnung mit WBS', description: '' })).toBe(false);
    expect(provider.config.filter({ title: 'Wohnung', description: 'WBS erforderlich' })).toBe(false);
    expect(provider.config.filter({ title: 'Wohnung', description: 'Bezugsfertig' })).toBe(true);

    provider.init(providerConfig.inberlinwohnen, []);
  });

  it('should follow redirects when checking if a listing is active', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ status: 200 })
      .mockResolvedValueOnce({ status: 404 })
      .mockResolvedValueOnce({ status: 410 })
      .mockResolvedValueOnce({ status: 503 })
      .mockRejectedValueOnce(new Error('network failure'));
    globalThis.fetch = fetchMock;

    try {
      await expect(provider.config.activeTester('https://example.com/redirect')).resolves.toBe(1);
      await expect(provider.config.activeTester('https://example.com/gone')).resolves.toBe(0);
      await expect(provider.config.activeTester('https://example.com/removed')).resolves.toBe(0);
      await expect(provider.config.activeTester('https://example.com/unavailable')).resolves.toBe(-1);
      await expect(provider.config.activeTester('https://example.com/network-error')).resolves.toBe(-1);
      expect(fetchMock).toHaveBeenCalledWith('https://example.com/redirect', { redirect: 'follow' });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
