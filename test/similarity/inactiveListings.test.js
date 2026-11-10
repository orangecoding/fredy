/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

/**
 * A listing the alive-checker took off the market must stop standing in for the flat. While it still
 * sat in the similarity cache, the same flat turning up again on another portal was soft-deleted as
 * a duplicate of the dead ad, and the property stayed hidden although it was back on the market.
 *
 * These run the real storage against the real cache, because the bug lived in how the two are kept
 * in step: the reload, the deactivation, the reactivation and the hard deletes all move rows in or
 * out, and each of them has to agree on which rows the cache holds.
 */
describe('inactive listings and the similarity cache', () => {
  let db;
  let listingsStorage;
  let similarityCache;

  const DAY = 24 * 60 * 60 * 1000;
  const NOW = 1_800_000_000_000;

  const BROKER_COPY =
    'Diese ansprechende Wohnung befindet sich im zweiten Obergeschoss eines gepflegten ' +
    'Mehrfamilienhauses und ueberzeugt durch ihren durchdachten Grundriss. Der Balkon nach ' +
    'Sueden laedt zum Verweilen ein. Die Kueche ist voll ausgestattet.';

  const scout = {
    provider: 'immoscout',
    title: 'Helle 3-Zimmer-Wohnung mit Balkon in Stadtamhof',
    address: 'Stadtamhof, Regensburg',
    price: 1450,
    size: 78,
    rooms: 3,
    description: BROKER_COPY,
  };

  // The same flat on a second portal, as the pipeline hands it to the cache.
  const welt = {
    jobId: 'job-1',
    provider: 'immowelt',
    title: '3-Zimmer-Wohnung mit Balkon, Regensburg-Stadtamhof',
    address: '93059 Stadtamhof, Regensburg',
    price: 1180,
    size: 78,
    rooms: 3,
    description: BROKER_COPY,
  };

  beforeEach(async () => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE listings (
        id TEXT PRIMARY KEY,
        job_id TEXT,
        provider TEXT,
        title TEXT,
        address TEXT,
        price REAL,
        charges_included INTEGER,
        charges REAL,
        size REAL,
        rooms REAL,
        description TEXT,
        is_active INTEGER DEFAULT 1,
        manually_deleted INTEGER DEFAULT 0,
        inactive_since INTEGER,
        active_check_failures INTEGER DEFAULT 0,
        activity_is_manual INTEGER NOT NULL DEFAULT 0,
        hidden_as_duplicate INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE watch_list (id TEXT PRIMARY KEY, listing_id TEXT, user_id TEXT);
      CREATE TABLE listing_attachments (id TEXT PRIMARY KEY, listing_id TEXT);
    `);

    vi.resetModules();
    vi.doMock('../../lib/services/storage/SqliteConnection.js', () => ({
      default: {
        getConnection: () => db,
        query: (sql, params) => db.prepare(sql).all(params ?? []),
        execute: (sql, params) => db.prepare(sql).run(params ?? []),
        withTransaction: (callback) => db.transaction(() => callback(db))(),
      },
    }));
    listingsStorage = await import('../../lib/services/storage/listingsStorage.js');
    similarityCache = await import('../../lib/services/similarity-check/similarityCache.js');
  });

  afterEach(() => db.close());

  const addListing = (id, listing, { isActive = 1, deleted = 0, inactiveSince = null, duplicate = 0 } = {}) =>
    db
      .prepare(
        `INSERT INTO listings (id, job_id, provider, title, address, price, size, rooms, description,
                               is_active, manually_deleted, inactive_since, hidden_as_duplicate)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        'job-1',
        listing.provider,
        listing.title,
        listing.address,
        listing.price,
        listing.size,
        listing.rooms,
        listing.description,
        isActive,
        deleted,
        inactiveSince,
        duplicate,
      );

  it('lets the flat back in from another portal once the first ad went offline', () => {
    addListing('scout', scout);
    similarityCache.initSimilarityCache();

    listingsStorage.deactivateListings(['scout'], NOW);

    expect(similarityCache.checkAndAddEntry(welt)).toBe(false);
  });

  it('leaves inactive listings out when it reloads', () => {
    addListing('scout', scout, { isActive: 0, inactiveSince: NOW });
    similarityCache.initSimilarityCache();

    expect(similarityCache.checkAndAddEntry(welt)).toBe(false);
  });

  it('keeps listings whose activity was never determined', () => {
    // NULL is "never checked", not "gone". The flat is still on the market as far as Fredy knows.
    addListing('scout', scout, { isActive: null });
    similarityCache.initSimilarityCache();

    expect(similarityCache.checkAndAddEntry(welt)).toBe(true);
  });

  it('still catches the duplicate while the first ad is online', () => {
    addListing('scout', scout);
    similarityCache.initSimilarityCache();

    expect(similarityCache.checkAndAddEntry(welt)).toBe(true);
  });

  it('takes the listing back when a user marks it as available again', () => {
    addListing('scout', scout, { isActive: 0, inactiveSince: NOW });
    similarityCache.initSimilarityCache();

    listingsStorage.reactivateListings(['scout']);

    expect(similarityCache.checkAndAddEntry(welt)).toBe(true);
  });

  it('does not count a listing twice when reactivating one that was active already', () => {
    const exact = { provider: 'immoscout', title: 'A', address: 'Main 1', price: 1000, size: null, rooms: null };
    addListing('a', exact);
    similarityCache.initSimilarityCache();

    listingsStorage.reactivateListings(['a']);
    listingsStorage.deactivateListings(['a'], NOW);

    expect(similarityCache.checkAndAddEntry({ jobId: 'job-1', ...exact })).toBe(false);
  });

  it('does not take a hidden listing back on reactivation', () => {
    addListing('scout', scout, { isActive: 0, deleted: 1, inactiveSince: NOW });
    similarityCache.initSimilarityCache();

    listingsStorage.reactivateListings(['scout']);

    expect(similarityCache.checkAndAddEntry(welt)).toBe(false);
  });

  // Two stored rows can share an exact content hash. Evicting a row the cache does not hold would
  // drop the other one's count instead, and the twin would be notified again.
  describe('rows the cache does not hold are not evicted', () => {
    const exact = { provider: 'immoscout', title: 'A', address: 'Main 1', price: 1000, size: null, rooms: null };

    it('when an inactive listing is deactivated again', () => {
      addListing('online', exact);
      addListing('offline', exact, { isActive: 0, inactiveSince: NOW - DAY });
      similarityCache.initSimilarityCache();

      listingsStorage.deactivateListings(['offline'], NOW);

      expect(similarityCache.checkAndAddEntry({ jobId: 'job-1', ...exact })).toBe(true);
    });

    it('when the retention purge deletes an inactive listing', () => {
      addListing('online', exact);
      addListing('offline', exact, { isActive: 0, inactiveSince: NOW - 30 * DAY });
      similarityCache.initSimilarityCache();

      listingsStorage.purgeExpiredInactiveListings({ retentionDays: 14, now: NOW });

      expect(db.prepare(`SELECT id FROM listings`).all()).toEqual([{ id: 'online' }]);
      expect(similarityCache.checkAndAddEntry({ jobId: 'job-1', ...exact })).toBe(true);
    });
  });

  // The other direction: the second portal's copy arrived while the first was online, so the
  // similarity check hid it. When the first goes offline, the hidden copy is the flat still on the
  // market, and nothing else would ever bring it back - its hash is stored, so no run sees it again.
  describe('copies hidden as duplicates', () => {
    const kleinanzeigen = {
      provider: 'kleinanzeigen',
      title: 'Schoene 3 Zi Whg mit Balkon',
      address: '93059 Stadtamhof, Regensburg',
      price: 1450,
      size: 78,
      rooms: 3,
      description: BROKER_COPY,
    };

    const visible = (id) =>
      db.prepare(`SELECT manually_deleted, hidden_as_duplicate FROM listings WHERE id = ?`).get(id);

    it('marks the copy the pipeline hides', () => {
      addListing('welt', welt);

      listingsStorage.hideAsDuplicates(['welt']);

      expect(visible('welt')).toEqual({ manually_deleted: 1, hidden_as_duplicate: 1 });
    });

    it('brings the copy back when the original goes offline', () => {
      addListing('scout', scout);
      addListing('welt', welt, { deleted: 1, duplicate: 1 });
      similarityCache.initSimilarityCache();

      listingsStorage.deactivateListings(['scout'], NOW);

      expect(visible('welt')).toEqual({ manually_deleted: 0, hidden_as_duplicate: 0 });
      // And it stands for the flat now: a third portal's copy is its duplicate.
      expect(similarityCache.checkAndAddEntry({ jobId: 'job-1', ...kleinanzeigen })).toBe(true);
    });

    it('brings back only one of two hidden copies', () => {
      addListing('scout', scout);
      addListing('welt', welt, { deleted: 1, duplicate: 1 });
      addListing('ka', kleinanzeigen, { deleted: 1, duplicate: 1 });
      similarityCache.initSimilarityCache();

      listingsStorage.deactivateListings(['scout'], NOW);

      const back = [visible('welt'), visible('ka')].filter((row) => row.manually_deleted === 0);
      expect(back).toHaveLength(1);
    });

    it('keeps the copy hidden while another copy is still online', () => {
      addListing('scout', scout);
      addListing('ka', kleinanzeigen);
      addListing('welt', welt, { deleted: 1, duplicate: 1 });
      similarityCache.initSimilarityCache();

      listingsStorage.deactivateListings(['scout'], NOW);

      expect(visible('welt').manually_deleted).toBe(1);
    });

    it('leaves a copy alone that was hidden for a different flat', () => {
      addListing('scout', scout);
      addListing(
        'other',
        { ...welt, title: 'Dachgeschoss mit Galerie', size: 120, rooms: 5, description: null },
        {
          deleted: 1,
          duplicate: 1,
        },
      );
      similarityCache.initSimilarityCache();

      listingsStorage.deactivateListings(['scout'], NOW);

      expect(visible('other').manually_deleted).toBe(1);
    });

    it('leaves a listing the user hid alone', () => {
      addListing('scout', scout);
      addListing('welt', welt, { deleted: 1 });
      similarityCache.initSimilarityCache();

      listingsStorage.deactivateListings(['scout'], NOW);

      expect(visible('welt').manually_deleted).toBe(1);
    });

    it('leaves a copy alone the user hid again after restoring it', () => {
      addListing('scout', scout);
      addListing('welt', welt, { deleted: 1, duplicate: 1 });
      similarityCache.initSimilarityCache();

      listingsStorage.restoreListingsById(['welt']);
      listingsStorage.deleteListingsById(['welt']);
      listingsStorage.deactivateListings(['scout'], NOW);

      expect(visible('welt')).toEqual({ manually_deleted: 1, hidden_as_duplicate: 0 });
    });

    it('brings nothing back when the user deletes the original', () => {
      // Deleting says "not this flat", which is not the same as the flat leaving the market.
      addListing('scout', scout);
      addListing('welt', welt, { deleted: 1, duplicate: 1 });
      similarityCache.initSimilarityCache();

      listingsStorage.deleteListingsById(['scout'], true);

      expect(visible('welt').manually_deleted).toBe(1);
    });
  });
});
