/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { up } from '../../lib/services/storage/migrations/sql/35.mail-inbox.js';

describe('mail inbox migration', () => {
  it('creates user-owned accounts and UIDVALIDITY-aware messages', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY)`);
    up(db);

    const accountColumns = db
      .prepare(`PRAGMA table_info(mail_accounts)`)
      .all()
      .map((row) => row.name);
    const messageColumns = db
      .prepare(`PRAGMA table_info(mail_messages)`)
      .all()
      .map((row) => row.name);
    expect(accountColumns).toContain('password_encrypted');
    expect(messageColumns).toContain('uid_validity');
    expect(messageColumns).toContain('text_body');

    db.prepare(`INSERT INTO users (id) VALUES ('user-1')`).run();
    const insertAccount = db.prepare(`
      INSERT INTO mail_accounts
        (id, user_id, host, port, secure, username, password_encrypted, created_at, updated_at)
      VALUES ('account-1', 'user-1', 'imap.example.com', 993, 1, 'user@example.com', 'ciphertext', 1, 1)
    `);
    insertAccount.run();
    expect(() => insertAccount.run()).toThrow();

    db.prepare(
      `
      INSERT INTO mail_messages
        (id, account_id, mailbox, uid_validity, uid, created_at)
      VALUES ('message-1', 'account-1', 'INBOX', '10', 5, 1)
    `,
    ).run();
    expect(() =>
      db
        .prepare(
          `
          INSERT INTO mail_messages
            (id, account_id, mailbox, uid_validity, uid, created_at)
          VALUES ('message-2', 'account-1', 'INBOX', '10', 5, 1)
        `,
        )
        .run(),
    ).toThrow();
    expect(() =>
      db
        .prepare(
          `
          INSERT INTO mail_messages
            (id, account_id, mailbox, uid_validity, uid, created_at)
          VALUES ('message-3', 'account-1', 'INBOX', '11', 5, 1)
        `,
        )
        .run(),
    ).not.toThrow();

    db.prepare(`DELETE FROM users WHERE id = 'user-1'`).run();
    expect(db.prepare(`SELECT COUNT(*) AS count FROM mail_accounts`).get().count).toBe(0);
    expect(db.prepare(`SELECT COUNT(*) AS count FROM mail_messages`).get().count).toBe(0);
    db.close();
  });
});
