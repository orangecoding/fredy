/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

import { up } from '../../lib/services/storage/migrations/sql/47.greix-cagr.js';

/**
 * Scoring moves from Bodenrichtwert to GREIX: the migration adds the GREIX columns and
 * resets both scores so the hourly enrichment cron re-scores every priced listing. The
 * legacy BRW columns stay frozen - this migration must not touch their values.
 */
describe('migration 47 - GREIX CAGR', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE listings (
        id TEXT PRIMARY KEY,
        investor_score REAL DEFAULT 0,
        owner_score REAL DEFAULT 0,
        brw_value REAL DEFAULT 0,
        brw_old REAL DEFAULT 0,
        cagr REAL DEFAULT 0,
        bezirk TEXT DEFAULT ''
      );
    `);
  });

  afterEach(() => db.close());

  const columns = () =>
    db
      .prepare(`PRAGMA table_info(listings)`)
      .all()
      .map((column) => column.name);

  it('adds the GREIX columns', () => {
    up(db);
    expect(columns()).toContain('greix_region');
    expect(columns()).toContain('greix_cagr');
  });

  it('resets scores so the enrichment cron re-scores everything', () => {
    db.prepare(`INSERT INTO listings (id, investor_score, owner_score) VALUES (?,?,?)`).run('a', 80, 70);
    up(db);
    const row = db.prepare(`SELECT investor_score, owner_score FROM listings WHERE id = ?`).get('a');
    expect(row.investor_score).toBe(0);
    expect(row.owner_score).toBe(0);
  });

  it('leaves the legacy BRW columns untouched', () => {
    db.prepare(`INSERT INTO listings (id, brw_value, brw_old, cagr, bezirk) VALUES (?,?,?,?,?)`).run(
      'b',
      6500,
      6000,
      0.04,
      'Charlottenburg-Wilmersdorf',
    );
    up(db);
    const row = db.prepare(`SELECT brw_value, brw_old, cagr, bezirk FROM listings WHERE id = ?`).get('b');
    expect(row).toEqual({ brw_value: 6500, brw_old: 6000, cagr: 0.04, bezirk: 'Charlottenburg-Wilmersdorf' });
  });

  it('is idempotent', () => {
    up(db);
    expect(() => up(db)).not.toThrow();
    expect(columns()).toContain('greix_region');
  });
});
