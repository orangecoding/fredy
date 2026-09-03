/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';
import { describe, expect, it } from 'vitest';
import { extractField, parse } from '../../lib/services/extractor/parser/parser.js';
import { extractNumber } from '../../lib/utils/extract-number.js';
import { getProviders } from '../../lib/utils.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'testFixtures');
const testProviderConfig = JSON.parse(
  fs.readFileSync(path.join(FIXTURES, '..', 'provider', 'testProvider.json'), 'utf8'),
);

/**
 * The price each provider's detail fixture must yield.
 *
 * Pinned rather than merely "some positive number" because the failure this suite exists to catch
 * is a *plausible* wrong number - reading Warmmiete where the list shows Kaltmiete, or parsing an
 * English-decimal "1600.00" with the German parser and getting 160000. Both produce a healthy
 * looking price that is silently wrong for every listing of that provider.
 * @type {Record<string, number>}
 */
const EXPECTED_DETAIL_PRICE = {
  deutscheWohnen: 692,
  engelVoelkers: 24900000,
  imaxx: 526000,
  immobilienDe: 395,
  immowelt: 1250,
  kleinanzeigen: 195000,
  schwarzesbrett: 560,
  sparkasse: 410000,
  wgGesucht: 590,
};

/**
 * Providers whose search results are not produced by the generic container/field parser, so their
 * list prices have to be read the way their own `getListings` does.
 * @type {Record<string, () => number[]>}
 */
const CUSTOM_LIST_PRICES = {
  engelVoelkers: () => {
    const nextData = readNextData(fs.readFileSync(path.join(FIXTURES, 'engelVoelkers.html'), 'utf8'));
    const queries = nextData?.props?.pageProps?.dehydratedState?.queries ?? [];
    const listings = queries.find((query) => query?.queryKey?.[0] === 'listings')?.state?.data?.listings ?? [];
    return listings
      .map(
        (entry) =>
          providerModule('engelVoelkers').config.normalize(
            entry.listing,
            'https://www.engelvoelkers.com/de/propertysearch',
          )?.price,
      )
      .filter((price) => price != null);
  },
  deutscheWohnen: () => {
    const body = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'deutscheWohnen_list.json'), 'utf8'));
    return (body.results ?? [])
      .filter((item) => item.vermarktungsart_miete === '1')
      .map((item) => providerModule('deutscheWohnen').config.normalize({ id: item.wrk_id, price: item.preis })?.price)
      .filter((price) => price != null);
  },
  immowelt: () => {
    const classifieds = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'immowelt_classifieds.json'), 'utf8'));
    return classifieds.map((entry) => providerModule('immowelt').config.normalize(entry)?.price).filter(Boolean);
  },
  immobilienDe: () => {
    const provider = providerModule('immobilienDe');
    const listings = provider.parseListings(fs.readFileSync(path.join(FIXTURES, 'immobilienDe.html'), 'utf8')) ?? [];
    return listings.map((entry) => provider.config.normalize(entry)?.price).filter((price) => price != null);
  },
};

/** @type {Map<string, any>} */
let providersById;

/**
 * @param {string} id
 * @returns {any}
 */
function providerModule(id) {
  return providersById.get(id);
}

/**
 * @param {string} html
 * @returns {any|null}
 */
function readNextData(html) {
  const raw = cheerio.load(html)('#__NEXT_DATA__').text();
  return raw ? JSON.parse(raw) : null;
}

/**
 * Run a provider's price extractor over a page, the same way the price probe does.
 *
 * @param {any} provider
 * @param {string} html
 * @returns {number|null}
 */
function readDetailPrice(provider, html) {
  const priceTracking = provider.config.priceTracking;
  const raw = priceTracking.extract
    ? priceTracking.extract(html, { id: 'x', link: 'x', provider: 'x' })
    : extractField(cheerio.load(html).root(), priceTracking.selector);
  if (raw == null) return null;
  const value = typeof raw === 'number' ? raw : extractNumber(String(raw));
  return value == null ? null : Math.round(value);
}

