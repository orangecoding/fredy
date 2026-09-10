/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const root = (await import('node:path')).resolve('.');

const DEVICE_ID = 'device-under-test';

/** A response double in the shape the tracking endpoint answers with. */
const jsonResponse = (body, { ok = true, status = 200 } = {}) => ({
  ok,
  status,
  json: async () => body,
});

const ACCEPTED = () => jsonResponse({ status: 'ok', stored: true, band: '500-1000' });

/**
 * What `getListingsKpisForJobIds` hands back for one job.
 *
 * @param {Object} [overrides]
 * @param {number|null} [overrides.perSqm] `null` stands for a job with no measured listing.
 * @returns {Object}
 */
const kpisFor = ({ perSqm = 14.2, sampleSize = 47, total = 1180, dealType = 'rent' } = {}) => ({
  numberOfActiveListings: sampleSize,
  medianPriceOfListings: total,
  medianPricePerSqm: perSqm == null ? null : { dealType, value: perSqm, sampleSize },
});

/** A provider module double declaring the plainest possible price range params. */
const PORTAL = {
  metaInformation: { id: 'portal' },
  config: { priceRangeParams: { min: 'priceMin', max: 'priceMax' } },
};

/** A job the way `getJobs()` hydrates it. */
const jobWith = ({ id = 'job-1', dealType = 'rent', specFilter = null, url = 'https://portal.example/s' } = {}) => ({
  id,
  dealType,
  specFilter,
  provider: [{ id: 'portal', url }],
  notificationAdapter: [{ id: 'slack' }],
});

