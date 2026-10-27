/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Adding a listing by URL (#492). Every answer here is one the dialog explains to the user in its
 * own words, so each has to come out for exactly its own reason: "Fredy does not know this portal"
 * and "Fredy knows it but cannot read single adverts yet" ask different things of them.
 */
const root = (await import('node:path')).resolve('.');

const IMMOSCOUT_URL = 'https://www.immobilienscout24.de/expose/123456';
const CANONICAL = 'https://www.immobilienscout24.de/expose/123456';

let providers;
let jobs;
let existingRows;
let restored;
let watched;
let ingested;
let browsers;
let fetchListingByUrl;

/** A provider module as `getProviders` returns it. */
const module = (id, baseUrl, config = {}) => ({ metaInformation: { id, name: id, baseUrl }, config });

async function loadService() {
  vi.resetModules();
  restored = [];
  watched = [];
  ingested = [];
  browsers = { launched: 0, closed: 0 };

  vi.doMock(root + '/lib/utils.js', () => ({ getProviders: async () => providers }));
  vi.doMock(root + '/lib/services/extractor/puppeteerExtractor.js', () => ({
    launchBrowser: async () => {
      browsers.launched += 1;
      return { fake: 'browser' };
    },
    closeBrowser: async () => {
      browsers.closed += 1;
    },
  }));
  vi.doMock(root + '/lib/services/storage/settingsStorage.js', () => ({ getSettings: async () => ({}) }));
  vi.doMock(root + '/lib/services/storage/jobStorage.js', () => ({ getJob: (id) => jobs[id] ?? null }));
  vi.doMock(root + '/lib/services/storage/listingsStorage.js', () => ({
    getListingsByLinkForUser: (providerId, link) => existingRows.filter((row) => row.link === link),
    restoreListingsById: (ids) => restored.push(...ids),
  }));
  vi.doMock(root + '/lib/services/storage/watchListStorage.js', () => ({
    ensureWatch: (listingId, userId) => watched.push([listingId, userId]),
  }));
  vi.doMock(root + '/lib/services/tour/tourService.js', () => ({ isTourJob: (id) => id.startsWith('tour-') }));
  vi.doMock(root + '/lib/services/demo/demoService.js', () => ({ isDemoJob: (id) => id === 'demo' }));
  vi.doMock(root + '/lib/services/similarity-check/similarityCache.js', () => ({ checkAndAddEntry: () => false }));
  vi.doMock(root + '/lib/FredyPipelineExecutioner.js', () => ({
    default: class {
      constructor(config, job, providerId) {
        this.job = job;
        this.providerId = providerId;
      }
      async ingest(listings) {
        ingested.push({ jobId: this.job.id, providerId: this.providerId, listings });
        return listings.map((listing) => ({ ...listing, id: 'row-1' }));
      }
    },
  }));

  return import(root + '/lib/services/listings/manualListingService.js');
}

const OWNER = { id: 'user-1', isAdmin: false };

beforeEach(() => {
  fetchListingByUrl = vi.fn(async () => ({
    id: 'hash-1',
    link: CANONICAL,
    title: 'Altbau mit Balkon',
    price: 1200,
  }));
  providers = [
    module('immoscout', 'https://www.immobilienscout24.de/', { fetchListingByUrl, needsBrowser: false }),
    module('immowelt', 'https://www.immowelt.de/', { fetchListingByUrl }),
    module('casa', 'https://www.casa.it/'),
  ];
  jobs = {
    'job-1': { id: 'job-1', userId: 'user-1' },
    'job-other': { id: 'job-other', userId: 'user-2' },
    'tour-user-1': { id: 'tour-user-1', userId: 'user-1' },
  };
  existingRows = [];
});

describe('addListingByUrl', () => {
  it('stores the listing under the chosen job, marked as added by hand', async () => {
    const { addListingByUrl } = await loadService();
    const result = await addListingByUrl({ user: OWNER, url: IMMOSCOUT_URL, jobId: 'job-1' });

    expect(result).toEqual({ status: 'created', listingId: 'row-1', provider: 'immoscout' });
    expect(ingested).toHaveLength(1);
    expect(ingested[0].jobId).toBe('job-1');
    expect(ingested[0].providerId).toBe('immoscout');
    expect(ingested[0].listings[0]).toMatchObject({ id: 'hash-1', addedManually: true });
  });

  it('watches it when asked, and only then', async () => {
    const { addListingByUrl } = await loadService();
    await addListingByUrl({ user: OWNER, url: IMMOSCOUT_URL, jobId: 'job-1' });
    expect(watched).toEqual([]);

    await addListingByUrl({ user: OWNER, url: IMMOSCOUT_URL, jobId: 'job-1', watch: true });
    expect(watched).toEqual([['row-1', 'user-1']]);
  });

  it('starts no browser for a provider that never uses one', async () => {
    const { addListingByUrl } = await loadService();
    await addListingByUrl({ user: OWNER, url: IMMOSCOUT_URL, jobId: 'job-1' });
    expect(browsers.launched).toBe(0);
  });

  it('closes the browser it started, whatever happened', async () => {
    const { addListingByUrl } = await loadService();
    await addListingByUrl({ user: OWNER, url: 'https://www.immowelt.de/expose/abc', jobId: 'job-1' });
    expect(browsers).toEqual({ launched: 1, closed: 1 });

    fetchListingByUrl.mockRejectedValueOnce(new Error('boom'));
    const failed = await addListingByUrl({ user: OWNER, url: 'https://www.immowelt.de/expose/abc', jobId: 'job-1' });
    expect(failed.status).toBe('failed');
    expect(browsers).toEqual({ launched: 2, closed: 2 });
  });

  it('refuses a host no provider serves, including one that merely contains a portal', async () => {
    const { addListingByUrl } = await loadService();
    for (const url of ['https://example.com/expose/1', 'https://www.immobilienscout24.de.evil.example/expose/1']) {
      expect((await addListingByUrl({ user: OWNER, url, jobId: 'job-1' })).status).toBe('unknownPortal');
    }
    expect(fetchListingByUrl).not.toHaveBeenCalled();
  });

  it('says so when the portal is known but cannot be read one advert at a time', async () => {
    const { addListingByUrl } = await loadService();
    const result = await addListingByUrl({ user: OWNER, url: 'https://www.casa.it/immobili/123/', jobId: 'job-1' });
    expect(result).toEqual({ status: 'unsupported', provider: 'casa' });
  });

  it('refuses what is not a URL Fredy may fetch', async () => {
    const { addListingByUrl } = await loadService();
    for (const url of ['', 'not a url', 'http://127.0.0.1/expose/1', 'file:///etc/passwd', null]) {
      expect((await addListingByUrl({ user: OWNER, url, jobId: 'job-1' })).status).toBe('invalidUrl');
    }
  });

  it("refuses somebody else's job, a missing one and Fredy's own tour job", async () => {
    const { addListingByUrl } = await loadService();
    for (const jobId of ['job-other', 'job-missing', 'tour-user-1', undefined]) {
      expect((await addListingByUrl({ user: OWNER, url: IMMOSCOUT_URL, jobId })).status).toBe('forbidden');
    }
    expect(fetchListingByUrl).not.toHaveBeenCalled();
  });

  it("lets an admin add to anybody's job", async () => {
    const { addListingByUrl } = await loadService();
    const result = await addListingByUrl({
      user: { id: 'admin', isAdmin: true },
      url: IMMOSCOUT_URL,
      jobId: 'job-other',
    });
    expect(result.status).toBe('created');
  });

  it('says a new-build project page is one, without reading it', async () => {
    providers[0].config.isProjectUrl = (url) => url.includes('/neubau/');
    const { addListingByUrl } = await loadService();
    const result = await addListingByUrl({
      user: OWNER,
      url: 'https://www.immobilienscout24.de/neubau/mk-immobilien-gmbh/wohnanlage-berlin-lichtenrade/152187.html',
      jobId: 'job-1',
    });

    expect(result).toEqual({ status: 'project', provider: 'immoscout' });
    expect(fetchListingByUrl).not.toHaveBeenCalled();
  });

  it('answers unreadable when the page held no complete advert', async () => {
    const { addListingByUrl } = await loadService();
    for (const answer of [null, { id: 'h', link: CANONICAL }, { id: '', link: CANONICAL, title: 'x' }]) {
      fetchListingByUrl.mockResolvedValueOnce(answer);
      expect((await addListingByUrl({ user: OWNER, url: IMMOSCOUT_URL, jobId: 'job-1' })).status).toBe('unreadable');
    }
    expect(ingested).toEqual([]);
  });

  it('finds a pasted URL the user already has without asking the portal again', async () => {
    existingRows = [{ id: 'row-9', job_id: 'job-2', job_name: 'Köln', manually_deleted: 0, link: IMMOSCOUT_URL }];
    const { addListingByUrl } = await loadService();
    const result = await addListingByUrl({ user: OWNER, url: IMMOSCOUT_URL, jobId: 'job-1', watch: true });

    expect(result).toEqual({ status: 'duplicate', listingId: 'row-9', jobName: 'Köln', provider: 'immoscout' });
    expect(fetchListingByUrl).not.toHaveBeenCalled();
    expect(watched).toEqual([['row-9', 'user-1']]);
  });

  it('finds the advert again under the link the provider settled on', async () => {
    const shared = `${IMMOSCOUT_URL}?referrer=share`;
    existingRows = [{ id: 'row-9', job_id: 'job-1', job_name: 'Berlin', manually_deleted: 0, link: CANONICAL }];
    const { addListingByUrl } = await loadService();
    const result = await addListingByUrl({ user: OWNER, url: shared, jobId: 'job-1' });

    expect(result.status).toBe('duplicate');
    expect(fetchListingByUrl).toHaveBeenCalledOnce();
    expect(ingested).toEqual([]);
  });

  it('brings back a copy the user deleted from this job instead of storing it again', async () => {
    existingRows = [{ id: 'row-5', job_id: 'job-1', job_name: 'Berlin', manually_deleted: 1, link: IMMOSCOUT_URL }];
    const { addListingByUrl } = await loadService();
    const result = await addListingByUrl({ user: OWNER, url: IMMOSCOUT_URL, jobId: 'job-1' });

    expect(result).toEqual({ status: 'created', listingId: 'row-5', provider: 'immoscout' });
    expect(restored).toEqual(['row-5']);
    expect(ingested).toEqual([]);
  });

  it('ignores a copy deleted from another job', async () => {
    existingRows = [{ id: 'row-5', job_id: 'job-2', job_name: 'Köln', manually_deleted: 1, link: IMMOSCOUT_URL }];
    const { addListingByUrl } = await loadService();
    const result = await addListingByUrl({ user: OWNER, url: IMMOSCOUT_URL, jobId: 'job-1' });

    expect(result.status).toBe('created');
    expect(restored).toEqual([]);
  });

  it('runs one add per user at a time', async () => {
    let release;
    fetchListingByUrl.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ id: 'hash-1', link: CANONICAL, title: 'Altbau' });
        }),
    );
    const { addListingByUrl } = await loadService();
    const first = addListingByUrl({ user: OWNER, url: IMMOSCOUT_URL, jobId: 'job-1' });
    await vi.waitFor(() => expect(fetchListingByUrl).toHaveBeenCalledOnce());

    expect((await addListingByUrl({ user: OWNER, url: IMMOSCOUT_URL, jobId: 'job-1' })).status).toBe('busy');
    expect((await addListingByUrl({ user: { id: 'user-2' }, url: IMMOSCOUT_URL, jobId: 'job-other' })).status).toBe(
      'created',
    );

    release();
    expect((await first).status).toBe('created');
    expect((await addListingByUrl({ user: OWNER, url: IMMOSCOUT_URL, jobId: 'job-1' })).status).toBe('created');
  });
});
