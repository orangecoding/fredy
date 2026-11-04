/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

import { MIN_SAMPLE } from '../../lib/services/listings/marketBenchmark.js';
import { up } from '../../lib/services/storage/migrations/sql/55.listing-currency.js';

const FLAT_IN_BASEL = 'https://flatfox.ch/en/flat/1/';
const FLAT_IN_LOERRACH = 'https://www.immobilienscout24.de/expose/1';

/** Basel and Lörrach: one tram ride, two currencies. */
const BASEL = { latitude: 47.5596, longitude: 7.5886 };
const LOERRACH = { latitude: 47.6101, longitude: 7.6612 };
const BERLIN = { latitude: 52.52, longitude: 13.405 };

/**
 * Everything stored before this migration was treated as euros in the interface, and two sources
 * were wrong about that. Leaving their rows on the default would keep francs in the euro medians
 * forever, because nothing rewrites a stored listing's currency afterwards.
 */
describe('migration 55 - listing currency', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE jobs (id TEXT PRIMARY KEY, deal_type TEXT);
      CREATE TABLE listings (
        id TEXT PRIMARY KEY,
        job_id TEXT,
        provider TEXT,
        link TEXT,
        title TEXT,
        description TEXT,
        price REAL,
        size REAL,
        latitude REAL,
        longitude REAL,
        manually_deleted INTEGER DEFAULT 0,
        price_per_sqm REAL,
        market_median_sqm REAL,
        market_sample_size INTEGER,
        market_radius_km REAL,
        scam_signals TEXT
      );
      INSERT INTO jobs (id, deal_type) VALUES ('rent-job', 'rent');
    `);
  });

  afterEach(() => db.close());

  const add = (id, provider, link) =>
    db.prepare(`INSERT INTO listings (id, provider, link) VALUES (?, ?, ?)`).run(id, provider, link);
  const currencyOf = (id) => db.prepare(`SELECT currency FROM listings WHERE id = ?`).get(id).currency;

  /** A located rental, with the benchmark a previous run stored on it. */
  const addMeasured = (id, provider, link, place, { perSqm = 20, median = null, signals = null } = {}) =>
    db
      .prepare(
        `INSERT INTO listings (id, job_id, provider, link, price, size, latitude, longitude, price_per_sqm,
                               market_median_sqm, market_sample_size, market_radius_km, scam_signals)
         VALUES (@id, 'rent-job', @provider, @link, @price, 50, @latitude, @longitude, @perSqm, @median, @sample,
                 @radius, @signals)`,
      )
      .run({
        id,
        provider,
        link,
        ...place,
        perSqm,
        price: perSqm * 50,
        median,
        sample: median == null ? null : MIN_SAMPLE,
        radius: median == null ? null : 15,
        signals,
      });

  const benchmarkOf = (id) =>
    db
      .prepare(
        `SELECT market_median_sqm AS median, market_sample_size AS sample, scam_signals AS signals
         FROM listings WHERE id = ?`,
      )
      .get(id);

  const addNeighbours = (provider, link, place, perSqm, count = MIN_SAMPLE) => {
    for (let index = 0; index < count; index += 1) {
      addMeasured(`${provider}-${index}`, provider, `${link}${index}`, place, { perSqm });
    }
  };

  it('moves every flatfox listing to francs', () => {
    add('zurich', 'flatfox', FLAT_IN_BASEL);
    up(db);

    expect(currencyOf('zurich')).toBe('CHF');
  });

  it('tells the Swiss site of BETTERHOMES from the German and Austrian ones', () => {
    add('bern', 'betterhomes', 'https://www.betterhomes.ch/de/immobilie-suchen/detail/objectId/1');
    add('basel', 'betterhomes', 'https://betterhomes.ch/de/immobilie-suchen/detail/objectId/2');
    add('berlin', 'betterhomes', 'https://www.betterhomes.de/de/immobilie-suchen/detail/objectId/3');
    add('wien', 'betterhomes', 'https://www.betterhomes.at/de/immobilie-suchen/detail/objectId/4');
    up(db);

    expect(currencyOf('bern')).toBe('CHF');
    expect(currencyOf('basel')).toBe('CHF');
    expect(currencyOf('berlin')).toBe('EUR');
    expect(currencyOf('wien')).toBe('EUR');
  });

  it('leaves everything else in euros, whatever its link says', () => {
    add('munich', 'immoscout', FLAT_IN_LOERRACH);
    add('mirror', 'kleinanzeigen', 'https://www.kleinanzeigen.de/?ref=https://www.betterhomes.ch/');
    up(db);

    expect(currencyOf('munich')).toBe('EUR');
    expect(currencyOf('mirror')).toBe('EUR');
  });

  it('never leaves a row without a currency', () => {
    add('no-link', 'immoscout', null);
    up(db);
    add('later', 'immoscout', null);

    expect(currencyOf('no-link')).toBe('EUR');
    expect(currencyOf('later')).toBe('EUR');
    expect(() => db.prepare(`UPDATE listings SET currency = NULL WHERE id = 'later'`).run()).toThrow(/NOT NULL/);
  });

  it('is a no-op when run again', () => {
    add('zurich', 'flatfox', FLAT_IN_BASEL);
    up(db);

    expect(() => up(db)).not.toThrow();
    expect(currencyOf('zurich')).toBe('CHF');
  });

  describe('the stored benchmarks', () => {
    it('clears a median taken over another currency when its own has too few listings', () => {
      addNeighbours('immoscout', FLAT_IN_LOERRACH, LOERRACH, 20);
      addMeasured('target', 'flatfox', FLAT_IN_BASEL, BASEL, { perSqm: 10, median: 20 });
      up(db);

      expect(benchmarkOf('target')).toMatchObject({ median: null, sample: null });
    });

    it('withdraws a scam signal that only fired against the wrong market', () => {
      addNeighbours('immoscout', FLAT_IN_LOERRACH, LOERRACH, 20);
      addMeasured('target', 'flatfox', FLAT_IN_BASEL, BASEL, {
        perSqm: 10,
        median: 20,
        signals: '["priceFarBelowMarket"]',
      });
      up(db);

      expect(benchmarkOf('target').signals).toBeNull();
    });

    it('measures a listing again against its own currency alone', () => {
      addNeighbours('immoscout', FLAT_IN_LOERRACH, LOERRACH, 20);
      addNeighbours('flatfox', FLAT_IN_BASEL, BASEL, 40);
      addMeasured('target', 'immoscout', FLAT_IN_LOERRACH, LOERRACH, { median: 30 });
      up(db);

      expect(benchmarkOf('target')).toMatchObject({ median: 20, sample: MIN_SAMPLE });
    });

    it('keeps the benchmark of a listing with no other currency anywhere near it', () => {
      addNeighbours('flatfox', FLAT_IN_BASEL, BASEL, 40);
      addMeasured('far-away', 'immoscout', FLAT_IN_LOERRACH, BERLIN, { median: 18 });
      up(db);

      expect(benchmarkOf('far-away')).toMatchObject({ median: 18, sample: MIN_SAMPLE });
    });

    it('touches nothing on an instance holding one currency', () => {
      addNeighbours('immoscout', FLAT_IN_LOERRACH, LOERRACH, 20);
      addMeasured('target', 'immoscout', FLAT_IN_LOERRACH, LOERRACH, { median: 30 });
      up(db);

      expect(benchmarkOf('target')).toMatchObject({ median: 30 });
    });
  });
});
