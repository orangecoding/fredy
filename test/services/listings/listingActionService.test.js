/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import { migratedDatabase, sqliteConnectionFor } from '../../mocks/migratedDatabase.js';

/*
 * The listing actions the listing routes and the MCP listing tools share, against the production
 * schema - in particular the access check every one of them runs before the storage helpers, which
 * address a listing by id alone, write anything.
 */

const root = path.resolve('.');
const ALICE = { id: 'alice', isAdmin: false };
const BOB = { id: 'bob', isAdmin: false };
const CAROL = { id: 'carol', isAdmin: false };
const ADMIN = { id: 'root', isAdmin: true };

let db;
let demoMode;
let service;

beforeEach(async () => {
  db = await migratedDatabase();
  demoMode = false;
  vi.resetModules();
  vi.doMock(root + '/lib/services/storage/SqliteConnection.js', () => sqliteConnectionFor(() => db));
  vi.doMock(root + '/lib/services/storage/settingsStorage.js', async (importOriginal) => ({
    ...(await importOriginal()),
    getSettings: async () => ({ demoMode }),
  }));
  vi.doMock(root + '/lib/services/similarity-check/similarityCache.js', () => ({
    addEntry: vi.fn(),
    readmitDuplicates: vi.fn(),
    removeEntry: vi.fn(),
  }));
  service = await import(root + '/lib/services/listings/listingActionService.js');
  const jobStorage = await import(root + '/lib/services/storage/jobStorage.js');

  db.exec(`
    INSERT INTO users (id, username, password, is_admin)
    VALUES ('alice', 'alice', 'x', 0), ('bob', 'bob', 'x', 0), ('carol', 'carol', 'x', 0), ('root', 'root', 'x', 1);
  `);
  // Alice's job, shared with Bob. Carol has nothing to do with it.
  jobStorage.upsertJob({
    jobId: 'job-1',
    userId: 'alice',
    name: 'Köln',
    provider: [],
    notificationAdapter: [],
    shareWithUsers: ['bob'],
  });
  for (const id of ['l1', 'l2']) {
    db.prepare(
      `INSERT INTO listings (id, hash, job_id, provider, title, link, currency, is_active)
       VALUES (?, ?, 'job-1', 'immoscout', ?, ?, 'EUR', 1)`,
    ).run(id, `hash-${id}`, `Flat ${id}`, `https://www.immobilienscout24.de/expose/${id}`);
  }
});

afterEach(() => db.close());

/** @param {string} id */
const row = (id) => db.prepare(`SELECT status, notes, manually_deleted FROM listings WHERE id = ?`).get(id);
/** @param {string} id @param {string} userId */
const isWatched = (id, userId) =>
  db.prepare(`SELECT 1 FROM watch_list WHERE listing_id = ? AND user_id = ?`).get(id, userId) != null;

describe('setListingStatusFor', () => {
  it('marks the listing, in any case, and puts it on the watchlist', () => {
    expect(service.setListingStatusFor(ALICE, 'l1', 'Applied')).toEqual({ ok: true, status: 'applied' });
    // Stored with the moment it was set, which the overview sorts by.
    expect(JSON.parse(row('l1').status)).toMatchObject({ status: 'applied' });
    expect(isWatched('l1', 'alice')).toBe(true);
  });

  it('clears the status without unwatching the listing', () => {
    service.setListingStatusFor(ALICE, 'l1', 'applied');
    expect(service.setListingStatusFor(ALICE, 'l1', null)).toEqual({ ok: true, status: null });
    expect(row('l1').status).toBeNull();
    expect(isWatched('l1', 'alice')).toBe(true);
  });

  it('lets someone the job was shared with mark it, on their own watchlist', () => {
    expect(service.setListingStatusFor(BOB, 'l1', 'rejected').ok).toBe(true);
    expect(isWatched('l1', 'bob')).toBe(true);
    expect(isWatched('l1', 'alice')).toBe(false);
  });

  it('refuses an unknown status and a listing of somebody else, and writes nothing', () => {
    expect(service.setListingStatusFor(ALICE, 'l1', 'maybe')).toMatchObject({ ok: false, reason: 'invalid' });
    expect(service.setListingStatusFor(CAROL, 'l1', 'applied')).toMatchObject({ ok: false, reason: 'forbidden' });
    expect(row('l1').status).toBeNull();
    expect(isWatched('l1', 'carol')).toBe(false);
  });
});

describe('setListingNotesFor', () => {
  it('stores notes up to the cap and refuses anything longer', () => {
    const full = 'x'.repeat(service.MAX_LISTING_NOTES_LENGTH);
    expect(service.setListingNotesFor(ALICE, 'l1', full).ok).toBe(true);
    expect(service.setListingNotesFor(ALICE, 'l1', `${full}x`)).toMatchObject({ ok: false, code: 'tooLong' });
    expect(row('l1').notes).toBe(full);
  });

  it("refuses to write somebody else's notes", () => {
    expect(service.setListingNotesFor(CAROL, 'l1', 'mine now')).toMatchObject({ ok: false, reason: 'forbidden' });
    expect(row('l1').notes).toBeNull();
  });
});

describe('watching', () => {
  it('watches, unwatches and toggles, each saying what it did', () => {
    expect(service.watchListingFor(ALICE, 'l1').ok).toBe(true);
    expect(service.unwatchListingFor(ALICE, 'l1')).toEqual({ ok: true, changed: true });
    expect(service.unwatchListingFor(ALICE, 'l1')).toEqual({ ok: true, changed: false });
    expect(service.toggleListingWatchFor(ALICE, 'l1')).toEqual({ ok: true, watched: true });
    expect(isWatched('l1', 'alice')).toBe(true);
  });

  it("refuses somebody else's listing", () => {
    expect(service.watchListingFor(CAROL, 'l1')).toMatchObject({ ok: false, reason: 'forbidden' });
    expect(service.toggleListingWatchFor(CAROL, 'l1')).toMatchObject({ ok: false, reason: 'forbidden' });
  });
});

describe('deleteListingsFor', () => {
  it('hides by default, and removes for good on a hard delete - a hidden listing included', async () => {
    expect(await service.deleteListingsFor(ALICE, ['l1'])).toEqual({ ok: true, deleted: 1 });
    expect(row('l1').manually_deleted).toBe(1);
    expect(await service.deleteListingsFor(ALICE, ['l1'], { hard: true })).toEqual({ ok: true, deleted: 1 });
    expect(row('l1')).toBeUndefined();
  });

  it('refuses a batch with one listing the user may not touch, and deletes none of it', async () => {
    db.exec(`INSERT INTO jobs (id, user_id, name, enabled) VALUES ('carols', 'carol', 'Carol', 1)`);
    db.prepare(
      `INSERT INTO listings (id, hash, job_id, provider, title, link, currency, is_active)
       VALUES ('c1', 'hash-c1', 'carols', 'immoscout', 'Carol flat', 'https://www.immobilienscout24.de/expose/c1', 'EUR', 1)`,
    ).run();
    expect(await service.deleteListingsFor(ALICE, ['l1', 'c1'], { hard: true })).toMatchObject({
      ok: false,
      reason: 'forbidden',
    });
    expect(row('l1')).toBeDefined();
    expect(row('c1')).toBeDefined();
  });

  it('refuses everyone but an admin in demo mode', async () => {
    demoMode = true;
    expect(await service.deleteListingsFor(ALICE, ['l1'])).toMatchObject({ ok: false, reason: 'forbidden' });
    expect((await service.deleteListingsFor(ADMIN, ['l1'])).ok).toBe(true);
  });
});
