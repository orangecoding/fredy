/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

import { up } from '../../lib/services/storage/migrations/sql/49.full-reenrichment.js';

/**
 * The `is_active` filter was dropped from the enrichment catch-up selection, so every
 * priced listing - active or off-market - must be rescored. The migration resets both
 * scores plus the retry counters so the uncapped enrichment cron picks up the whole
 * table on its next run.
 */
describe('migration 49 - full re-enrichment', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE listings (
        id TEXT PRIMARY KEY,
        is_active INTEGER DEFAULT 1,
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

  it('resets scores on active and inactive rows alike', () => {
    db.prepare(`INSERT INTO listings (id, is_active, investor_score, owner_score) VALUES (?,?,?,?)`).run(
      'active',
      1,
      37.4,
      49.2,
    );
    db.prepare(`INSERT INTO listings (id, is_active, investor_score, owner_score) VALUES (?,?,?,?)`).run(
      'inactive',
      0,
      12.1,
      20.3,
    );
    up(db);
    for (const id of ['active', 'inactive']) {
      const row = db.prepare(`SELECT investor_score, owner_score FROM listings WHERE id = ?`).get(id);
      expect(row.investor_score).toBe(0);
      expect(row.owner_score).toBe(0);
    }
  });

  it('resets the retry counters so exhausted and cooled-down rows become eligible again', () => {
    db.prepare(
      `INSERT INTO listings (id, is_active, investor_score, enrichment_requests, enrichment_requested_at) VALUES (?,?,?,?,?)`,
    ).run('b', 0, 9.2, 2, 1791387322266);
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
