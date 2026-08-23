/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const root = (await import('node:path')).resolve('.');
const listingsStoragePath = root + '/lib/services/storage/listingsStorage.js';
const settingsPath = root + '/lib/services/storage/settingsStorage.js';
const providerCountriesPath = root + '/lib/services/providers/providerCountries.js';
const servicePath = root + '/lib/services/connectivity/connectivityService.js';
const trackerPath = root + '/lib/services/tracking/Tracker.js';
const loggerPath = root + '/lib/services/logger.js';

let state;

async function loadSweeper() {
  vi.resetModules();
  vi.doMock(listingsStoragePath, () => ({
    getListingsToEnrichConnectivity: (params) => {
      state.queries.push(params);
      return state.pending.slice(0, params.limit);
    },
    updateListingConnectivity: (id, connectivity, columns, checkedAt) =>
      state.stored.push({ id, connectivity, columns, checkedAt }),
  }));
  vi.doMock(settingsPath, () => ({ getSettings: async () => state.settings }));
  vi.doMock(providerCountriesPath, () => ({
    getCountriesForProvider: async (providerId) => {
      if (providerId === 'explodes') {
        throw new Error('provider metadata is unreadable');
      }
      return { swissportal: ['ch'], austrianportal: ['at'] }[providerId] ?? ['de'];
    },
  }));
  vi.doMock(servicePath, () => ({
    getConnectivity: async (lat, lng, countries) => {
      state.lookups.push({ lat, lng, countries });
      return state.answer == null ? null : { connectivity: state.answer, sourceId: 'de-bba' };
    },
    isConnectivityEnabled: async () => state.enabled,
    isSourceEnabled: (settings, id) => !state.disabledSources.includes(id),
    isSourcePaused: (id) => state.paused.includes(id),
    toColumns: (connectivity) =>
      connectivity == null ? { maxDown: null, fiber: null, mobile: null } : { maxDown: 1000, fiber: 1, mobile: 4 },
    DEFAULT_CONNECTIVITY_LIMIT_PER_RUN: 200,
    DEFAULT_CONNECTIVITY_MAX_AGE_DAYS: 180,
  }));
  vi.doMock(trackerPath, () => ({ trackPoi: async (poi) => state.tracked.push(poi) }));
  vi.doMock(loggerPath, () => ({ default: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} } }));
  return (await import(root + '/lib/services/connectivity/connectivitySweeper.js')).default;
}

/**
 * The sweep that fills in a listing's connectivity, and doubles as the backfill for an instance
 * that upgrades into the feature with a full database.
 *
 * There is no separate one-off migration on purpose, so what has to hold is that the sweep is safe
 * to run over and over: bounded, restartable, and unable to hammer a register that has stopped
 * answering.
 */
