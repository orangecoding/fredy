/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

import { TOUR_LISTINGS, TOUR_PROVIDER_LINKS } from '../../../lib/services/tour/tourData.js';

/*
 * A real SQLite database built by running every migration, rather than a recording double. What is
 * under test is that the example data really disappears - through the job's cascade into listings,
 * price history and travel times - and a mock would only prove that a DELETE was sent.
 */

const root = path.resolve('.');
const MIGRATIONS_DIR = path.join(root, 'lib/services/storage/migrations/sql');

/** @type {import('better-sqlite3').Database} */
let db;
/** @type {{demoMode: boolean}} */
let globalSettings;
/** @type {typeof import('../../../lib/services/tour/tourService.js')} */
let tour;

/**
 * Build the production schema in memory by running every migration in order.
 *
 * @returns {Promise<import('better-sqlite3').Database>}
 */
async function migratedDatabase() {
  const database = new Database(':memory:');
  database.pragma('foreign_keys = ON');
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.js'))
    .map((file) => ({ file, id: Number(file.split('.')[0]) }))
    .sort((a, b) => (a.id === b.id ? a.file.localeCompare(b.file) : a.id - b.id));
  for (const { file } of files) {
    const migration = await import(pathToFileURL(path.join(MIGRATIONS_DIR, file)).href);
    await (migration.up ?? migration.default)(database);
  }
  return database;
}

/** Providers the way `getProviders()` hands them over. */
const PROVIDERS = [
  { metaInformation: { id: 'immoscout', name: 'ImmoScout24' } },
  { metaInformation: { id: 'immowelt', name: 'Immowelt' } },
  { metaInformation: { id: 'kleinanzeigen', name: 'Kleinanzeigen' } },
  { metaInformation: { id: 'wgGesucht', name: 'WG-Gesucht' } },
];

const addUser = (id, isAdmin = false) =>
  db
    .prepare(`INSERT INTO users (id, username, password, last_login, is_admin) VALUES (?, ?, 'x', 0, ?)`)
    .run(id, id, isAdmin ? 1 : 0);

const listingCount = (jobId) => db.prepare(`SELECT COUNT(1) AS n FROM listings WHERE job_id = ?`).get(jobId).n;
const jobRow = (jobId) => db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(jobId);
const storedTourSetting = (userId) => {
  const row = db.prepare(`SELECT value FROM settings WHERE name = 'onboarding_tour' AND user_id = ?`).get(userId);
  return row == null ? null : JSON.parse(row.value);
};

beforeEach(async () => {
  db = await migratedDatabase();
  globalSettings = { demoMode: false };

  vi.resetModules();
  vi.doMock(root + '/lib/services/storage/SqliteConnection.js', () => ({
    default: {
      getConnection: () => db,
      query: (sql, params = {}) => db.prepare(sql).all(params),
      execute: (sql, params = {}) => db.prepare(sql).run(params),
      withTransaction: (callback) => db.transaction(() => callback(db))(),
    },
  }));
  vi.doMock(root + '/lib/services/storage/settingsStorage.js', async (importOriginal) => ({
    ...(await importOriginal()),
    getSettings: async () => globalSettings,
  }));
  vi.doMock(root + '/lib/services/similarity-check/similarityCache.js', () => ({ removeEntry: vi.fn() }));

  tour = await import(root + '/lib/services/tour/tourService.js');
});

afterEach(() => {
  db.close();
  vi.doUnmock(root + '/lib/services/storage/SqliteConnection.js');
  vi.doUnmock(root + '/lib/services/storage/settingsStorage.js');
  vi.doUnmock(root + '/lib/services/similarity-check/similarityCache.js');
});

describe('tour offer', () => {
  it('is offered to an account that has never been asked', async () => {
    addUser('u1');
    expect(await tour.getTourState('u1')).toEqual({ status: null, offer: true, jobId: null, listingId: null });
  });

  it('is not offered again once it was answered, whatever the answer', async () => {
    addUser('u1');
    addUser('u2');
    tour.declineTour('u1');
    tour.startTour('u2', PROVIDERS);
    tour.finishTour('u2', 'completed');

    expect(await tour.getTourState('u1')).toMatchObject({ status: 'declined', offer: false });
    expect(await tour.getTourState('u2')).toMatchObject({ status: 'completed', offer: false });
  });

  it('is never offered on a demo instance', async () => {
    addUser('u1');
    globalSettings.demoMode = true;
    expect((await tour.getTourState('u1')).offer).toBe(false);
  });
});

