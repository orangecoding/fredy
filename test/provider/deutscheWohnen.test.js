/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterEach, expect } from 'vitest';
import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { mockFredy, providerConfig } from '../utils.js';
import { get } from '../mocks/mockNotification.js';
import * as provider from '../../lib/provider/deutscheWohnen.js';

/** Run-scoped provider config, built per test via createConfig(). */
let runConfig;

// Deutsche Wohnen uses a JSON API (fetch-based, no browser). Both tests share
// the same module-level listings so the API is only queried once.
const TEST_TIMEOUT = 120_000;

describe('#deutscheWohnen provider testsuite()', () => {
  runConfig = provider.createConfig(providerConfig.deutscheWohnen, [], []);

  let liveListings;

  it(
    'should test deutscheWohnen provider',
    async () => {
      const Fredy = await mockFredy();
      const mockedJob = {
        id: 'deutscheWohnen',
        notificationAdapter: null,
        spatialFilter: null,
        specFilter: null,
      };

      const fredy = new Fredy(runConfig, mockedJob, provider.metaInformation.id, similarityCache, undefined);

      liveListings = await fredy.execute();

      if (liveListings == null || liveListings.length === 0) {
        throw new Error('Listings is empty!');
      }

      expect(liveListings).toBeInstanceOf(Array);
      const notificationObj = get();
      expect(notificationObj).toBeTypeOf('object');
      expect(notificationObj.serviceName).toBe('deutscheWohnen');

      const hasValidNotification = notificationObj.payload.some((notify) => {
        return (
          typeof notify.id === 'string' &&
          typeof notify.price === 'string' &&
          notify.price.includes('€') &&
          typeof notify.size === 'string' &&
          notify.size.includes('m²') &&
          typeof notify.title === 'string' &&
          notify.title !== '' &&
          typeof notify.link === 'string' &&
          notify.link.includes('https://www.deutsche-wohnen.com/') &&
          typeof notify.address === 'string' &&
          notify.address !== ''
        );
      });

      expect(hasValidNotification).toBe(true);
    },
    TEST_TIMEOUT,
  );

  /**
   * The endpoint answers a `limit` above 50 with `406 Not Acceptable` and an empty body - which
   * looks exactly like being blocked, and took the provider out entirely once the cap appeared.
   */
  describe('convertWebToApi', () => {
    it('caps the page size at what the endpoint accepts', () => {
      const api = new URL(
        provider.convertWebToApi('https://www.deutsche-wohnen.com/mieten/mietangebote?city=Berlin&limit=100'),
      );

      expect(api.searchParams.get('limit')).toBe('50');
    });

    it('caps it on a pasted API url too, which is passed through otherwise', () => {
      const api = new URL(
        provider.convertWebToApi('https://www.deutsche-wohnen.com/api/deuwo-real-estate/list?city=Berlin&limit=100'),
      );

      expect(api.pathname).toBe('/api/deuwo-real-estate/list');
      expect(api.searchParams.get('limit')).toBe('50');
    });

    it('leaves a page size below the cap alone', () => {
      const api = new URL(
        provider.convertWebToApi('https://www.deutsche-wohnen.com/mieten/mietangebote?city=Berlin&limit=15'),
      );

      expect(api.searchParams.get('limit')).toBe('15');
    });
  });

  describe('getListings paging', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    /** A page of rentals in the shape the API returns them. */
    const rows = (from, count) =>
      Array.from({ length: count }, (_, index) => ({
        wrk_id: `wrk-${from + index}`,
        vermarktungsart_miete: '1',
        titel: 'Wohnung',
        preis: '900',
        groesse: '60',
        anzahl_zimmer: '2',
        slug: `slug-${from + index}`,
        plz: '10115',
        ort: 'Berlin',
      }));

    const apiUrl = () => provider.convertWebToApi('https://www.deutsche-wohnen.com/mieten/mietangebote?city=Berlin');

    /**
     * A fetch that answers the token endpoint the way Deutsche Wohnen does and hands every search
     * to `search`, so the tests below count list requests only.
     */
    const withToken = (search) => async (url, init) =>
      String(url).includes('/api/real-estate/search-token')
        ? { ok: true, json: async () => ({ token: 'token', ttl: 900 }) }
        : search(url, init);

    it('walks the pages the cap leaves behind', async () => {
      const offsets = [];
      globalThis.fetch = withToken(async (url) => {
        const offset = Number.parseInt(new URL(url).searchParams.get('offset') ?? '0', 10);
        offsets.push(offset);
        return {
          ok: true,
          json: async () => ({ paging: { info: { count: 62, limit: 50 } }, results: rows(offset, offset ? 12 : 50) }),
        };
      });

      const listings = await provider.config.getListings(apiUrl());

      expect(offsets).toEqual([0, 50]);
      expect(listings).toHaveLength(62);
    });

    it('asks for one page only when that page already holds everything', async () => {
      const offsets = [];
      globalThis.fetch = withToken(async (url) => {
        offsets.push(new URL(url).searchParams.get('offset'));
        return { ok: true, json: async () => ({ paging: { info: { count: 12, limit: 50 } }, results: rows(0, 12) }) };
      });

      await provider.config.getListings(apiUrl());

      expect(offsets).toEqual([null]);
    });

    it('stops on an empty page rather than walking until the page cap', async () => {
      let calls = 0;
      globalThis.fetch = withToken(async () => {
        calls++;
        return {
          ok: true,
          json: async () => ({ paging: { info: { count: 999, limit: 50 } }, results: calls === 1 ? rows(0, 50) : [] }),
        };
      });

      const listings = await provider.config.getListings(apiUrl());

      expect(calls).toBe(2);
      expect(listings).toHaveLength(50);
    });

    it('keeps the pages it already has when a later one fails', async () => {
      let calls = 0;
      globalThis.fetch = withToken(async () => {
        calls++;
        return calls === 1
          ? { ok: true, json: async () => ({ paging: { info: { count: 62, limit: 50 } }, results: rows(0, 50) }) }
          : { ok: false, status: 406, statusText: 'Not Acceptable' };
      });

      const listings = await provider.config.getListings(apiUrl());

      expect(listings).toHaveLength(50);
    });
  });

  /**
   * The list endpoint answers a search without a token with `401 {"error":"Unauthorized"}` - JSON
   * from the application itself rather than a bot wall. The website fetches that token from an
   * endpoint of its own and sends it along as `X-VON-Search-Token`.
   */
  describe('getListings search token', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    const TOKEN_URL = 'https://www.deutsche-wohnen.com/api/real-estate/search-token';

    const apiUrl = () => provider.convertWebToApi('https://www.deutsche-wohnen.com/mieten/mietangebote?city=Berlin');

    /** One rental, which is all a search needs to prove it got through. */
    const page = {
      paging: { info: { count: 1, limit: 50 } },
      results: [
        {
          wrk_id: 'wrk-1',
          vermarktungsart_miete: '1',
          titel: 'Wohnung',
          preis: '900',
          groesse: '60',
          anzahl_zimmer: '2',
          slug: 'slug-1',
          plz: '10115',
          ort: 'Berlin',
        },
      ],
    };

    it('sends the token the website fetches before it searches', async () => {
      globalThis.fetch = async (url, init) => {
        if (String(url) === TOKEN_URL) {
          return { ok: true, json: async () => ({ token: 'token-from-endpoint', ttl: 900 }) };
        }
        return new Headers(init?.headers).get('X-VON-Search-Token') === 'token-from-endpoint'
          ? { ok: true, json: async () => page }
          : { ok: false, status: 401, statusText: 'Unauthorized' };
      };

      const listings = await provider.config.getListings(apiUrl());

      expect(listings).toHaveLength(1);
    });

    it('still searches when the token endpoint has none to give', async () => {
      const tokensSent = [];
      globalThis.fetch = async (url, init) => {
        if (String(url) === TOKEN_URL) {
          return { ok: false, status: 404, statusText: 'Not Found' };
        }
        tokensSent.push(new Headers(init?.headers).get('X-VON-Search-Token'));
        return { ok: true, json: async () => page };
      };

      const listings = await provider.config.getListings(apiUrl());

      expect(tokensSent).toEqual([null]);
      expect(listings).toHaveLength(1);
    });
  });

  describe('with provider_details enabled', () => {
    it(
      'should enrich listings with details',
      async () => {
        if (!liveListings?.length) throw new Error('No listings from first test to enrich');

        const enriched = await runConfig.fetchDetails(liveListings[0]);

        expect(enriched).toBeTruthy();
        expect(enriched.link).toContain('https://www.deutsche-wohnen.com/');
        expect(enriched.address).toBeTypeOf('string');
        expect(enriched.address).not.toBe('');
        if (enriched.description != null) {
          expect(enriched.description).toBeTypeOf('string');
          expect(enriched.description).not.toBe('');
        }
      },
      TEST_TIMEOUT,
    );
  });
});
