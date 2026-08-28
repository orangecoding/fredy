/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { expect, vi } from 'vitest';
import { providerConfig } from '../utils.js';
import * as provider from '../../lib/provider/inberlinwohnen.js';
import { buildHash } from '../../lib/utils.js';

/** Run-scoped provider config, built per test via createConfig(). */
let runConfig;

// The portal is a Livewire app, so all listing data lives in `wire:snapshot`
// attributes instead of markup. Every test here drives the provider with an
// injected page extractor, which means no browser and no network is involved.
const SEARCH_URL = providerConfig.inberlinwohnen.url;
const browser = { id: 'test-browser' };

const listingSnapshot = (item, tuple = true) => JSON.stringify({ data: { item: tuple ? [item, { s: 'arr' }] : item } });

const listingElement = (id) =>
  `<div wire:snapshot='${listingSnapshot({ id, title: `Listing ${id}`, deeplink: `/listing/${id}` })}'></div>`;

const paginationElement = (itemIds, itemsPerPage) =>
  `<div wire:snapshot='${JSON.stringify({ data: { itemIds: [itemIds, { s: 'arr' }], itemsPerPage } })}'></div>`;

const resultPage = (ids, pagination = null) =>
  `<!doctype html><html><body>${pagination ?? ''}${ids.map(listingElement).join('')}</body></html>`;

