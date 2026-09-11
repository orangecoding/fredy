/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../../lib/provider/idealista.js';
import { call, forgetToken, resetPacing } from '../../lib/services/idealista/mobile-api.js';
import { resetSearchMemory } from '../../lib/services/idealista/search.js';
import { PORTALS } from '../../lib/services/idealista/portal.js';
import { fetchSearchHtml } from '../../lib/services/idealista/idealistaSearch.js';

vi.mock('../../lib/services/idealista/device-id.js', () => ({ idealistaDeviceId: async () => '0123456789abcdef' }));
vi.mock('../../lib/services/idealista/idealistaSearch.js', () => ({ fetchSearchHtml: vi.fn() }));

const SEARCH_URL = 'https://www.idealista.it/affitto-case/roma-roma/';
const IT = PORTALS['idealista.it'];
const json = (body) => new Response(JSON.stringify(body));
const parsed = {
  target: 'listing',
  filter: { operation: 'rent', propertyType: 'homes', locationIds: ['0-EU-IT-RM-01-001-097'] },
};
const failures = {
  network: () => Promise.reject(new TypeError('fetch failed')),
  json: () => Promise.resolve(new Response('{')),
  http: () => Promise.resolve(new Response('', { status: 500 })),
  payload: () => Promise.resolve(json({ error: 'temporarily unavailable' })),
};

/**
 * @param {(body: URLSearchParams) => Promise<Response>|Response} page
 * @param {object} [parserResponse]
 * @returns {ReturnType<typeof vi.fn>}
 */
function serve(page, parserResponse = parsed) {
  const fetchMock = vi.fn((url, options) => {
    if (String(url).includes('/oauth/token')) return Promise.resolve(json({ access_token: 'token', expires_in: 3600 }));
    if (String(url).includes('/deeplinks/')) return Promise.resolve(json(parserResponse));
    return page(new URLSearchParams(options.body));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  resetPacing();
  forgetToken();
  resetSearchMemory();
  fetchSearchHtml.mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Idealista rental filters', () => {
  it.each([
    ['affitto-lungo-termine', ['longTerm']],
    ['affitto-transitorio', ['seasonal']],
    ['affitto-lungo-termine,affitto-transitorio', ['longTerm', 'seasonal']],
  ])('preserves %s in the search request', async (slug, rentalUsages) => {
    const bodies = [];
    serve(
      (body) => {
        bodies.push(body);
        return json({ elementList: [], totalPages: 0 });
      },
      { ...parsed, filter: { ...parsed.filter, rentalUsages } },
    );

    const pending = expect(config.getListings(`${SEARCH_URL}con-${slug}/`, {})).resolves.toEqual([]);
    await vi.runAllTimersAsync();
    await pending;
    expect(bodies).toHaveLength(1);
    expect(bodies[0].get('rentalUsages')).toBe(rentalUsages.join(','));
    expect(bodies[0].get('operation')).toBe('rent');
    expect(fetchSearchHtml).not.toHaveBeenCalled();
  });
});

describe('Idealista interrupted searches', () => {
  it.each(Object.keys(failures))('uses the browser fallback after a first-page %s failure', async (kind) => {
    serve(failures[kind]);
    const browser = {};

    const pending = expect(config.getListings(SEARCH_URL, browser)).resolves.toEqual([]);
    await vi.runAllTimersAsync();
    await pending;
    expect(fetchSearchHtml).toHaveBeenCalledWith(SEARCH_URL, browser);
  });

  it.each(Object.keys(failures))('retains page one and retries the full catch-up after a %s failure', async (kind) => {
    let interrupted = true;
    const listings = Array.from({ length: 250 }, (_, index) => ({ propertyCode: String(index) }));
    serve((body) => {
      const page = Number(body.get('numPage'));
      if (interrupted && page === 2) return failures[kind]();
      return json({ elementList: listings.slice((page - 1) * 50, page * 50), totalPages: 5 });
    });

    let pending = expect(config.getListings(SEARCH_URL, {})).resolves.toEqual(listings.slice(0, 50));
    await vi.runAllTimersAsync();
    await pending;
    expect(fetchSearchHtml).not.toHaveBeenCalled();

    interrupted = false;
    pending = expect(config.getListings(SEARCH_URL, {})).resolves.toEqual(listings);
    await vi.runAllTimersAsync();
    await pending;

    pending = expect(config.getListings(SEARCH_URL, {})).resolves.toEqual(listings.slice(0, 150));
    await vi.runAllTimersAsync();
    await pending;
  });

  it('retains completed variants when a later variant fails', async () => {
    const listings = [{ propertyCode: 'penthouse' }];
    serve((body) => (body.has('penthouse') ? json({ elementList: listings, totalPages: 1 }) : failures.http()), {
      ...parsed,
      filter: { ...parsed.filter, penthouse: true, studio: true },
    });

    const pending = expect(config.getListings(SEARCH_URL, {})).resolves.toEqual(listings);
    await vi.runAllTimersAsync();
    await pending;
    expect(fetchSearchHtml).not.toHaveBeenCalled();
  });
});

describe('Idealista token endpoint backoff', () => {
  it.each([407, 429])('backs off on HTTP %i and recovers after the pause', async (status) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status }));
    vi.stubGlobal('fetch', fetchMock);

    const refusal = expect(call(IT, '/api/3.5/it/search')).rejects.toMatchObject({ httpStatus: status });
    await vi.runAllTimersAsync();
    await refusal;
    await expect(call(IT, '/api/3.5/it/search')).rejects.toThrow(/silent/);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(15 * 60_000);
    fetchMock
      .mockResolvedValueOnce(json({ access_token: 'token', expires_in: 3600 }))
      .mockResolvedValue(json({ elementList: [] }));
    const resumed = expect(call(IT, '/api/3.5/it/search')).resolves.toEqual({ elementList: [] });
    await vi.runAllTimersAsync();
    await resumed;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('keeps the refusal status when its body cannot be read', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => {
        throw new Error('body lost');
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    const refusal = expect(call(IT, '/api/3.5/it/search')).rejects.toMatchObject({ httpStatus: 429 });
    await vi.runAllTimersAsync();
    await refusal;
    await expect(call(IT, '/api/3.5/it/search')).rejects.toThrow(/silent/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('backs off after repeated token connection failures', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    vi.stubGlobal('fetch', fetchMock);
    for (let attempt = 0; attempt < 3; attempt++) {
      const refused = expect(call(IT, '/api/3.5/it/search')).rejects.toThrow('fetch failed');
      await vi.runAllTimersAsync();
      await refused;
    }
    await expect(call(IT, '/api/3.5/it/search')).rejects.toThrow(/silent/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([407, 429])('backs off on API HTTP %i with a cached token and an unreadable body', async (status) => {
    const fetchMock = serve(() => json({ elementList: [] }));
    const first = expect(call(IT, '/api/3.5/it/search')).resolves.toEqual({ elementList: [] });
    await vi.runAllTimersAsync();
    await first;
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockResolvedValue({
      ok: false,
      status,
      text: async () => {
        throw new Error('body lost');
      },
    });
    const refusal = expect(call(IT, '/api/3.5/it/search')).rejects.toMatchObject({ httpStatus: status });
    await vi.runAllTimersAsync();
    await refusal;
    await expect(call(IT, '/api/3.5/it/search')).rejects.toThrow(/silent/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
