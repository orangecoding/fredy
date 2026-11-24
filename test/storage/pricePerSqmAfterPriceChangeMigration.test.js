/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';

import { up } from '../../lib/services/storage/migrations/sql/61.price-per-sqm-after-price-change.js';

/**
 * A price change used to rewrite the price and keep the price per square metre of the first one.
 * The rows repriced before that was fixed are the only ones that can be off, and nothing else
 * ever rewrites them.
 */
describe('migration 61 - price per square metre after a price change', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(
      `CREATE TABLE listings (id TEXT PRIMARY KEY, price REAL, size REAL, price_per_sqm REAL, price_changed_at INTEGER)`,
    );
  });

  afterEach(() => db.close());

  const add = (id, price, size, pricePerSqm, priceChangedAt = null) =>
    db
      .prepare(`INSERT INTO listings (id, price, size, price_per_sqm, price_changed_at) VALUES (?, ?, ?, ?, ?)`)
      .run(id, price, size, pricePerSqm, priceChangedAt);
  const perSqmOf = (id) => db.prepare(`SELECT price_per_sqm FROM listings WHERE id = ?`).get(id).price_per_sqm;

  it('recomputes a repriced listing from its current price', () => {
    // Dropped from 300.000 to 250.000; the stored quotient is still the old one.
    add('repriced', 250000, 80, 3750, 1_800_000_000_000);
    up(db);

    expect(perSqmOf('repriced')).toBe(3125);
  });

  it('rounds to the cent like a freshly stored listing', () => {
    add('repriced', 1000, 33, 40, 1_800_000_000_000);
    up(db);

    expect(perSqmOf('repriced')).toBe(30.3);
  });

  it('clears the quotient where the size cannot carry one', () => {
    add('tiny', 900, 2, 500, 1_800_000_000_000);
    add('unknown', 900, null, 15, 1_800_000_000_000);
    up(db);

    expect(perSqmOf('tiny')).toBeNull();
    expect(perSqmOf('unknown')).toBeNull();
  });

  it('leaves a listing that was never repriced alone', () => {
    add('untouched', 1000, 50, 21);
    up(db);

    expect(perSqmOf('untouched')).toBe(21);
  });
});