describe('services/tracking - price observation', () => {
  let fetchMock;
  let kpiMock;

  /**
   * Import a fresh Tracker with the outside world replaced.
   *
   * @param {Object} [options]
   * @param {boolean} [options.analyticsEnabled] The opt-out the existing tracking calls respect.
   * @param {Object} [options.kpi] What the storage reports for the job under test.
   * @param {Function} [options.respondWith] Produces the response for each request.
   * @param {Object[]} [options.jobs] What `getJobs()` returns, for the main-event path.
   * @returns {Promise<Object>} The Tracker module.
   */
  async function loadTracker({
    analyticsEnabled = true,
    kpi = kpisFor(),
    respondWith = ACCEPTED,
    jobs = [jobWith()],
  } = {}) {
    kpiMock = vi.fn(() => kpi);
    fetchMock = vi.fn(async () => respondWith());

    vi.resetModules();
    vi.doMock('node-fetch', () => ({ default: fetchMock }));
    vi.doMock(root + '/lib/services/storage/listingsStorage.js', () => ({
      getListingsKpisForJobIds: kpiMock,
    }));
    vi.doMock(root + '/lib/services/storage/jobStorage.js', () => ({
      getJobs: () => jobs,
    }));
    vi.doMock(root + '/lib/services/storage/settingsStorage.js', () => ({
      getSettings: async () => ({ analyticsEnabled, demoMode: false }),
    }));
    vi.doMock(root + '/lib/services/tracking/uniqueId.js', () => ({ getUniqueId: () => DEVICE_ID }));
    vi.doMock(root + '/lib/services/logger.js', () => ({
      default: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    }));
    const utils = await vi.importActual(root + '/lib/utils.js');
    vi.doMock(root + '/lib/utils.js', () => ({
      ...utils,
      // The tracking calls stay silent in development; the tests are interested in what a
      // production instance would send.
      inDevMode: () => false,
      getPackageVersion: async () => '0.0.0-test',
      // The real loader imports all 19 provider modules. Their actual declarations are checked
      // against real search URLs in priceRange.test.js; here one stand-in portal is enough.
      getProviders: async () => [PORTAL],
    }));

    return import(root + '/lib/services/tracking/Tracker.js');
  }

  /** Every request that went to `/tracking/price`, with its body parsed. */
  const priceRequests = () =>
    fetchMock.mock.calls
      .filter(([url]) => String(url).endsWith('/price'))
      .map(([url, init]) => ({ url, body: JSON.parse(init.body) }));

  /** Report one job and hand back the single payload that produced. */
  const reportOne = async (job, options) => {
    const { trackJobPriceObservation } = await loadTracker(options);
    await trackJobPriceObservation(job, [PORTAL]);
    return priceRequests()[0]?.body;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('posts the observation to /tracking/price on the same host as the other calls', async () => {
    const { trackJobPriceObservation } = await loadTracker();

    await trackJobPriceObservation(jobWith(), [PORTAL]);

    const [request] = priceRequests();
    expect(request.url).toBe('https://fredy.orange-coding.net/tracking/price');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(request.body).toMatchObject({
      category: 'fredy',
      device_id: DEVICE_ID,
      median_price: 14.2,
      median_price_total: 1180,
      sample_size: 47,
    });
  });

  describe('the price range', () => {
    const url = (query) => `https://portal.example/s?${query}`;

    it('comes from the provider URL when it is there', async () => {
      const body = await reportOne(jobWith({ url: url('priceMin=500&priceMax=1000') }));
      expect(body).toMatchObject({ price_min: 500, price_max: 1000 });
    });

    it('completes a half-open URL range from the Fredy filter', async () => {
      const body = await reportOne(jobWith({ url: url('priceMin=500'), specFilter: { maxPrice: 1200 } }));
      expect(body).toMatchObject({ price_min: 500, price_max: 1200 });
    });

    it('falls back to the Fredy filter when the URL carries no price', async () => {
      const body = await reportOne(jobWith({ url: url(''), specFilter: { maxPrice: 1200 } }));
      expect(body).toMatchObject({ price_min: null, price_max: 1200 });
    });

    it('is both null when neither the URL nor Fredy has a bound', async () => {
      const body = await reportOne(jobWith({ url: url('') }));
      expect(body).toMatchObject({ price_min: null, price_max: null });
    });

    it('never sends 0 or a negative as a bound', async () => {
      const body = await reportOne(jobWith({ url: url('priceMin=0&priceMax=-1') }));
      expect(body).toMatchObject({ price_min: null, price_max: null });
    });
  });

  describe('job type', () => {
    it('reports a rent job as "rent"', async () => {
      const body = await reportOne(jobWith({ dealType: 'rent' }), { kpi: kpisFor({ dealType: 'rent' }) });
      expect(body.job_type).toBe('rent');
    });

    it('reports a buy job as "buy"', async () => {
      const body = await reportOne(jobWith({ dealType: 'buy' }), {
        kpi: kpisFor({ dealType: 'buy', perSqm: 4800, total: 420000 }),
      });
      expect(body.job_type).toBe('buy');
    });

    it('sends nothing for a job whose deal type was never decided', async () => {
      expect(await reportOne(jobWith({ dealType: null }))).toBeUndefined();
    });
  });

  it('reports the median over this job only, so it follows the user price filter', async () => {
    const { trackJobPriceObservation } = await loadTracker();

    await trackJobPriceObservation(jobWith({ id: 'job-42' }), [PORTAL]);

    expect(kpiMock).toHaveBeenCalledWith(['job-42']);
  });

  it('sends nothing when the job has no measured listing', async () => {
    await reportOne(jobWith(), { kpi: kpisFor({ perSqm: null }) });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends nothing when the user opted out of analytics', async () => {
    await reportOne(jobWith(), { analyticsEnabled: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('leaves the total price out rather than sending a bogus 0', async () => {
    const body = await reportOne(jobWith(), { kpi: kpisFor({ total: 0 }) });
    expect(body).not.toHaveProperty('median_price_total');
  });

  describe('riding along with the main event', () => {
    it('reports every job once, after the main payload', async () => {
      const jobs = [jobWith({ id: 'job-1' }), jobWith({ id: 'job-2' }), jobWith({ id: 'job-3' })];
      const { trackMainEvent } = await loadTracker({ jobs });

      await trackMainEvent();

      const endpoints = fetchMock.mock.calls.map(([url]) => new URL(String(url)).pathname);
      expect(endpoints).toEqual(['/tracking/main', '/tracking/price', '/tracking/price', '/tracking/price']);
    });

    it('reports the same device id as the main event', async () => {
      const { trackMainEvent } = await loadTracker();

      await trackMainEvent();

      const main = JSON.parse(fetchMock.mock.calls.find(([url]) => String(url).endsWith('/main'))[1].body);
      expect(priceRequests()[0].body.device_id).toBe(main.deviceId);
    });

    it('sends no observation at all when the user opted out', async () => {
      const { trackMainEvent } = await loadTracker({ analyticsEnabled: false });

      await trackMainEvent();

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('keeps reporting the other jobs when one of them fails', async () => {
      const jobs = [jobWith({ id: 'job-1' }), jobWith({ id: 'job-2' })];
      const { trackMainEvent } = await loadTracker({ jobs });
      kpiMock.mockImplementationOnce(() => {
        throw new Error('database is locked');
      });

      await trackMainEvent();

      expect(priceRequests()).toHaveLength(1);
    });

    it('finishes even when the tracking endpoint is down throughout', async () => {
      const jobs = [jobWith({ id: 'job-1' }), jobWith({ id: 'job-2' })];
      const { trackMainEvent } = await loadTracker({
        jobs,
        respondWith: () => {
          throw new Error('ECONNREFUSED');
        },
      });

      await expect(trackMainEvent()).resolves.toBeUndefined();
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });

  describe('when the other side has something to say', () => {
    it('accepts "stored: false" as a success and does not retry', async () => {
      const { trackJobPriceObservation } = await loadTracker({
        respondWith: () => jsonResponse({ status: 'ok', stored: false }),
      });

      await expect(trackJobPriceObservation(jobWith(), [PORTAL])).resolves.toBeUndefined();
      expect(priceRequests()).toHaveLength(1);
    });

    it('does not retry a 400 either - that is a bug on this side', async () => {
      const { trackJobPriceObservation } = await loadTracker({
        respondWith: () => jsonResponse({ error: 'bad payload' }, { ok: false, status: 400 }),
      });

      await expect(trackJobPriceObservation(jobWith(), [PORTAL])).resolves.toBeUndefined();
      expect(priceRequests()).toHaveLength(1);
    });

    it('survives an endpoint that fails outright', async () => {
      const { trackJobPriceObservation } = await loadTracker({
        respondWith: () => {
          throw new Error('ECONNREFUSED');
        },
      });

      await expect(trackJobPriceObservation(jobWith(), [PORTAL])).resolves.toBeUndefined();
    });

    it('survives a response that is not the JSON it promised', async () => {
      const { trackJobPriceObservation } = await loadTracker({
        respondWith: () => ({
          ok: true,
          status: 200,
          json: async () => {
            throw new Error('Unexpected token < in JSON');
          },
        }),
      });

      await expect(trackJobPriceObservation(jobWith(), [PORTAL])).resolves.toBeUndefined();
    });
  });

  it('survives the storage throwing on it', async () => {
    const { trackJobPriceObservation } = await loadTracker();
    kpiMock.mockImplementation(() => {
      throw new Error('database is locked');
    });

    await expect(trackJobPriceObservation(jobWith(), [PORTAL])).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
