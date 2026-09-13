/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

import { scamVerdict } from '../../../lib/services/listings/scamSignals.js';

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
        hash TEXT,
        provider TEXT,
        job_id TEXT,
        price REAL,
        size REAL,
        rooms REAL,
        build_year INTEGER,
        energy_class TEXT,
        title TEXT,
        image_url TEXT,
        description TEXT,
        address TEXT,
        link TEXT,
        created_at INTEGER,
        is_active INTEGER,
        latitude REAL,
        longitude REAL,
        published_at INTEGER,
        price_per_sqm REAL,
        market_median_sqm REAL,
        market_sample_size INTEGER,
        market_radius_km REAL,
        manually_deleted INTEGER DEFAULT 0,
        scam_signals TEXT,
        scam_override TEXT,
        UNIQUE (job_id, hash)
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

  it('sees the price signal on a listing that came through the pipeline, not just through a backfill', () => {
    // The whole chain, because the bug this guards against lived in the seam between its steps and
    // was invisible to every test that built the listing object by hand: `storeListings` wrote
    // `price_per_sqm` into the table but not back onto the object, `applyMarketBenchmark` attached
    // the median to the object, and the detector compared the one against the other and found an
    // undefined. The signal fired for everything the migration backfilled and for nothing found
    // afterwards, which is the shape of failure no unit test notices.
    for (let i = 0; i < 12; i++) {
      db.prepare(
        `INSERT INTO listings (id, hash, job_id, price, size, latitude, longitude, is_active, price_per_sqm, manually_deleted)
         VALUES (?, ?, 'job-1', 2000, 100, ?, ?, 1, 20, 0)`,
      ).run(`neighbour-${i}`, `hash-${i}`, 52.5 + i * 0.0005, 13.4 + i * 0.0005);
    }

    // A quarter of what the neighbours cost, and nothing in the text to go with it.
    const fresh = [
      {
        id: 'portal-hash',
        price: 500,
        size: 100,
        rooms: 3,
        title: 'Wohnung',
        description: 'Helle Wohnung mit Balkon.',
        latitude: 52.5,
        longitude: 13.4,
        link: 'https://example.com/1',
        address: 'Musterstr. 1',
      },
    ];

    listingsStorage.storeListings('job-1', 'provider-1', fresh);
    listingsStorage.applyMarketBenchmark('job-1', fresh);
    listingsStorage.applyScamSignals(fresh);

    expect(JSON.parse(rowOf(fresh[0].id).scam_signals)).toEqual(['priceFarBelowMarket']);
    // Weight two, so being cheap is noted and never enough to warn on its own. Finding cheap flats
    // is the point of the tool.
    expect(scamVerdict(['priceFarBelowMarket']).suspicious).toBe(false);
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
