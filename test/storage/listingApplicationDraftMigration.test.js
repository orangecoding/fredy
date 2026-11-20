/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

import { up } from '../../lib/services/storage/migrations/sql/59.listing-application-draft.js';

/**
 * Old listings get no draft: generating one for every stored listing would spend API credits on
 * flats nobody applies to any more, so the columns arrive empty and stay that way for them.
 */
describe('migration 59 - listing application draft', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`CREATE TABLE listings (id TEXT PRIMARY KEY, job_id TEXT)`);
  });

  afterEach(() => db.close());

  const columns = () =>
    db
      .prepare(`PRAGMA table_info(listings)`)
      .all()
      .map((column) => column.name);

  it('adds the draft, its time and its model, empty on existing rows', () => {
    db.prepare(`INSERT INTO listings (id) VALUES (?)`).run('listing-1');
    up(db);

    expect(columns()).toEqual(
      expect.arrayContaining(['application_draft', 'application_draft_generated_at', 'application_draft_model']),
    );
    const row = db.prepare(`SELECT * FROM listings WHERE id = ?`).get('listing-1');
    expect(row.application_draft).toBeNull();
    expect(row.application_draft_generated_at).toBeNull();
    expect(row.application_draft_model).toBeNull();
  });

  it('is a no-op when run again', () => {
    up(db);
    db.prepare(`INSERT INTO listings (id, application_draft) VALUES (?, ?)`).run('listing-2', 'Hallo');

    expect(() => up(db)).not.toThrow();
    expect(db.prepare(`SELECT application_draft FROM listings WHERE id = ?`).get('listing-2').application_draft).toBe(
      'Hallo',
    );
  });
});
