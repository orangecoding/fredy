/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

/**
 * The two columns against a real table.
 *
 * What only the storage layer can get wrong is the separation between them: the detector rewrites
 * `scam_signals` every time it looks at a listing, and it must never touch `scam_override`, because
 * that column holds a decision a person made and a job run is not entitled to withdraw it.
 */
describe('scam signals and overrides in the listings table', () => {
  let db;
  let listingsStorage;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE jobs (
        id TEXT PRIMARY KEY,
        deal_type TEXT
      );
      CREATE TABLE listings (
        id TEXT PRIMARY KEY,
        job_id TEXT,
        title TEXT,
        description TEXT,
        price_per_sqm REAL,
        market_median_sqm REAL,
        manually_deleted INTEGER DEFAULT 0,
        scam_signals TEXT,
        scam_override TEXT
      );
    `);
    db.prepare(`INSERT INTO jobs (id, deal_type) VALUES ('job-1', 'rent')`).run();

    vi.resetModules();
    vi.doMock('../../../lib/services/storage/SqliteConnection.js', () => ({
      default: {
        getConnection: () => db,
        query: (sql, params) => db.prepare(sql).all(params),
        execute: (sql, params) => db.prepare(sql).run(params),
        withTransaction: (callback) => db.transaction(() => callback(db))(),
      },
    }));
    vi.doMock('../../../lib/services/similarity-check/similarityCache.js', () => ({ removeEntry: vi.fn() }));
    listingsStorage = await import('../../../lib/services/storage/listingsStorage.js');
  });

  afterEach(() => db.close());

  const addListing = (id, { title = 'Wohnung', description = null, override = null } = {}) =>
    db
      .prepare(`INSERT INTO listings (id, job_id, title, description, scam_override) VALUES (?, 'job-1', ?, ?, ?)`)
      .run(id, title, description, override);

  const rowOf = (id) => db.prepare(`SELECT * FROM listings WHERE id = ?`).get(id);

  it('stores what it found as JSON', () => {
    addListing('a', { description: 'Zahlung per Western Union bitte.' });

    listingsStorage.applyScamSignals([{ id: 'a', title: 'Wohnung', description: 'Zahlung per Western Union bitte.' }]);

    expect(JSON.parse(rowOf('a').scam_signals)).toEqual(['moneyTransferService']);
  });

  it('leaves the column empty when nothing fired, rather than storing an empty array', () => {
    addListing('a', { description: 'Helle Wohnung mit Balkon.' });

    listingsStorage.applyScamSignals([{ id: 'a', title: 'Wohnung', description: 'Helle Wohnung mit Balkon.' }]);

    expect(rowOf('a').scam_signals).toBeNull();
  });

  it('never touches what the user decided', () => {
    addListing('a', { description: 'Zahlung per Western Union bitte.', override: 'safe' });

    listingsStorage.applyScamSignals([{ id: 'a', title: 'Wohnung', description: 'Zahlung per Western Union bitte.' }]);

    expect(rowOf('a').scam_override).toBe('safe');
    expect(JSON.parse(rowOf('a').scam_signals)).toEqual(['moneyTransferService']);
  });

  it('stores and clears an override', () => {
    addListing('a');

    expect(listingsStorage.setListingScamOverride('a', 'scam')).toBe(1);
    expect(rowOf('a').scam_override).toBe('scam');

    expect(listingsStorage.setListingScamOverride('a', 'safe')).toBe(1);
    expect(rowOf('a').scam_override).toBe('safe');

    // Null is a third answer: it hands the listing back to the detector.
    expect(listingsStorage.setListingScamOverride('a', null)).toBe(1);
    expect(rowOf('a').scam_override).toBeNull();
  });

  it('refuses an override it does not know', () => {
    addListing('a');
    expect(() => listingsStorage.setListingScamOverride('a', 'probably')).toThrow(/Invalid scam override/);
    expect(rowOf('a').scam_override).toBeNull();
  });

  it('reports nothing changed for a listing that does not exist', () => {
    expect(listingsStorage.setListingScamOverride('nope', 'scam')).toBe(0);
    expect(listingsStorage.setListingScamOverride('', 'scam')).toBe(0);
  });

  it('withdraws a warning when a re-run finds nothing, having found something before', () => {
    // The description is the half most likely to change: a provider whose detail fetch failed the
    // first time round stores a truncated snippet, and the full text arrives later. A signal read
    // off the old text has to go when the new text no longer carries it.
    addListing('a', { description: 'Zahlung per Western Union bitte.' });
    listingsStorage.applyScamSignals([{ id: 'a', description: 'Zahlung per Western Union bitte.' }]);
    expect(rowOf('a').scam_signals).not.toBeNull();

    listingsStorage.applyScamSignals([{ id: 'a', description: 'Helle Wohnung mit Balkon.' }]);
    expect(rowOf('a').scam_signals).toBeNull();
  });
});
