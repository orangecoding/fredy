/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { nanoid } from 'nanoid';
import SqliteConnection from './SqliteConnection.js';
import { fromJson, toJson } from '../../utils.js';

/**
 * Convert a database row to the public account shape. The encrypted password
 * is deliberately omitted so API callers cannot accidentally serialize it.
 *
 * @param {Object|undefined} row
 * @returns {Object|null}
 */
function publicAccount(row) {
  if (!row) return null;
  return {
    id: row.id,
    host: row.host,
    port: row.port,
    secure: !!row.secure,
    username: row.username,
    mailbox: row.mailbox,
    enabled: !!row.enabled,
    hasPassword: !!row.password_encrypted,
    uidValidity: row.uid_validity,
    lastUid: row.last_uid,
    lastSyncAt: row.last_sync_at,
    lastSyncError: row.last_sync_error,
  };
}

/**
 * Return the current user's account without its encrypted credential.
 *
 * @param {string} userId
 * @returns {Object|null}
 */
export function getMailAccount(userId) {
  return publicAccount(
    SqliteConnection.query(`SELECT * FROM mail_accounts WHERE user_id = @userId LIMIT 1`, { userId })[0],
  );
}

/**
 * Server-only account lookup used by the sync service.
 *
 * @param {string} accountId
 * @param {string|null} [userId] Optional ownership constraint.
 * @returns {Object|null}
 */
export function getMailAccountWithCredential(accountId, userId = null) {
  const row = SqliteConnection.query(
    `SELECT *
       FROM mail_accounts
      WHERE id = @accountId
        AND (@userId IS NULL OR user_id = @userId)
      LIMIT 1`,
    { accountId, userId },
  )[0];
  if (!row) return null;
  return {
    ...publicAccount(row),
    userId: row.user_id,
    passwordEncrypted: row.password_encrypted,
  };
}

/**
 * Insert or update the one IMAP account owned by a user.
 *
 * @param {Object} account
 * @param {string} account.userId
 * @param {string} account.host
 * @param {number} account.port
 * @param {boolean} account.secure
 * @param {string} account.username
 * @param {string} account.passwordEncrypted
 * @param {string} [account.mailbox]
 * @param {boolean} [account.enabled]
 * @returns {Object}
 */
export function upsertMailAccount(account) {
  const existing = getMailAccount(account.userId);
  const now = Date.now();
  const id = existing?.id ?? nanoid();
  SqliteConnection.execute(
    `INSERT INTO mail_accounts
       (id, user_id, host, port, secure, username, password_encrypted, mailbox, enabled, created_at, updated_at)
     VALUES
       (@id, @userId, @host, @port, @secure, @username, @passwordEncrypted, @mailbox, @enabled, @now, @now)
     ON CONFLICT(user_id) DO UPDATE SET
       host = excluded.host,
       port = excluded.port,
       secure = excluded.secure,
       username = excluded.username,
       password_encrypted = excluded.password_encrypted,
       mailbox = excluded.mailbox,
       enabled = excluded.enabled,
       uid_validity = CASE
         WHEN mail_accounts.host <> excluded.host
           OR mail_accounts.username <> excluded.username
           OR mail_accounts.mailbox <> excluded.mailbox
         THEN NULL ELSE mail_accounts.uid_validity END,
       last_uid = CASE
         WHEN mail_accounts.host <> excluded.host
           OR mail_accounts.username <> excluded.username
           OR mail_accounts.mailbox <> excluded.mailbox
         THEN NULL ELSE mail_accounts.last_uid END,
       last_sync_error = NULL,
       updated_at = excluded.updated_at`,
    {
      id,
      userId: account.userId,
      host: account.host,
      port: account.port,
      secure: account.secure ? 1 : 0,
      username: account.username,
      passwordEncrypted: account.passwordEncrypted,
      mailbox: account.mailbox ?? 'INBOX',
      enabled: account.enabled === false ? 0 : 1,
      now,
    },
  );
  return getMailAccount(account.userId);
}

