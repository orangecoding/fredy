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
 * A price-tracked provider hashes the advert id with the price, so a cheaper advert arrives under a
 * hash nobody stored. Against a real schema, because what matters is what lands in the rows: one
 * row per advert, the new price on it, and one notification for the change, whichever of the scrape
 * and the price tracker sees it first.
 */

const root = path.resolve('.');
const MIGRATIONS_DIR = path.join(root, 'lib/services/storage/migrations/sql');
const JOB = { id: 'job-1', userId: 'user-1', notificationAdapter: [{ id: 'console' }] };
const LINK = 'https://www.kleinanzeigen.de/s-anzeige/flat/123';

let db;
let storage;
let notify;
let Fredy;
let NoNewListingsWarning;

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

  storage = await import(root + '/lib/services/storage/listingsStorage.js');
  notify = await import(root + '/lib/notification/notify.js');
  Fredy = (await import(root + '/lib/FredyPipelineExecutioner.js')).default;
  ({ NoNewListingsWarning } = await import(root + '/lib/errors.js'));
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
  ...overrides,
});
const pipeline = (providerConfig = { priceTracking: { selector: '.price' } }) =>
  new Fredy(providerConfig, JOB, 'kleinanzeigen', { checkAndAddEntry: () => false }, undefined);
const rows = () => db.prepare(`SELECT hash, price, previous_price FROM listings`).all();

describe('a stored advert at a new price', () => {
  it('is reported as a price change, not stored and announced a second time', async () => {
    storage.storeListings(JOB.id, 'kleinanzeigen', [advert('hash-800', 800)]);

    await expect(pipeline()._splitOffPriceChanges([advert('hash-750', 750)])).rejects.toBeInstanceOf(
      NoNewListingsWarning,
    );

    expect(rows()).toEqual([{ hash: 'hash-750', price: 750, previous_price: 800 }]);
    expect(notify.sendPriceChange).toHaveBeenCalledTimes(1);
    const [provider, [change]] = notify.sendPriceChange.mock.calls[0];
    expect(provider).toBe('kleinanzeigen');
    expect(change.direction).toBe('down');
  });

  it('stays silent when the price tracker already reported it', async () => {
    storage.storeListings(JOB.id, 'kleinanzeigen', [advert('hash-800', 800)]);
    const [{ id }] = db.prepare(`SELECT id FROM listings`).all();
    storage.applyPriceChange(id, 750);

    await expect(pipeline()._splitOffPriceChanges([advert('hash-750', 750)])).rejects.toBeInstanceOf(
      NoNewListingsWarning,
    );

    expect(rows()).toEqual([{ hash: 'hash-750', price: 750, previous_price: 800 }]);
    expect(notify.sendPriceChange).not.toHaveBeenCalled();
  });

  it('notices the price going back, because the row took the current hash', async () => {
    storage.storeListings(JOB.id, 'kleinanzeigen', [advert('hash-800', 800)]);
    await pipeline()
      ._splitOffPriceChanges([advert('hash-750', 750)])
      .catch(() => {});
    // `_findNew` passes 'hash-800' on again: it is no longer a stored hash.
    await pipeline()
      ._splitOffPriceChanges([advert('hash-800', 800)])
      .catch(() => {});

    expect(rows()).toEqual([{ hash: 'hash-800', price: 800, previous_price: 750 }]);
    expect(notify.sendPriceChange).toHaveBeenCalledTimes(2);
  });

  it('leaves an advert the user deleted deleted and unreported', async () => {
    storage.storeListings(JOB.id, 'kleinanzeigen', [advert('hash-800', 800)]);
    db.exec(`UPDATE listings SET manually_deleted = 1`);

    await expect(pipeline()._splitOffPriceChanges([advert('hash-750', 750)])).rejects.toBeInstanceOf(
      NoNewListingsWarning,
    );

    expect(rows()[0].price).toBe(800);
    expect(notify.sendPriceChange).not.toHaveBeenCalled();
  });

  it('passes an advert with an unknown link on as new', async () => {
    storage.storeListings(JOB.id, 'kleinanzeigen', [advert('hash-800', 800)]);
    const other = advert('hash-other', 500, { link: 'https://www.kleinanzeigen.de/s-anzeige/flat/456' });

    expect(await pipeline()._splitOffPriceChanges([advert('hash-750', 750), other])).toEqual([other]);
  });

  it('leaves providers without price tracking alone, whose links may be shared by several adverts', async () => {
    storage.storeListings(JOB.id, 'kleinanzeigen', [advert('hash-800', 800)]);
    const listings = [advert('hash-750', 750)];

    expect(await pipeline({})._splitOffPriceChanges(listings)).toBe(listings);
    expect(rows()[0].price).toBe(800);
  });
});