describe('starting the tour', () => {
  it('lends the account a disabled example job with every example listing', async () => {
    addUser('u1');
    const { jobId, listingId } = tour.startTour('u1', PROVIDERS, 1_000_000);

    expect(jobId).toBe(tour.tourJobId('u1'));
    const job = jobRow(jobId);
    expect(job.user_id).toBe('u1');
    // Disabled keeps it away from the scheduler, the tracker and the price observations.
    expect(job.enabled).toBe(0);
    expect(listingCount(jobId)).toBe(TOUR_LISTINGS.length);

    const providers = JSON.parse(job.provider).map((provider) => provider.id);
    expect(providers.sort()).toEqual(Object.keys(TOUR_PROVIDER_LINKS).sort());

    expect(await tour.getTourState('u1')).toEqual({ status: 'running', offer: false, jobId, listingId });
    expect(storedTourSetting('u1')).toMatchObject({ status: 'running', startedAt: 1_000_000, listingId });
  });

  it('opens the detail step on the first example listing, by its row id', () => {
    addUser('u1');
    const { listingId } = tour.startTour('u1', PROVIDERS);
    const row = db.prepare(`SELECT hash, title FROM listings WHERE id = ?`).get(listingId);
    expect(row).toEqual({ hash: TOUR_LISTINGS[0].id, title: TOUR_LISTINGS[0].title });
  });

  it('stamps the listings as checked, so no probe visits the portal front pages they link to', () => {
    addUser('u1');
    const { jobId } = tour.startTour('u1', PROVIDERS, 1_000_000);
    const rows = db.prepare(`SELECT last_checked_at, last_price_check_at FROM listings WHERE job_id = ?`).all(jobId);
    expect(rows.every((row) => row.last_checked_at === 1_000_000 && row.last_price_check_at === 1_000_000)).toBe(true);
  });

  it('starts over rather than doubling the data when started twice', () => {
    addUser('u1');
    tour.startTour('u1', PROVIDERS);
    const { jobId } = tour.startTour('u1', PROVIDERS);
    expect(listingCount(jobId)).toBe(TOUR_LISTINGS.length);
    expect(db.prepare(`SELECT COUNT(1) AS n FROM jobs`).get().n).toBe(1);
  });
});

describe('ending the tour', () => {
  it.each(['completed', 'cancelled'])('removes the job and every listing when %s', (outcome) => {
    addUser('u1');
    const { jobId } = tour.startTour('u1', PROVIDERS);
    // Rows hanging off the listings must go with them, not only the listings themselves.
    const listingId = db.prepare(`SELECT id FROM listings WHERE job_id = ?`).get(jobId).id;
    db.prepare(`INSERT INTO listing_price_history (listing_id, price, observed_at) VALUES (?, 900, 1)`).run(listingId);

    expect(tour.finishTour('u1', outcome)).toEqual({ wasRunning: true, removed: true });

    expect(jobRow(jobId)).toBeUndefined();
    expect(listingCount(jobId)).toBe(0);
    expect(db.prepare(`SELECT COUNT(1) AS n FROM listing_price_history`).get().n).toBe(0);
    expect(storedTourSetting('u1')).toMatchObject({ status: outcome });
  });

  it('does not turn a completed tour into a cancelled one when a late beacon arrives', () => {
    addUser('u1');
    tour.startTour('u1', PROVIDERS);
    tour.finishTour('u1', 'completed');
    expect(tour.finishTour('u1', 'cancelled')).toEqual({ wasRunning: false, removed: false });
    expect(storedTourSetting('u1').status).toBe('completed');
  });

  it('refuses an outcome it does not know', () => {
    addUser('u1');
    expect(() => tour.finishTour('u1', 'exploded')).toThrow(TypeError);
  });

  it('leaves the account real jobs alone', () => {
    addUser('u1');
    db.prepare(`INSERT INTO jobs (id, user_id, name, enabled) VALUES ('real', 'u1', 'Mine', 1)`).run();
    tour.startTour('u1', PROVIDERS);
    tour.finishTour('u1', 'cancelled');
    expect(jobRow('real')).toBeDefined();
  });

  it('cancels a running tour when its session logs out, and does nothing for anybody else', () => {
    addUser('u1');
    addUser('u2');
    tour.startTour('u1', PROVIDERS);
    tour.declineTour('u2');

    tour.cancelTourOnLogout('u1');
    tour.cancelTourOnLogout('u2');
    tour.cancelTourOnLogout(null);

    expect(jobRow(tour.tourJobId('u1'))).toBeUndefined();
    expect(storedTourSetting('u1').status).toBe('cancelled');
    expect(storedTourSetting('u2').status).toBe('declined');
  });
});

