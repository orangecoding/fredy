/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { up as createInbox } from '../../lib/services/storage/migrations/sql/32.mail-inbox.js';
import { up as createMatches } from '../../lib/services/storage/migrations/sql/33.mail-listing-matches.js';
import { up as addThreadMethod } from '../../lib/services/storage/migrations/sql/34.mail-thread-match-method.js';

describe('mail listing matches migration', () => {
  it('stores one match per message and cascades deleted source rows', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY);
      CREATE TABLE jobs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id));
      CREATE TABLE listings (id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id));
    `);
    createInbox(db);
    createMatches(db);
    db.exec(`
      INSERT INTO users (id) VALUES ('user-1');
      INSERT INTO jobs (id, user_id) VALUES ('job-1', 'user-1');
      INSERT INTO listings (id, job_id) VALUES ('listing-1', 'job-1');
      INSERT INTO mail_accounts
        (id, user_id, host, port, secure, username, password_encrypted, created_at, updated_at)
      VALUES ('account-1', 'user-1', 'imap.example.com', 993, 1, 'me@example.com', 'cipher', 1, 1);
      INSERT INTO mail_messages
        (id, account_id, mailbox, uid_validity, uid, created_at)
      VALUES ('message-1', 'account-1', 'INBOX', '1', 1, 1);
      INSERT INTO mail_message_listing_matches
        (message_id, listing_id, method, confidence, created_at, updated_at)
      VALUES ('message-1', 'listing-1', 'listing_code', 100, 1, 1);
    `);
    addThreadMethod(db);

    expect(db.prepare(`SELECT listing_id FROM mail_message_listing_matches`).get().listing_id).toBe('listing-1');
    db.exec(`
      INSERT INTO mail_messages
        (id, account_id, mailbox, uid_validity, uid, created_at)
      VALUES ('message-2', 'account-1', 'INBOX', '1', 2, 2);
      INSERT INTO mail_message_listing_matches
        (message_id, listing_id, method, confidence, created_at, updated_at)
      VALUES ('message-2', 'listing-1', 'thread', 95, 2, 2);
    `);
    expect(
      db.prepare(`SELECT method FROM mail_message_listing_matches WHERE message_id = 'message-2'`).get().method,
    ).toBe('thread');
    expect(() =>
      db
        .prepare(
          `INSERT INTO mail_message_listing_matches
             (message_id, listing_id, method, confidence, created_at, updated_at)
           VALUES ('message-1', 'listing-1', 'address', 85, 2, 2)`,
        )
        .run(),
    ).toThrow();

    db.prepare(`DELETE FROM listings WHERE id = 'listing-1'`).run();
    expect(db.prepare(`SELECT COUNT(*) AS count FROM mail_message_listing_matches`).get().count).toBe(0);
    db.close();
  });
});
