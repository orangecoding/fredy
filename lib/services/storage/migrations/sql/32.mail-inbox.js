/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Add the user-owned IMAP account and incoming message tables.
 *
 * Passwords are never stored in plaintext. `password_encrypted` contains an
 * AES-256-GCM envelope whose key is supplied separately through
 * `FREDY_MAIL_ENCRYPTION_KEY`, so a database backup alone cannot reveal the
 * mailbox credential.
 *
 * A provider may reset IMAP UIDs when a mailbox is rebuilt. `uid_validity` is
 * therefore part of the message identity; an old message and a new message
 * may legitimately carry the same numeric UID.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mail_accounts (
      id                 TEXT    PRIMARY KEY,
      user_id            TEXT    NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      host               TEXT    NOT NULL,
      port               INTEGER NOT NULL,
      secure             INTEGER NOT NULL DEFAULT 1,
      username           TEXT    NOT NULL,
      password_encrypted TEXT    NOT NULL,
      mailbox            TEXT    NOT NULL DEFAULT 'INBOX',
      enabled            INTEGER NOT NULL DEFAULT 1,
      uid_validity       TEXT,
      last_uid           INTEGER,
      last_sync_at       INTEGER,
      last_sync_error    TEXT,
      created_at         INTEGER NOT NULL,
      updated_at         INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mail_messages (
      id              TEXT    PRIMARY KEY,
      account_id      TEXT    NOT NULL REFERENCES mail_accounts(id) ON DELETE CASCADE,
      mailbox         TEXT    NOT NULL,
      uid_validity    TEXT    NOT NULL,
      uid             INTEGER NOT NULL,
      message_id      TEXT,
      in_reply_to     TEXT,
      references_json JSONB   NOT NULL DEFAULT '[]',
      sender_name     TEXT,
      sender_address  TEXT,
      subject         TEXT,
      received_at     INTEGER,
      text_body       TEXT,
      created_at      INTEGER NOT NULL,
      UNIQUE (account_id, mailbox, uid_validity, uid)
    );

    CREATE INDEX IF NOT EXISTS idx_mail_messages_account_received
      ON mail_messages (account_id, received_at DESC);
    CREATE INDEX IF NOT EXISTS idx_mail_messages_message_id
      ON mail_messages (message_id);
  `);
}
