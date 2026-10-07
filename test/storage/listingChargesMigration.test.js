/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';

import { up } from '../../lib/services/storage/migrations/sql/46.listing-charges.js';

/**
 * Whether a stored rent has the charges in it, and what they come to. The similarity cache reloads
 * from the table every hour, so a rent's basis that lived only on the scraped object was gone by the
 * time the same flat turned up on a second portal.
 */
describe('migration 46 - listing charges', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`CREATE TABLE listings (id TEXT PRIMARY KEY, price REAL)`);
  });

  afterEach(() => db.close());

  const columns = () =>
    db
      .prepare(`PRAGMA table_info(listings)`)
      .all()
      .map((column) => column.name);

  it('adds the basis and the charges of a rent', () => {
    up(db);
    expect(columns()).toEqual(expect.arrayContaining(['charges_included', 'charges']));
  });

  // A listing stored before the portals said anything about it has an unknown basis, not one
  // without charges - `0` would claim a Warmmiete is a Kaltmiete.
  it('leaves the rows already stored with an unknown basis', () => {
    db.prepare(`INSERT INTO listings (id, price) VALUES ('old', 950)`).run();
    up(db);

    expect(db.prepare(`SELECT charges_included, charges FROM listings WHERE id = 'old'`).get()).toEqual({
      charges_included: null,
      charges: null,
    });
  });

  it('is a no-op when run again', () => {
    up(db);
    expect(() => up(db)).not.toThrow();
  });
});
