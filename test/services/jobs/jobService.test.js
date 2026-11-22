/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import { migratedDatabase, sqliteConnectionFor } from '../../mocks/migratedDatabase.js';

/*
 * The job rules the web job routes and the MCP job tools share, against the production schema.
 * Only the provider catalog (which would load every portal and the browser stack) and the global
 * settings (which read config.json from disk) are stand-ins.
 */

const root = path.resolve('.');
const ALICE = { id: 'alice', isAdmin: false };
const BOB = { id: 'bob', isAdmin: false };
const ADMIN = { id: 'root', isAdmin: true };
const IMMOSCOUT = { id: 'immoscout', name: 'Immoscout', baseUrl: 'https://www.immobilienscout24.de/' };
const RENT_URL = 'https://www.immobilienscout24.de/Suche/de/nordrhein-westfalen/koeln/wohnung-mieten';
const BUY_URL = 'https://www.immobilienscout24.de/Suche/de/nordrhein-westfalen/koeln/wohnung-kaufen';

let db;
let demoMode;
let service;
let jobStorage;
let channelStorage;
let bus;
let runState;

beforeEach(async () => {
  db = await migratedDatabase();
  demoMode = false;
  vi.resetModules();
  vi.doMock(root + '/lib/services/storage/SqliteConnection.js', () => sqliteConnectionFor(() => db));
  vi.doMock(root + '/lib/utils.js', async (importOriginal) => ({
    ...(await importOriginal()),
    getProviders: async () => [{ metaInformation: IMMOSCOUT }],
  }));
  vi.doMock(root + '/lib/services/storage/settingsStorage.js', async (importOriginal) => ({
    ...(await importOriginal()),
    getSettings: async () => ({ demoMode }),
  }));
  service = await import(root + '/lib/services/jobs/jobService.js');
  jobStorage = await import(root + '/lib/services/storage/jobStorage.js');
  channelStorage = await import(root + '/lib/services/storage/configuredAdapterStorage.js');
  ({ bus } = await import(root + '/lib/services/events/event-bus.js'));
  runState = await import(root + '/lib/services/jobs/run-state.js');

  db.exec(`
    INSERT INTO users (id, username, password, is_admin)
    VALUES ('alice', 'alice', 'x', 0), ('bob', 'bob', 'x', 0), ('root', 'root', 'x', 1);
  `);
  channelStorage.upsertChannel({ id: 'mine', userId: 'alice', adapterId: 'telegram', name: 'Mine', fields: {} });
  channelStorage.upsertChannel({ id: 'bobs', userId: 'bob', adapterId: 'telegram', name: 'Bob', fields: {} });
});

afterEach(() => {
  bus.removeAllListeners();
  db.close();
});

/** @param {object} [overrides] @returns {object} A job input as the web form sends it. */
const input = (overrides = {}) => ({
  name: 'Köln',
  enabled: true,
  provider: [{ id: 'immoscout', name: 'Immoscout', url: RENT_URL, enabled: true }],
  notificationAdapter: [{ configuredAdapterId: 'mine' }],
  ...overrides,
});

