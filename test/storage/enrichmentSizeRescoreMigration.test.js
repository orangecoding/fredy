/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

import { up } from '../../lib/services/storage/migrations/sql/48.enrichment-size-rescore.js';

/**
 * The living-space fix (`area` falling back to `size`) changes every listing's rent
 * estimate and revives the cashflow/buy-rent legs, so all scores must be recomputed.
 * The migration resets both scores plus the retry counters so the uncapped enrichment
 * cron re-scores everything - including rows that already burned their two attempts.
 */
describe('migration 48 - living-space rescore', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE listings (
        id TEXT PRIMARY KEY,
        investor_score REAL DEFAULT 0,
        owner_score REAL DEFAULT 0,
        greix_region TEXT DEFAULT NULL,
        greix_cagr REAL DEFAULT NULL,
        enrichment_requests INTEGER DEFAULT 0,
        enrichment_requested_at INTEGER DEFAULT NULL
      );
    `);
  });

  afterEach(() => db.close());

  it('resets scores so the enrichment cron re-scores everything', () => {
    db.prepare(`INSERT INTO listings (id, investor_score, owner_score) VALUES (?,?,?)`).run('a', 14.9, 45.1);
    up(db);
    const row = db.prepare(`SELECT investor_score, owner_score FROM listings WHERE id = ?`).get('a');
    expect(row.investor_score).toBe(0);
    expect(row.owner_score).toBe(0);
  });

  it('resets the retry counters so exhausted rows become eligible again', () => {
    db.prepare(
      `INSERT INTO listings (id, investor_score, enrichment_requests, enrichment_requested_at) VALUES (?,?,?,?)`,
    ).run('b', 9.2, 2, 1791387322266);
    up(db);
    const row = db
      .prepare(`SELECT investor_score, enrichment_requests, enrichment_requested_at FROM listings WHERE id = ?`)
      .get('b');
    expect(row.investor_score).toBe(0);
    expect(row.enrichment_requests).toBe(0);
    expect(row.enrichment_requested_at).toBeNull();
  });

  it('leaves the GREIX columns untouched', () => {
    db.prepare(`INSERT INTO listings (id, greix_region, greix_cagr) VALUES (?,?,?)`).run('c', 'Berlin (West)', 0.0384);
    up(db);
    const row = db.prepare(`SELECT greix_region, greix_cagr FROM listings WHERE id = ?`).get('c');
    expect(row.greix_region).toBe('Berlin (West)');
    expect(row.greix_cagr).toBe(0.0384);
  });
});