describe('services/connectivity/connectivitySweeper', () => {
  beforeEach(() => {
    state = {
      settings: { connectivityEnabled: true, connectivityLimitPerRun: 50, connectivityMaxAgeDays: 180 },
      enabled: true,
      pending: [{ id: 'l1', latitude: 52.52, longitude: 13.405, provider: 'immoscout' }],
      stored: [],
      queries: [],
      lookups: [],
      tracked: [],
      paused: [],
      disabledSources: [],
      answer: { maxDownMbit: 1000, fiber: true, source: 'de-bba' },
    };
  });

  it('stores what it finds', async () => {
    const sweep = await loadSweeper();
    const tally = await sweep({ now: 1000 });

    expect(tally.enriched).toBe(1);
    expect(state.stored).toEqual([
      { id: 'l1', connectivity: state.answer, columns: { maxDown: 1000, fiber: 1, mobile: 4 }, checkedAt: 1000 },
    ]);
  });

  it('does nothing at all while the feature is switched off', async () => {
    state.settings = { connectivityEnabled: false };
    state.enabled = false;
    const sweep = await loadSweeper();

    expect(await sweep({ now: 1000 })).toEqual({ enriched: 0, empty: 0, skipped: 0 });
    expect(state.queries).toEqual([]);
  });

  it('stops mid-run when the feature is switched off under it', async () => {
    state.pending = [
      { id: 'l1', latitude: 52.52, longitude: 13.405, provider: 'immoscout' },
      { id: 'l2', latitude: 52.53, longitude: 13.415, provider: 'immoscout' },
    ];
    const sweep = await loadSweeper();
    // A sweep holding a few hundred listings must not finish its batch against a service the
    // operator has just told it to leave alone.
    state.enabled = false;

    await sweep({ now: 1000 });

    expect(state.stored).toEqual([]);
  });

  it('takes its batch size and its retry interval from the settings', async () => {
    state.settings = { connectivityEnabled: true, connectivityLimitPerRun: 7, connectivityMaxAgeDays: 30 };
    const sweep = await loadSweeper();

    await sweep({ now: 1000 });

    expect(state.queries[0]).toMatchObject({ limit: 7, maxAgeDays: 30, now: 1000 });
  });

  it('falls back to the defaults when a setting is nonsense', async () => {
    state.settings = { connectivityEnabled: true, connectivityLimitPerRun: 'lots', connectivityMaxAgeDays: 0 };
    const sweep = await loadSweeper();

    await sweep({ now: 1000 });

    expect(state.queries[0]).toMatchObject({ limit: 200, maxAgeDays: 180 });
  });

  it('stamps a listing in a country no register covers', async () => {
    state.pending = [{ id: 'l1', latitude: 48.21, longitude: 16.37, provider: 'austrianportal' }];
    const sweep = await loadSweeper();

    const tally = await sweep({ now: 1000 });

    // Stamped rather than skipped: without the timestamp every sweep would re-derive the same
    // answer for every Austrian listing the instance holds, forever.
    expect(tally.empty).toBe(1);
    expect(state.stored[0]).toMatchObject({ id: 'l1', connectivity: null, checkedAt: 1000 });
    expect(state.lookups).toEqual([]);
  });

  it('stamps a place its register simply has no data for', async () => {
    state.answer = null;
    const sweep = await loadSweeper();

    const tally = await sweep({ now: 1000 });

    expect(tally.empty).toBe(1);
    expect(state.stored[0].connectivity).toBeNull();
  });

  it('leaves a listing alone when the register is the thing that failed', async () => {
    state.answer = null;
    state.paused = ['de-bba'];
    const sweep = await loadSweeper();

    const tally = await sweep({ now: 1000 });

    // The address is fine, the service was not. Stamping it would put the listing out of reach for
    // the whole retry interval over somebody else's outage.
    expect(tally.skipped).toBe(1);
    expect(state.stored).toEqual([]);
  });

  it('costs one failed request per run rather than one per listing', async () => {
    state.pending = Array.from({ length: 5 }, (_, index) => ({
      id: `l${index}`,
      latitude: 52.5 + index / 100,
      longitude: 13.4,
      provider: 'immoscout',
    }));
    state.paused = ['de-bba'];
    const sweep = await loadSweeper();

    await sweep({ now: 1000 });

    expect(state.lookups).toEqual([]);
  });

  it('reports a register that has gone away, once', async () => {
    state.pending = Array.from({ length: 5 }, (_, index) => ({
      id: `l${index}`,
      latitude: 52.5 + index / 100,
      longitude: 13.4,
      provider: 'immoscout',
    }));
    state.paused = ['de-bba'];
    const sweep = await loadSweeper();

    await sweep({ now: 1000 });

    // Once per sweep, never once per listing - a dead register would otherwise drown out
    // everything else the tracking has to say.
    expect(state.tracked).toEqual(['CONNECTIVITY_SOURCE_UNAVAILABLE']);
  });

  it('leaves a listing alone when its register is switched off', async () => {
    state.disabledSources = ['de-bba'];
    const sweep = await loadSweeper();

    const tally = await sweep({ now: 1000 });

    // Not stamped: a register the operator has switched off never said "nothing here". Stamping on
    // it would put every German listing out of reach for the whole retry interval, including after
    // the register is switched back on.
    expect(tally.skipped).toBe(1);
    expect(state.stored).toEqual([]);
    expect(state.lookups).toEqual([]);
  });

  it('says nothing about a register that answered', async () => {
    const sweep = await loadSweeper();

    await sweep({ now: 1000 });

    expect(state.tracked).toEqual([]);
  });

  it('does not call an outage on a run that never asked anything', async () => {
    // A sweep with only Austrian listings stamps them and asks nobody. A register left standing off
    // by an earlier run must not turn that into an outage report.
    state.pending = [{ id: 'l1', latitude: 48.21, longitude: 16.37, provider: 'austrianportal' }];
    state.paused = ['de-bba'];
    const sweep = await loadSweeper();

    await sweep({ now: 1000 });

    expect(state.tracked).toEqual([]);
  });

  it('keeps going when one listing blows up', async () => {
    state.pending = [
      { id: 'l1', latitude: 52.52, longitude: 13.405, provider: 'explodes' },
      { id: 'l2', latitude: 52.53, longitude: 13.415, provider: 'immoscout' },
    ];
    const sweep = await loadSweeper();

    const tally = await sweep({ now: 1000 });

    // One bad row must not cost the rest of the batch. The sweep is the only thing that ever fills
    // these columns in, so a listing that throws would otherwise block every listing behind it on
    // every run from here on.
    expect(tally.skipped).toBe(1);
    expect(tally.enriched).toBe(1);
    expect(state.stored.map((row) => row.id)).toEqual(['l2']);
  });
});
