/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { nanoid } from 'nanoid';
import SqliteConnection from './SqliteConnection.js';
import { fromJson, toJson } from '../../utils.js';
import { normalizeListingStatus } from '../listings/listingStatus.js';

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
            m.sender_name, m.sender_address, m.subject, m.received_at, m.text_body, m.created_at,
            mm.listing_id, mm.method AS match_method, mm.confidence AS match_confidence,
            l.title AS listing_title, l.address AS listing_address, l.link AS listing_link,
            l.provider AS listing_provider, l.status AS listing_status
       FROM mail_messages m
       JOIN mail_accounts a ON a.id = m.account_id
       LEFT JOIN mail_message_listing_matches mm ON mm.message_id = m.id
       LEFT JOIN listings l ON l.id = mm.listing_id
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
    match: row.listing_id
      ? {
          listingId: row.listing_id,
          method: row.match_method,
          confidence: row.match_confidence,
          listing: {
            title: row.listing_title,
            address: row.listing_address,
            link: row.listing_link,
            provider: row.listing_provider,
            status: fromJson(row.listing_status, null),
          },
        }
      : null,
  }));
}

/**
 * Messages that still need an automatic or manual listing assignment.
 *
 * @param {string} userId
 * @param {number} [limit]
 * @param {{sortAt:number,id:string}|null} [cursor]
 * @returns {Array<{id:string,subject:string|null,textBody:string|null,matchSortAt:number}>}
 */
export function getUnmatchedMailMessages(userId, limit = 200, cursor = null) {
  const cursorSortAt = Number(cursor?.sortAt);
  const hasCursor = Number.isFinite(cursorSortAt) && typeof cursor?.id === 'string' && cursor.id.length > 0;
  return SqliteConnection.query(
    `SELECT m.id, m.subject, m.text_body AS textBody,
            COALESCE(m.received_at, m.created_at) AS matchSortAt
       FROM mail_messages m
       JOIN mail_accounts a ON a.id = m.account_id
       LEFT JOIN mail_message_listing_matches mm ON mm.message_id = m.id
      WHERE a.user_id = @userId
        AND mm.message_id IS NULL
        AND (
          @cursorSortAt IS NULL
          OR COALESCE(m.received_at, m.created_at) < @cursorSortAt
          OR (COALESCE(m.received_at, m.created_at) = @cursorSortAt AND m.id < @cursorId)
        )
      ORDER BY matchSortAt DESC, m.id DESC
      LIMIT @limit`,
    {
      userId,
      limit: Math.max(1, Math.min(500, Number(limit) || 200)),
      cursorSortAt: hasCursor ? cursorSortAt : null,
      cursorId: hasCursor ? cursor.id : '',
    },
  );
}

/**
 * Listings owned by the mailbox user. Shared jobs are deliberately excluded:
 * an incoming application belongs to the owner who configured the mailbox.
 *
 * @param {string} userId
 * @returns {Array<{id:string,hash:string|null,provider:string|null,title:string|null,address:string|null,link:string|null}>}
 */
export function getOwnedListingsForMailMatching(userId) {
  return SqliteConnection.query(
    `SELECT l.id, l.hash, l.provider, l.title, l.address, l.link
       FROM listings l
       JOIN jobs j ON j.id = l.job_id
      WHERE j.user_id = @userId
        AND l.manually_deleted = 0
      ORDER BY l.created_at DESC`,
    { userId },
  );
}

/**
 * Search the mailbox owner's listings for manual message assignment.
 *
 * This intentionally returns a small display shape and never includes jobs
 * merely shared with the user: the mailbox and application belong to the job
 * owner. LIKE wildcards entered by the user are escaped so they stay literal.
 *
 * @param {string} userId
 * @param {string} [query]
 * @param {number} [limit]
 * @returns {Array<{id:string,title:string|null,address:string|null,provider:string|null,link:string|null,createdAt:number|null}>}
 */
