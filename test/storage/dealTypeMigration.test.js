/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

import { up } from '../../lib/services/storage/migrations/sql/23.add-deal-type.js';

/**
 * The migration runs against a raw better-sqlite3 handle (that is what migrate.js hands it), so
 * the test builds a minimal jobs/listings schema in memory and asserts on the backfilled column
 * directly - the same code path production takes, without the full migration runner.
 */
describe('migration 23 - add deal_type to jobs', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE jobs (id TEXT PRIMARY KEY, provider TEXT);
      CREATE TABLE listings (id TEXT PRIMARY KEY, job_id TEXT, price REAL);
    `);
  });

  afterEach(() => db.close());

  const addJob = (id, provider) =>
    db.prepare(`INSERT INTO jobs (id, provider) VALUES (?, ?)`).run(id, JSON.stringify(provider));
  const addListing = (id, jobId, price) =>
    db.prepare(`INSERT INTO listings (id, job_id, price) VALUES (?, ?, ?)`).run(id, jobId, price);
  const dealTypeOf = (id) => db.prepare(`SELECT deal_type FROM jobs WHERE id = ?`).get(id).deal_type;

  it('adds the column', () => {
    up(db);
    const columns = db
      .prepare(`PRAGMA table_info(jobs)`)
      .all()
      .map((c) => c.name);
    expect(columns).toContain('deal_type');
  });

  it('classifies a job from a decisive provider URL', () => {
    addJob('rent-job', [{ id: 'immoscout', url: 'https://www.immobilienscout24.de/Suche/de/wohnung-mieten' }]);
    addJob('buy-job', [{ id: 'sparkasse', url: 'https://immobilien.sparkasse.de/treffer?marketingType=buy' }]);
    up(db);
    expect(dealTypeOf('rent-job')).toBe('rent');
    expect(dealTypeOf('buy-job')).toBe('buy');
  });

  it('falls back to the median listing price when the URL says nothing', () => {
    // Kleinanzeigen root URL carries no rent/buy token, so the price decides.
    addJob('by-price-buy', [{ id: 'kleinanzeigen', url: 'https://www.kleinanzeigen.de/s-immobilien/k0c195' }]);
    addListing('l1', 'by-price-buy', 250000);
    addListing('l2', 'by-price-buy', 310000);
    addListing('l3', 'by-price-buy', 400000);

    addJob('by-price-rent', [{ id: 'kleinanzeigen', url: 'https://www.kleinanzeigen.de/s-immobilien/k0c195' }]);
    addListing('l4', 'by-price-rent', 900);
    addListing('l5', 'by-price-rent', 1200);
    addListing('l6', 'by-price-rent', 1500);

    up(db);
    expect(dealTypeOf('by-price-buy')).toBe('buy');
    expect(dealTypeOf('by-price-rent')).toBe('rent');
  });

  it('defaults to renting for a job with no decisive URL and no listings', () => {
    addJob('empty', [{ id: 'kleinanzeigen', url: 'https://www.kleinanzeigen.de/s-immobilien/k0c195' }]);
    up(db);
    expect(dealTypeOf('empty')).toBe('rent');
  });

  it('never leaves a job NULL', () => {
    addJob('a', [{ id: 'immoscout', url: 'https://www.immobilienscout24.de/wohnung-kaufen' }]);
    addJob('b', []); // no providers at all
    addJob('c', 'not json'); // corrupt provider column
    up(db);
    expect(dealTypeOf('a')).toBe('buy');
    expect(dealTypeOf('b')).toBe('rent');
    expect(dealTypeOf('c')).toBe('rent');
    const nulls = db.prepare(`SELECT COUNT(1) AS c FROM jobs WHERE deal_type IS NULL`).get().c;
    expect(nulls).toBe(0);
  });
});