describe('resetting the tour', () => {
  it('removes a running tour and makes the account new again', async () => {
    addUser('u1');
    tour.startTour('u1', PROVIDERS);
    tour.resetTour('u1');
    expect(jobRow(tour.tourJobId('u1'))).toBeUndefined();
    expect(storedTourSetting('u1')).toBeNull();
    expect((await tour.getTourState('u1')).offer).toBe(true);
  });
});

describe('cleaning up abandoned tours', () => {
  it('removes a tour that outlived its time and keeps one still in progress', () => {
    addUser('old');
    addUser('fresh');
    const now = 10 * tour.TOUR_TTL_MS;
    tour.startTour('old', PROVIDERS, now - tour.TOUR_TTL_MS - 1);
    tour.startTour('fresh', PROVIDERS, now - 1000);

    expect(tour.cleanupAbandonedTours({ now })).toBe(1);

    expect(jobRow(tour.tourJobId('old'))).toBeUndefined();
    expect(storedTourSetting('old').status).toBe('cancelled');
    expect(listingCount(tour.tourJobId('fresh'))).toBe(TOUR_LISTINGS.length);
    expect(storedTourSetting('fresh').status).toBe('running');
  });

  it('removes an example job whose tour is no longer running', () => {
    addUser('u1');
    tour.startTour('u1', PROVIDERS);
    // What a process dying between the two writes of finishTour would leave behind.
    db.prepare(`UPDATE settings SET value = ? WHERE name = 'onboarding_tour' AND user_id = 'u1'`).run(
      JSON.stringify({ status: 'completed' }),
    );

    expect(tour.cleanupAbandonedTours()).toBe(1);
    expect(jobRow(tour.tourJobId('u1'))).toBeUndefined();
  });

  it('never touches a job that merely shares the prefix but belongs to somebody else', () => {
    addUser('u1');
    addUser('u2');
    db.prepare(`INSERT INTO jobs (id, user_id, name, enabled) VALUES ('tour-u1', 'u2', 'Not a tour', 1)`).run();

    expect(tour.cleanupAbandonedTours()).toBe(0);
    expect(tour.removeTourData('u1')).toBe(false);
    expect(jobRow('tour-u1')).toBeDefined();
  });
});

describe('tour job ids', () => {
  it('recognises tour jobs by their prefix only', () => {
    expect(tour.isTourJob(tour.tourJobId('abc'))).toBe(true);
    expect(tour.isTourJob('demo-job')).toBe(false);
    expect(tour.isTourJob(null)).toBe(false);
    expect(tour.isTourJob(undefined)).toBe(false);
  });

  it('builds the provider list only from providers the tour has listings for', () => {
    expect(tour.buildTourProviderList(PROVIDERS).map((provider) => provider.id)).toEqual([
      'immoscout',
      'immowelt',
      'kleinanzeigen',
    ]);
    expect(tour.buildTourProviderList(undefined)).toEqual([]);
  });
});

describe('example data', () => {
  it('only uses providers it knows a link for, and hashes that are unique', () => {
    for (const listing of TOUR_LISTINGS) {
      expect(TOUR_PROVIDER_LINKS).toHaveProperty(listing.provider);
    }
    expect(new Set(TOUR_LISTINGS.map((listing) => listing.id)).size).toBe(TOUR_LISTINGS.length);
  });

  it('gives every listing a picture the app ships itself', () => {
    const publicDir = path.join(root, 'public');
    for (const listing of TOUR_LISTINGS) {
      expect(listing.image, listing.id).toMatch(/^\/tour\/[a-z0-9-]+\.svg$/);
      expect(fs.existsSync(path.join(publicDir, listing.image)), listing.image).toBe(true);
    }
  });

  it('places every listing on the map', () => {
    for (const listing of TOUR_LISTINGS) {
      expect(Number.isFinite(listing.latitude) && Number.isFinite(listing.longitude)).toBe(true);
    }
  });
});