/**
 * Every price the provider's search-results fixture yields, normalized.
 *
 * @param {string} id
 * @param {any} provider
 * @returns {number[]}
 */
function readListPrices(id, provider) {
  if (CUSTOM_LIST_PRICES[id]) return CUSTOM_LIST_PRICES[id]().map((price) => Math.round(price));
  const config = provider.createConfig(testProviderConfig[id] ?? { url: 'https://example.org' }, []);
  const html = fs.readFileSync(path.join(FIXTURES, `${id}.html`), 'utf8');
  const items = parse(config.crawlContainer, config.crawlFields, html, 'fixture') ?? [];
  return items
    .map((item) => config.normalize(item)?.price)
    .filter((price) => price != null)
    .map((price) => Math.round(price));
}

describe('#price tracking extractors', () => {
  beforeAll(async () => {
    providersById = new Map((await getProviders()).map((provider) => [provider.metaInformation.id, provider]));
  });

  it('only declares priceTracking with exactly one way to read a price', () => {
    for (const [id, provider] of providersById) {
      const priceTracking = provider.config.priceTracking;
      if (priceTracking == null) continue;
      const ways = ['selector', 'extract', 'probe'].filter((key) => priceTracking[key] != null);
      expect(ways, `${id} must declare exactly one of selector/extract/probe`).toHaveLength(1);
    }
  });

  for (const [id, expected] of Object.entries(EXPECTED_DETAIL_PRICE)) {
    describe(id, () => {
      it('reads the expected price off the detail fixture', () => {
        const provider = providerModule(id);
        expect(provider.config.priceTracking, `${id} has no priceTracking config`).toBeDefined();
        const html = fs.readFileSync(path.join(FIXTURES, `${id}_detail.html`), 'utf8');
        expect(readDetailPrice(provider, html)).toBe(expected);
      });

      // The point of the whole suite. A detail extractor that reads a different field than the
      // search list does is not a broken feature, it is a feature that invents a price change for
      // every listing this provider has, all on the same run.
      it('agrees with the price the search list reports for the same listing', () => {
        const provider = providerModule(id);
        expect(readListPrices(id, provider)).toContain(expected);
      });

      it('returns null rather than zero for a page it cannot read', () => {
        const provider = providerModule(id);
        expect(readDetailPrice(provider, '<html><body>nothing here</body></html>')).toBeNull();
      });
    });
  }

  // Immoscout reads its price from the mobile API rather than a rendered page, so it is driven
  // through `probe` and cannot share the fixture-based cases above.
  describe('immoscout', () => {
    const detailBody = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'immoscout_detail.json'), 'utf8'));
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('reads the headline price, not the Warmmiete sitting next to it', async () => {
      globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => detailBody });
      const price = await providerModule('immoscout').config.priceTracking.probe({
        link: 'https://www.immobilienscout24.de/expose/123456',
      });
      // The exposé also carries "2.780 €" as Warmmiete; picking that one would report a fabricated
      // 20% increase for every Immoscout rental at once.
      expect(extractNumber(String(price))).toBe(2300);
    });

    it('agrees with the price the search list reports', () => {
      const listBody = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'immoscout_list.json'), 'utf8'));
      const prices = (listBody.resultListItems ?? [])
        .filter((item) => item.type === 'EXPOSE_RESULT')
        .map((item) => (item.item?.attributes ?? []).find((attribute) => /€/.test(attribute?.value ?? ''))?.value)
        .filter(Boolean)
        .map((value) => extractNumber(value));
      expect(prices).toContain(2300);
    });

    it('returns null when the API refuses to answer', async () => {
      globalThis.fetch = async () => ({ ok: false, status: 403, statusText: 'Forbidden' });
      const price = await providerModule('immoscout').config.priceTracking.probe({
        link: 'https://www.immobilienscout24.de/expose/123456',
      });
      expect(price).toBeNull();
    });
  });
});