export function searchOwnedListingsForMailAssignment(userId, query = '', limit = 100) {
  const normalized = String(query ?? '')
    .trim()
    .toLowerCase();
  const escaped = normalized.replace(/[\\%_]/g, (character) => `\\${character}`);
  return SqliteConnection.query(
    `SELECT l.id, l.title, l.address, l.provider, l.link, l.created_at AS createdAt
       FROM listings l
       JOIN jobs j ON j.id = l.job_id
      WHERE j.user_id = @userId
        AND l.manually_deleted = 0
        AND (
          @query = ''
          OR LOWER(COALESCE(l.title, '') || ' ' || COALESCE(l.address, '') || ' ' ||
                   COALESCE(l.provider, '') || ' ' || COALESCE(l.link, '')) LIKE @pattern ESCAPE '\\'
        )
      ORDER BY l.created_at DESC
      LIMIT @limit`,
    {
      userId,
      query: normalized,
      pattern: `%${escaped}%`,
      limit: Math.max(1, Math.min(200, Number(limit) || 100)),
    },
  );
}

/**
 * Assign one user-owned message to one listing owned by the same user.
 * Optionally updates the existing Fredy listing status in the same transaction.
 *
 * @param {Object} assignment
 * @param {string} assignment.messageId
 * @param {string} assignment.listingId
 * @param {string} assignment.userId
 * @param {'listing_code'|'address'|'manual'} assignment.method
 * @param {number} assignment.confidence
 * @param {'applied'|'invited'|'visited'|'documents_sent'|'accepted'|'rejected'|'not_invited'} [assignment.status]
 * @returns {boolean}
 */
export function assignMailMessageToListing({ messageId, listingId, userId, method, confidence, status }) {
  const allowedMethods = ['listing_code', 'address', 'manual'];
  if (!allowedMethods.includes(method)) throw new Error(`Invalid mail match method: ${method}`);
  const normalizedStatus = status === undefined ? undefined : normalizeListingStatus(status);
  if (status !== undefined && normalizedStatus == null) throw new Error(`Invalid listing status: ${status}`);

  let assigned = false;
  SqliteConnection.withTransaction((db) => {
    const message = db
      .prepare(
        `SELECT m.id
           FROM mail_messages m
           JOIN mail_accounts a ON a.id = m.account_id
          WHERE m.id = @messageId AND a.user_id = @userId`,
      )
      .get({ messageId, userId });
    const listing = db
      .prepare(
        `SELECT l.id
           FROM listings l
           JOIN jobs j ON j.id = l.job_id
          WHERE l.id = @listingId
            AND j.user_id = @userId
            AND l.manually_deleted = 0`,
      )
      .get({ listingId, userId });
    if (!message || !listing) return;

    const now = Date.now();
    db.prepare(
      `INSERT INTO mail_message_listing_matches
         (message_id, listing_id, method, confidence, created_at, updated_at)
       VALUES (@messageId, @listingId, @method, @confidence, @now, @now)
       ON CONFLICT(message_id) DO UPDATE SET
         listing_id = excluded.listing_id,
         method = excluded.method,
         confidence = excluded.confidence,
         updated_at = excluded.updated_at`,
    ).run({
      messageId,
      listingId,
      method,
      confidence: Math.max(0, Math.min(100, Math.round(Number(confidence) || 0))),
      now,
    });

    if (normalizedStatus !== undefined) {
      db.prepare(`UPDATE listings SET status = @status WHERE id = @listingId`).run({
        listingId,
        status: JSON.stringify({ status: normalizedStatus, setAt: now }),
      });
      db.prepare(
        `INSERT INTO watch_list (id, listing_id, user_id)
         VALUES (@id, @listingId, @userId)
         ON CONFLICT(listing_id, user_id) DO NOTHING`,
      ).run({ id: nanoid(), listingId, userId });
    }
    assigned = true;
  });
  return assigned;
}

/**
 * Remove a match without deleting the message or changing listing status.
 *
 * @param {string} messageId
 * @param {string} userId
 * @returns {boolean}
 */
export function removeMailMessageListingMatch(messageId, userId) {
  return (
    SqliteConnection.execute(
      `DELETE FROM mail_message_listing_matches
       WHERE message_id = @messageId
         AND EXISTS (
           SELECT 1
             FROM mail_messages m
             JOIN mail_accounts a ON a.id = m.account_id
            WHERE m.id = @messageId AND a.user_id = @userId
         )`,
      { messageId, userId },
    ).changes > 0
  );
}