describe('saveJob', () => {
  it('creates a job owned by the caller, and fills in the deal type from the search URL', async () => {
    const saved = await service.saveJob(ALICE, input({ provider: [{ id: 'immoscout', url: BUY_URL }] }));
    expect(saved).toMatchObject({ ok: true, created: true });
    expect(jobStorage.getJob(saved.jobId)).toMatchObject({ userId: 'alice', dealType: 'buy' });
  });

  it('keeps the stored deal type when an update does not say', async () => {
    const { jobId } = await service.saveJob(ALICE, input({ dealType: 'buy' }));
    await service.saveJob(ALICE, input({ jobId, name: 'Renamed' }));
    expect(jobStorage.getJob(jobId)).toMatchObject({ name: 'Renamed', dealType: 'buy' });
  });

  it('stores a commute filter with no limit in it as no filter at all', async () => {
    const { jobId } = await service.saveJob(ALICE, input({ commuteFilter: { action: 'exclude', limits: {} } }));
    expect(jobStorage.getJob(jobId).commuteFilter).toBeNull();
  });

  it('stores a page count above one, bounded, and one page as no setting at all', async () => {
    const { jobId } = await service.saveJob(
      ALICE,
      input({ paging: { pages: 50, waitSeconds: 45, jitterSeconds: 15 } }),
    );
    expect(jobStorage.getJob(jobId).paging).toEqual({ pages: 10, waitSeconds: 45, jitterSeconds: 15 });

    await service.saveJob(ALICE, input({ jobId, paging: { pages: 1, waitSeconds: 45, jitterSeconds: 15 } }));
    expect(jobStorage.getJob(jobId).paging).toBeNull();
  });

  it('refuses a channel the caller may not use, and stores nothing', async () => {
    const saved = await service.saveJob(ALICE, input({ notificationAdapter: [{ configuredAdapterId: 'bobs' }] }));
    expect(saved).toMatchObject({ ok: false, reason: 'forbidden' });
    expect(db.prepare('SELECT id FROM jobs').all()).toHaveLength(0);
  });

  it('refuses a URL that is not the portal it claims to be', async () => {
    const saved = await service.saveJob(
      ALICE,
      input({ provider: [{ id: 'immoscout', url: 'https://example.com/search' }] }),
    );
    expect(saved).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it("refuses to overwrite somebody else's job", async () => {
    const { jobId } = await service.saveJob(BOB, input({ notificationAdapter: [] }));
    expect(await service.saveJob(ALICE, input({ jobId }))).toMatchObject({ ok: false, code: 'notYours' });
    expect(jobStorage.getJob(jobId).name).toBe('Köln');
  });

  it('keeps the owner when an admin edits the job', async () => {
    const { jobId } = await service.saveJob(ALICE, input());
    expect((await service.saveJob(ADMIN, input({ jobId, name: 'Fixed by admin' }))).ok).toBe(true);
    expect(jobStorage.getJob(jobId)).toMatchObject({ userId: 'alice', name: 'Fixed by admin' });
  });

  it('refuses to create a job under the tour prefix', async () => {
    expect(await service.saveJob(ALICE, input({ jobId: 'tour-alice' }))).toMatchObject({
      ok: false,
      reason: 'invalid',
    });
  });

  it("refuses a non-admin's change to the demo job in demo mode", async () => {
    await service.saveJob(ALICE, input({ jobId: 'demo-job' }));
    demoMode = true;
    expect(await service.saveJob(ALICE, input({ jobId: 'demo-job', name: 'X' }))).toMatchObject({
      ok: false,
      code: 'demoJob',
    });
    expect(await service.setJobEnabled(ALICE, 'demo-job', false)).toMatchObject({ ok: false, code: 'demoJob' });
    expect(await service.deleteJob(ALICE, 'demo-job')).toMatchObject({ ok: false, code: 'demoJob' });
    expect(jobStorage.getJob('demo-job')).toMatchObject({ name: 'Köln', enabled: true });
  });
});

describe('startJobRun and startAllJobRuns', () => {
  it('refuses when no Fredy server is there to carry the run out', async () => {
    const { jobId } = await service.saveJob(ALICE, input());
    expect(service.startJobRun(ALICE, jobId)).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(service.startAllJobRuns(ALICE)).toMatchObject({ ok: false, reason: 'unavailable' });
  });

  it('starts an own job, and the run-all for the caller only', async () => {
    const one = vi.fn();
    const all = vi.fn();
    bus.on('jobs:runOne', one);
    bus.on('jobs:runAll', all);
    const { jobId } = await service.saveJob(ALICE, input());

    expect(service.startJobRun(ALICE, jobId).ok).toBe(true);
    expect(service.startAllJobRuns(ALICE).ok).toBe(true);
    expect(one).toHaveBeenCalledWith({ jobId });
    expect(all).toHaveBeenCalledWith({ userId: 'alice' });
  });

  it("refuses somebody else's job, and one that is already running", async () => {
    bus.on('jobs:runOne', vi.fn());
    const { jobId } = await service.saveJob(ALICE, input());
    expect(service.startJobRun(BOB, jobId)).toMatchObject({ ok: false, reason: 'forbidden' });
    runState.markRunning(jobId);
    try {
      expect(service.startJobRun(ALICE, jobId)).toMatchObject({ ok: false, reason: 'conflict' });
    } finally {
      runState.markFinished(jobId);
    }
  });
});

describe('setJobEnabled and deleteJob', () => {
  it('says whether switching changed anything', async () => {
    const { jobId } = await service.saveJob(ALICE, input());
    expect(await service.setJobEnabled(ALICE, jobId, true)).toMatchObject({ ok: true, changed: false });
    expect(await service.setJobEnabled(ALICE, jobId, false)).toMatchObject({ ok: true, changed: true });
    expect(jobStorage.getJob(jobId).enabled).toBe(false);
  });

  it('checks without deleting on a dry run, then deletes', async () => {
    const { jobId } = await service.saveJob(ALICE, input());
    expect(await service.deleteJob(BOB, jobId, { dryRun: true })).toMatchObject({ ok: false, reason: 'forbidden' });
    expect((await service.deleteJob(ALICE, jobId, { dryRun: true })).ok).toBe(true);
    expect(jobStorage.getJob(jobId)).not.toBeNull();
    expect((await service.deleteJob(ALICE, jobId)).ok).toBe(true);
    expect(jobStorage.getJob(jobId)).toBeNull();
  });
});
