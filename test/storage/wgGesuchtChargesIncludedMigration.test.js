/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';

import { up } from '../../lib/services/storage/migrations/sql/59.wg-gesucht-charges-included.js';

/**
 * WG-Gesucht's search list quoted the Gesamtmiete before the relaunch too. The rows stored before
 * the provider said so would otherwise be read as a Kaltmiete forever, because nothing rewrites a
 * stored listing's basis.
 */
describe('migration 59 - wg-gesucht charges included', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(
      `CREATE TABLE listings (id TEXT PRIMARY KEY, provider TEXT, price REAL, charges_included INTEGER, charges REAL)`,
    );
  });

  afterEach(() => db.close());

  const add = (id, provider, chargesIncluded = null, charges = null) =>
    db
      .prepare(`INSERT INTO listings (id, provider, price, charges_included, charges) VALUES (?, ?, 600, ?, ?)`)
      .run(id, provider, chargesIncluded, charges);
  const basisOf = (id) => db.prepare(`SELECT charges_included, charges FROM listings WHERE id = ?`).get(id);

  it('marks a stored wg-gesucht rent as one with the charges in it', () => {
    add('wg', 'wgGesucht');
    up(db);

    expect(basisOf('wg')).toEqual({ charges_included: 1, charges: null });
  });

  it('leaves a row that already states its basis', () => {
    add('warm', 'wgGesucht', 1, 120);
    add('cold', 'wgGesucht', 0, 80);
    up(db);

    expect(basisOf('warm')).toEqual({ charges_included: 1, charges: 120 });
    expect(basisOf('cold')).toEqual({ charges_included: 0, charges: 80 });
  });

  it('leaves the rents of other portals unknown', () => {
    add('is24', 'immoscout');
    up(db);

    expect(basisOf('is24')).toEqual({ charges_included: null, charges: null });
  });

  it('is a no-op when run again', () => {
    add('wg', 'wgGesucht');
    up(db);
    up(db);

    expect(basisOf('wg')).toEqual({ charges_included: 1, charges: null });
  });
});