describe('#inberlinwohnen internals()', () => {
  beforeEach(() => {
    runConfig = provider.createConfig(providerConfig.inberlinwohnen, []);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createConfig()', () => {
    it.each([
      ['/mein-bereich/wohnungsfinder', '/wohnungsfinder/'],
      ['/mein-bereich/wohnungsfinder/', '/wohnungsfinder/'],
    ])('should replace the saved private search path %s', (privatePath, publicPath) => {
      const privateUrl = `https://www.inberlinwohnen.de${privatePath}?q=opaque-filter&district=mitte`;

      const privateRunConfig = provider.createConfig({ url: privateUrl, enabled: true }, []);

      expect(privateRunConfig.url).toBe(`https://www.inberlinwohnen.de${publicPath}?q=opaque-filter&district=mitte`);
    });

    it('should leave public search URLs unchanged', () => {
      const publicUrl = 'https://www.inberlinwohnen.de/wohnungsfinder/?q=opaque-filter&district=mitte';

      expect(provider.createConfig({ url: publicUrl, enabled: true }, []).url).toBe(publicUrl);
    });
  });

  describe('getListings()', () => {
    it('should fetch every server-rendered result page', async () => {
      const pagination = paginationElement([1, 2, 3, 4, 5], 2);
      const extractPage = vi
        .fn()
        .mockResolvedValueOnce(resultPage([1, 2], pagination))
        .mockResolvedValueOnce(resultPage([3, 4]))
        .mockResolvedValueOnce(resultPage([5]));

      const listings = await runConfig.getListings(
        'https://inberlinwohnen.de/wohnungsfinder/?district=mitte&page=9',
        browser,
        extractPage,
      );

      expect(listings).toHaveLength(5);
      expect(listings.map((listing) => JSON.parse(listing.id).data.item[0].id)).toEqual([1, 2, 3, 4, 5]);
      // the page parameter of the configured url must not leak into the crawl
      [1, 2, 3].forEach((page) => {
        expect(extractPage).toHaveBeenNthCalledWith(
          page,
          `https://inberlinwohnen.de/wohnungsfinder/?district=mitte&page=${page}`,
          'body',
          { browser, name: 'inberlinwohnen' },
        );
      });
    });

    it('should deduplicate listings repeated across page boundaries', async () => {
      const extractPage = vi
        .fn()
        .mockResolvedValueOnce(resultPage([1, 2], paginationElement([1, 2, 3], 2)))
        .mockResolvedValueOnce(resultPage([2, 3]));

      const listings = await runConfig.getListings(SEARCH_URL, browser, extractPage);

      expect(listings.map((listing) => JSON.parse(listing.id).data.item[0].id)).toEqual([1, 2, 3]);
    });

    it('should accept a recognized search without any results', async () => {
      const extractPage = vi.fn().mockResolvedValue(resultPage([], paginationElement([], 10)));

      await expect(runConfig.getListings(SEARCH_URL, browser, extractPage)).resolves.toEqual([]);
    });

    it('should reject pages without recognizable Livewire search data', async () => {
      const unrelatedSnapshot = `<div wire:snapshot='${listingSnapshot({ id: 'unrelated' })}'></div>`;
      const extractPage = vi.fn().mockResolvedValue(`${paginationElement([1], 10)}${unrelatedSnapshot}`);

      await expect(runConfig.getListings(SEARCH_URL, browser, extractPage)).rejects.toThrow(
        'contained 0 of 1 expected listings',
      );
    });

    it('should reject a later page that omits expected listings', async () => {
      const pagination = paginationElement([1, 2], 1);
      const extractPage = vi
        .fn()
        .mockResolvedValueOnce(resultPage([1], pagination))
        .mockResolvedValueOnce(pagination);

      await expect(runConfig.getListings(SEARCH_URL, browser, extractPage)).rejects.toThrow(
        'page 2 contained 0 of 1 expected listings',
      );
    });

    it('should reject browser failures and excessive pagination', async () => {
      await expect(runConfig.getListings(SEARCH_URL, browser, vi.fn().mockResolvedValue(null))).rejects.toThrow(
        'could not be loaded',
      );

      const tooManyPages = resultPage(
        [1],
        paginationElement(
          Array.from({ length: 101 }, (_, index) => index),
          1,
        ),
      );
      await expect(runConfig.getListings(SEARCH_URL, browser, vi.fn().mockResolvedValue(tooManyPages))).rejects.toThrow(
        'exceeding the safety limit',
      );
    });
  });

  describe('normalize()', () => {
    const baseItem = {
      id: 19252,
      title: 'Fallback listing',
      deeplink: '/wohnungsfinder/fallback',
      rooms: '2,0',
      area: '51,04',
    };
    const normalize = (item, tuple = true) => runConfig.normalize({ id: listingSnapshot(item, tuple) });

    it('should support object snapshots and rent fallbacks', () => {
      const objectListing = normalize({ ...baseItem, rentGross: '503,91' }, false);
      const netRentListing = normalize({ ...baseItem, rentNet: '428,38' });

      expect(objectListing.price).toBe(503.91);
      expect(objectListing.link).toBe('https://inberlinwohnen.de/wohnungsfinder/fallback');
      expect(netRentListing.price).toBe(428.38);
      expect(netRentListing.id).toBe(objectListing.id);
    });

    it('should quote the cold rent when the listing publishes both', () => {
      // The affordability check adds the Nebenkosten surcharge to `price` itself, so a listing
      // carrying both figures has to hand over the Kaltmiete - quoting the Gesamtmiete counted the
      // Nebenkosten twice. The Gesamtmiete stays in the description, where it costs nothing.
      const listing = normalize({ ...baseItem, rentNet: '800', extraCosts: '183', rentGross: '983,08' });

      expect(listing.price).toBe(800);
      expect(listing.description).toContain('Kaltmiete: 800 €');
      expect(listing.description).toContain('Gesamtmiete: 983,08 €');
    });

    it('should reject links that do not point at the portal or a known partner', () => {
      expect(normalize({ ...baseItem, deeplink: 'http://%' }).link).toBeNull();
      expect(normalize({ ...baseItem, deeplink: 'javascript:alert(1)' }).link).toBeNull();
      expect(normalize({ ...baseItem, deeplink: 'https://example.com/listing/1' }).link).toBeNull();
    });

    it('should prefer the partner object id so ids survive portal side re-imports', () => {
      expect(normalize({ ...baseItem, id: 100, objectId: 'partner-42' }).id).toBe(buildHash('partner-42'));
    });
  });

  describe('fetchDetails()', () => {
    it.each([
      ['berlinovo.de', '<div class="field--name-field-description">Helle Wohnung mit Einbauküche und Balkon.</div>'],
      [
        'www.degewo.de',
        '<section id="section-description"><div class="c-copy">Ruhige Wohnung im obersten Geschoss.</div></section>',
      ],
      [
        'www.gesobau.de',
        '<div class="immoContent"><div class="immoMainContent"><p>Wohnung mit Serviceangeboten für Seniorinnen und Senioren.</p></div></div>',
      ],
      [
        'www.gewobag.de',
        '<div class="details-description"><h2 id="objektbeschreibung"></h2><p>Neubauwohnung mit Balkon und Fußbodenheizung.</p></div>',
      ],
      [
        'www.howoge.de',
        '<main><div class="section"><strong>Beschreibung</strong><p class="readmore__wrap">Drei Zimmer mit Balkon und modernem Bad.</p></div></main>',
      ],
      ['www.wbm.de', '<div class="openimmo-detail__intro-text">Gut geschnittene Wohnung mit hellen Wohnräumen.</div>'],
    ])('should enrich detail descriptions from %s', async (hostname, html) => {
      const extractDetails = vi.fn().mockResolvedValue(html);
      const listing = { id: 'listing-1', link: `https://${hostname}/listing/1`, description: 'Gesamtmiete: 600 €' };

      const enriched = await runConfig.fetchDetails(listing, browser, extractDetails);

      expect(enriched.description).toContain('Gesamtmiete: 600 €');
      expect(enriched.description).not.toBe(listing.description);
      expect(extractDetails).toHaveBeenCalledWith(listing.link, null, expect.objectContaining({ browser }));
    });

    it('should preserve listings when detail enrichment is unsupported or unavailable', async () => {
      const unsupported = { id: '1', link: 'https://example.com/listing/1', description: 'Original' };
      expect(await runConfig.fetchDetails(unsupported, browser)).toBe(unsupported);

      const supported = { ...unsupported, link: 'https://www.degewo.de/listing/1' };
      const extractDetails = vi.fn().mockResolvedValue(null);
      expect(await runConfig.fetchDetails(supported, browser, extractDetails)).toBe(supported);

      // stadtundland renders its exposes client side, so no selector is known
      const stadtUndLand = { ...unsupported, link: 'https://stadtundland.de/wohnungssuche/1' };
      expect(await runConfig.fetchDetails(stadtUndLand, browser, extractDetails)).toBe(stadtUndLand);
    });
  });

  describe('filter()', () => {
    it('should apply blacklist terms to titles and descriptions', () => {
      runConfig = provider.createConfig(providerConfig.inberlinwohnen, ['wbs']);

      expect(runConfig.filter({ title: 'Wohnung mit WBS', description: '' })).toBe(false);
      expect(runConfig.filter({ title: 'Wohnung', description: 'WBS erforderlich' })).toBe(false);
      expect(runConfig.filter({ title: 'Wohnung', description: 'Bezugsfertig' })).toBe(true);
    });
  });

  describe('activityProbe()', () => {
    it('should follow safe redirects when checking if a listing is active', async () => {
      const originalFetch = globalThis.fetch;
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({ status: 302, headers: new Headers({ location: '/properties/new.html' }) })
        .mockResolvedValueOnce({ status: 200 })
        .mockResolvedValueOnce({ status: 404 })
        .mockResolvedValueOnce({ status: 410 })
        .mockResolvedValueOnce({ status: 503 })
        .mockRejectedValueOnce(new Error('network failure'));
      globalThis.fetch = fetchMock;

      try {
        await expect(runConfig.activityProbe('https://www.degewo.de/redirect')).resolves.toBe(1);
        await expect(runConfig.activityProbe('https://www.degewo.de/gone')).resolves.toBe(0);
        await expect(runConfig.activityProbe('https://www.degewo.de/removed')).resolves.toBe(0);
        await expect(runConfig.activityProbe('https://www.degewo.de/unavailable')).resolves.toBe(-1);
        await expect(runConfig.activityProbe('https://www.degewo.de/network-error')).resolves.toBe(-1);
        // hosts outside of the portal and its partners must never be requested
        await expect(runConfig.activityProbe('http://127.0.0.1/private')).resolves.toBe(-1);

        expect(fetchMock).toHaveBeenNthCalledWith(
          1,
          'https://www.degewo.de/redirect',
          expect.objectContaining({ redirect: 'manual', signal: expect.any(AbortSignal) }),
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
          2,
          'https://www.degewo.de/properties/new.html',
          expect.objectContaining({ redirect: 'manual', signal: expect.any(AbortSignal) }),
        );
        expect(fetchMock).toHaveBeenCalledTimes(6);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
