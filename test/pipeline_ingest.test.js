/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

/*
 * A listing the user adds by URL goes through `ingest()`, the tail of a job run. Against a real
 * schema, because what matters is the row: stored under the job, marked as added by hand, not
 * announced, and still the one row after the job's next run finds the same advert, whether under
 * the same hash or a new one.
 */

const root = path.resolve('.');
const MIGRATIONS_DIR = path.join(root, 'lib/services/storage/migrations/sql');
const JOB = {
  id: 'job-1',
  userId: 'user-1',
  notificationAdapter: [{ id: 'console' }],
  // Would exclude the advert below on a run. A listing the user picked is not filtered.
  specFilter: { maxPrice: 100 },
};
const LINK = 'https://www.kleinanzeigen.de/s-anzeige/flat/123';

let db;
let notify;
let Fredy;
let NoNewListingsWarning;
let similarity;

/** @returns {Promise<import('better-sqlite3').Database>} The production schema, in memory. */
async function migratedDatabase() {
  const database = new Database(':memory:');
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.js'))
    .map((file) => ({ file, id: Number(file.split('.')[0]) }))
    .sort((a, b) => (a.id === b.id ? a.file.localeCompare(b.file) : a.id - b.id));
  for (const { file } of files) {
    const migration = await import(pathToFileURL(path.join(MIGRATIONS_DIR, file)).href);
    await (migration.up ?? migration.default)(database);
  }
  // The job and its user are not what is under test.
  database.pragma('foreign_keys = OFF');
  return database;
}

beforeEach(async () => {
  db = await migratedDatabase();
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
    getSettings: async () => ({ priceChangeThresholdPercent: 0 }),
    getUserSettings: () => ({ language: 'en' }),
  }));
  vi.doMock(root + '/lib/services/storage/jobStorage.js', () => ({ getJob: () => JOB }));
  vi.doMock(root + '/lib/notification/notify.js', () => ({ send: vi.fn(() => []), sendPriceChange: vi.fn(() => []) }));
  vi.doMock(root + '/lib/services/similarity-check/similarityCache.js', () => ({ removeEntry: vi.fn() }));
  vi.doMock(root + '/lib/services/listings/previewCaptureQueue.js', () => ({ enqueuePreviewCapture: vi.fn() }));

  notify = await import(root + '/lib/notification/notify.js');
  Fredy = (await import(root + '/lib/FredyPipelineExecutioner.js')).default;
  ({ NoNewListingsWarning } = await import(root + '/lib/errors.js'));
  similarity = { checkAndAddEntry: vi.fn(() => true) };
});

afterEach(() => db.close());

const advert = (hash, price, overrides = {}) => ({
  id: hash,
  price,
  size: 60,
  rooms: 2,
  title: 'Flat',
  address: 'Hauptstrasse 1',
  link: LINK,
  // Located already, so no geocode is attempted.
  latitude: 52.5,
  longitude: 13.4,
  ...overrides,
});
const pipeline = () =>
  new Fredy({ priceTracking: { selector: '.price' } }, JOB, 'kleinanzeigen', similarity, undefined);
const rows = () => db.prepare(`SELECT hash, price, added_manually, manually_deleted, job_id FROM listings`).all();

describe('ingest', () => {
  it('stores the listing under the job, marked, unfiltered and unannounced', async () => {
    const [stored] = await pipeline().ingest([advert('hash-800', 800, { addedManually: true })]);

    expect(rows()).toEqual([{ hash: 'hash-800', price: 800, added_manually: 1, manually_deleted: 0, job_id: 'job-1' }]);
    expect(db.prepare(`SELECT id FROM listings`).get().id).toBe(stored.id);
    expect(notify.send).not.toHaveBeenCalled();
  });

  it('tells the similarity cache about it, and keeps it whatever the cache says', async () => {
    await pipeline().ingest([advert('hash-800', 800, { addedManually: true })]);

    expect(similarity.checkAndAddEntry).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'job-1', provider: 'kleinanzeigen', title: 'Flat', price: 800 }),
    );
    expect(rows()[0].manually_deleted).toBe(0);
  });

  it('is not found again by the next run under the same hash', async () => {
    await pipeline().ingest([advert('hash-800', 800, { addedManually: true })]);

    expect(() => pipeline()._findNew([advert('hash-800', 800)])).toThrow(NoNewListingsWarning);
  });

  it('is recognised by its link when the next run sees it at another price, and keeps its mark', async () => {
    await pipeline().ingest([advert('hash-800', 800, { addedManually: true })]);

    await expect(pipeline()._splitOffPriceChanges([advert('hash-750', 750)])).rejects.toBeInstanceOf(
      NoNewListingsWarning,
    );
    expect(rows()).toEqual([{ hash: 'hash-750', price: 750, added_manually: 1, manually_deleted: 0, job_id: 'job-1' }]);
  });
});