/**
 * Remove an account and its messages through the foreign-key cascade.
 *
 * @param {string} userId
 * @returns {boolean}
 */
export function deleteMailAccount(userId) {
  return SqliteConnection.execute(`DELETE FROM mail_accounts WHERE user_id = @userId`, { userId }).changes > 0;
}

/**
 * Persist one normalized incoming message, ignoring a repeated IMAP UID.
 *
 * @param {Object} message
 * @returns {boolean} true when a new row was inserted.
 */
export function storeMailMessage(message) {
  const result = SqliteConnection.execute(
    `INSERT INTO mail_messages
       (id, account_id, mailbox, uid_validity, uid, message_id, in_reply_to, references_json,
        sender_name, sender_address, subject, received_at, text_body, created_at)
     VALUES
       (@id, @accountId, @mailbox, @uidValidity, @uid, @messageId, @inReplyTo, @referencesJson,
        @senderName, @senderAddress, @subject, @receivedAt, @textBody, @createdAt)
     ON CONFLICT(account_id, mailbox, uid_validity, uid) DO NOTHING`,
    {
      id: message.id ?? nanoid(),
      accountId: message.accountId,
      mailbox: message.mailbox,
      uidValidity: String(message.uidValidity),
      uid: message.uid,
      messageId: message.messageId ?? null,
      inReplyTo: message.inReplyTo ?? null,
      referencesJson: toJson(message.references ?? []),
      senderName: message.senderName ?? null,
      senderAddress: message.senderAddress ?? null,
      subject: message.subject ?? null,
      receivedAt: message.receivedAt ?? null,
      textBody: message.textBody ?? null,
      createdAt: Date.now(),
    },
  );
  return result.changes > 0;
}

/**
 * Record a successful sync cursor.
 *
 * @param {string} accountId
 * @param {string} uidValidity
 * @param {number|null} lastUid
 * @returns {void}
 */
export function markMailSyncSuccessful(accountId, uidValidity, lastUid) {
  SqliteConnection.execute(
    `UPDATE mail_accounts
        SET uid_validity = @uidValidity,
            last_uid = @lastUid,
            last_sync_at = @now,
            last_sync_error = NULL,
            updated_at = @now
      WHERE id = @accountId`,
    { accountId, uidValidity: String(uidValidity), lastUid, now: Date.now() },
  );
}

/**
 * Keep the last sync failure visible without exposing connection credentials.
 *
 * @param {string} accountId
 * @param {string} message
 * @returns {void}
 */
export function markMailSyncFailed(accountId, message) {
  SqliteConnection.execute(
    `UPDATE mail_accounts
        SET last_sync_at = @now, last_sync_error = @message, updated_at = @now
      WHERE id = @accountId`,
    { accountId, message: String(message).slice(0, 1000), now: Date.now() },
  );
}

/**
 * List messages belonging to the requesting user only.
 *
 * @param {string} userId
 * @param {number} [limit]
 * @returns {Object[]}
 */
export function getMailMessages(userId, limit = 100) {
  const rows = SqliteConnection.query(
    `SELECT m.id, m.message_id, m.in_reply_to, m.references_json,
            m.sender_name, m.sender_address, m.subject, m.received_at, m.text_body, m.created_at
       FROM mail_messages m
       JOIN mail_accounts a ON a.id = m.account_id
      WHERE a.user_id = @userId
      ORDER BY COALESCE(m.received_at, m.created_at) DESC
      LIMIT @limit`,
    { userId, limit: Math.max(1, Math.min(500, Number(limit) || 100)) },
  );
  return rows.map((row) => ({
    id: row.id,
    messageId: row.message_id,
    inReplyTo: row.in_reply_to,
    references: fromJson(row.references_json, []),
    senderName: row.sender_name,
    senderAddress: row.sender_address,
    subject: row.subject,
    receivedAt: row.received_at,
    textBody: row.text_body,
    createdAt: row.created_at,
  }));
}
