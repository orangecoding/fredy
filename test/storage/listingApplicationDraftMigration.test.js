/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

import { up } from '../../lib/services/storage/migrations/sql/61.application-drafts.js';

/**
 * Old listings get no draft: generating one for every stored listing would spend API credits on
 * flats nobody applies to any more, so the columns arrive empty and stay that way for them. Old jobs
 * do not start writing drafts either: each one costs the admin a request.
 */
describe('migration 61 - application drafts', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`CREATE TABLE listings (id TEXT PRIMARY KEY, job_id TEXT)`);
    db.exec(`CREATE TABLE jobs (id TEXT PRIMARY KEY, name TEXT)`);
  });

  afterEach(() => db.close());

  const columns = (table) =>
    db
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map((column) => column.name);

  it('adds the draft, its time and its model, empty on existing rows', () => {
    db.prepare(`INSERT INTO listings (id) VALUES (?)`).run('listing-1');
    up(db);

    expect(columns('listings')).toEqual(
      expect.arrayContaining(['application_draft', 'application_draft_generated_at', 'application_draft_model']),
    );
    const row = db.prepare(`SELECT * FROM listings WHERE id = ?`).get('listing-1');
    expect(row.application_draft).toBeNull();
    expect(row.application_draft_generated_at).toBeNull();
    expect(row.application_draft_model).toBeNull();
  });

  it('leaves drafts off for every existing job', () => {
    db.prepare(`INSERT INTO jobs (id, name) VALUES (?, ?)`).run('job-1', 'Berlin');
    up(db);

    expect(columns('jobs')).toContain('application_drafts');
    expect(db.prepare(`SELECT application_drafts FROM jobs WHERE id = ?`).get('job-1').application_drafts).toBe(0);
  });

  it('keeps the listing columns an earlier build of the feature already added', () => {
    db.exec(`ALTER TABLE listings ADD COLUMN application_draft TEXT`);
    db.exec(`ALTER TABLE listings ADD COLUMN application_draft_generated_at INTEGER`);
    db.exec(`ALTER TABLE listings ADD COLUMN application_draft_model TEXT`);
    db.prepare(`INSERT INTO listings (id, application_draft) VALUES (?, ?)`).run('listing-3', 'Kept');

    expect(() => up(db)).not.toThrow();
    expect(db.prepare(`SELECT application_draft FROM listings WHERE id = ?`).get('listing-3').application_draft).toBe(
      'Kept',
    );
    expect(columns('jobs')).toContain('application_drafts');
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
