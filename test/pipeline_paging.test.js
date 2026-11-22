/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockFredy } from './utils.js';
import * as mockStore from './mocks/mockStore.js';

const sleep = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock('../lib/utils.js', async (importOriginal) => ({ ...(await importOriginal()), sleep }));

/**
 * Reading more than one result page per run.
 *
 * A job reads one page unless it asks for more. The pipeline walks the pages, the provider only says
 * how page N is addressed. These tests pin down when the walk goes on and when it stops, because
 * every page past the first is a request the portal may hold against Fredy.
 */
describe('pipeline paging', () => {
  beforeEach(() => {
    mockStore.resetListings();
    mockStore.setGeocodeResult(null);
    sleep.mockClear();
  });

  /** Three adverts per page, ids unique across pages. */
  const pageOf = (page) =>
    [1, 2, 3].map((n) => ({ id: `${page}-${n}`, title: `p${page} #${n}`, link: `http://example.com/${page}/${n}` }));

  /** @param {string} url */
  const pageNumber = (url) => Number(new URL(url).searchParams.get('page'));

  /**
   * @param {{paging?: Object|null, getListings?: Function, pageUrl?: Function|null, readPages?: Function}} options
   * @returns {Promise<{urls: string[], result: any}>}
   */
  const run = async ({ paging = null, getListings, pageUrl, readPages } = {}) => {
    const Fredy = await mockFredy();
    /** @type {string[]} */
    const urls = [];
    const providerConfig = {
      url: 'http://example.com/search?page=4',
      requiredFieldNames: ['id', 'title', 'link'],
      normalize: (listing) => listing,
      filter: () => true,
      getListings: (url) => {
        urls.push(url);
        return getListings ? getListings(url) : Promise.resolve(pageOf(pageNumber(url)));
      },
    };
    if (pageUrl !== null) {
      providerConfig.pageUrl =
        pageUrl ??
        ((url, page) => {
          const next = new URL(url);
          next.searchParams.set('page', String(page));
          return next.toString();
        });
    }
    if (readPages) providerConfig.readPages = readPages;
    const fredy = new Fredy(
      providerConfig,
      { id: 'job-1', notificationAdapter: null, paging },
      'paging-provider',
      { checkAndAddEntry: () => false },
      undefined,
    );
    const result = await fredy.execute();
    return { urls, result };
  };

  it('reads one page when the job does not ask for more, through pageUrl', async () => {
    const { urls, result } = await run();

    expect(urls).toEqual(['http://example.com/search?page=1']);
    expect(result.map((listing) => listing.id)).toEqual(['1-1', '1-2', '1-3']);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('reads as many pages as the job asks for and waits before each one after the first', async () => {
    const { urls, result } = await run({ paging: { pages: 3, waitSeconds: 30, jitterSeconds: 30 } });

    expect(urls).toEqual([
      'http://example.com/search?page=1',
      'http://example.com/search?page=2',
      'http://example.com/search?page=3',
    ]);
    expect(result).toHaveLength(9);
    expect(sleep).toHaveBeenCalledTimes(2);
    for (const [ms] of sleep.mock.calls) {
      expect(ms).toBeGreaterThanOrEqual(30_000);
      expect(ms).toBeLessThanOrEqual(60_000);
    }
  });

  it('stops at a page that brings nothing', async () => {
    const { urls, result } = await run({
      paging: { pages: 5, waitSeconds: 0, jitterSeconds: 0 },
      getListings: (url) => Promise.resolve(pageNumber(url) <= 2 ? pageOf(pageNumber(url)) : []),
    });

    expect(urls).toHaveLength(3);
    expect(result).toHaveLength(6);
  });

  it('stops at a page that repeats what an earlier page brought', async () => {
    const { urls, result } = await run({
      paging: { pages: 5, waitSeconds: 0, jitterSeconds: 0 },
      getListings: (url) => Promise.resolve(pageOf(Math.min(pageNumber(url), 2))),
    });

    expect(urls).toHaveLength(3);
    expect(result.map((listing) => listing.id)).toEqual(['1-1', '1-2', '1-3', '2-1', '2-2', '2-3']);
  });

  it('keeps the pages already read when a later page fails, and does not retry it', async () => {
    const { urls, result } = await run({
      paging: { pages: 4, waitSeconds: 0, jitterSeconds: 0 },
      getListings: (url) =>
        pageNumber(url) === 2
          ? Promise.reject(new Error('429 Too Many Requests'))
          : Promise.resolve(pageOf(pageNumber(url))),
    });

    expect(urls).toHaveLength(2);
    expect(result.map((listing) => listing.id)).toEqual(['1-1', '1-2', '1-3']);
  });

  it('fails the run as before when the first page fails', async () => {
    const { result } = await run({
      paging: { pages: 3, waitSeconds: 0, jitterSeconds: 0 },
      getListings: () => Promise.reject(new Error('boom')),
    });

    expect(result).toBeUndefined();
  });

  it('reads one page of a provider that cannot address a page, whatever the job asks for', async () => {
    const { urls } = await run({ paging: { pages: 3, waitSeconds: 0, jitterSeconds: 0 }, pageUrl: null });

    expect(urls).toEqual(['http://example.com/search?page=4']);
  });

  it('pulls pages from readPages and closes it after the last page the job asked for', async () => {
    let closed = false;
    let pulled = 0;
    const { result } = await run({
      paging: { pages: 2, waitSeconds: 0, jitterSeconds: 0 },
      pageUrl: null,
      readPages: async function* () {
        try {
          for (let page = 1; page <= 5; page++) {
            pulled++;
            yield pageOf(page);
          }
        } finally {
          closed = true;
        }
      },
    });

    expect(pulled).toBe(2);
    expect(closed).toBe(true);
    expect(result).toHaveLength(6);
  });
});
