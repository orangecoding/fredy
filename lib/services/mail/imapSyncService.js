/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { decryptMailCredential } from './mailCredentialCrypto.js';
import { matchUnmatchedMailMessages } from './mailListingMatcher.js';
import logger from '../logger.js';
import {
  getMailAccountWithCredential,
  markMailSyncFailed,
  markMailSyncSuccessful,
  storeMailMessage,
} from '../storage/mailStorage.js';

export const INITIAL_SYNC_DAYS = 30;
export const MAX_MESSAGE_BYTES = 1024 * 1024;

/**
 * Build the network client behind a seam that tests can replace without
 * opening a real mailbox.
 *
 * @param {Object} config
 * @returns {ImapFlow}
 */
function defaultClientFactory(config) {
  return new ImapFlow({ ...config, logger: false, disableAutoIdle: true });
}

/**
 * Normalize the address shape returned by mailparser or ImapFlow.
 *
 * @param {Object|undefined|null} addressObject
 * @returns {{name:string|null,address:string|null}}
 */
function firstAddress(addressObject) {
  const value = addressObject?.value?.[0] ?? addressObject?.[0] ?? null;
  return {
    name: value?.name ?? null,
    address: value?.address ?? null,
  };
}

/**
 * Normalize a message-id reference collection.
 *
 * @param {unknown} references
 * @returns {string[]}
 */
function normalizeReferences(references) {
  if (Array.isArray(references)) return references.map(String).filter(Boolean);
  if (typeof references === 'string') return references.split(/\s+/).filter(Boolean);
  return [];
}

/**
 * Read one message. Large messages are represented by their envelope only so
 * an attachment cannot exhaust Fredy's memory during inbox synchronization.
 * HTML is deliberately discarded; the inbox UI will render plain text.
 *
 * @param {Object} client
 * @param {number} uid
 * @returns {Promise<Object|null>}
 */
async function readMessage(client, uid) {
  const metadata = await client.fetchOne(uid, { uid: true, envelope: true, size: true }, { uid: true });
  if (!metadata) return null;

  let parsed = null;
  if (!metadata.size || metadata.size <= MAX_MESSAGE_BYTES) {
    const content = await client.fetchOne(uid, { source: true }, { uid: true });
    if (content?.source) {
      parsed = await simpleParser(content.source, {
        skipHtmlToText: true,
        skipTextToHtml: true,
        skipImageLinks: true,
      });
    }
  }

  const sender = firstAddress(parsed?.from ?? metadata.envelope?.from);
  return {
    uid: Number(metadata.uid ?? uid),
    messageId: parsed?.messageId ?? metadata.envelope?.messageId ?? null,
    inReplyTo: parsed?.inReplyTo ?? metadata.envelope?.inReplyTo ?? null,
    references: normalizeReferences(parsed?.references),
    senderName: sender.name,
    senderAddress: sender.address,
    subject: parsed?.subject ?? metadata.envelope?.subject ?? null,
    receivedAt: (parsed?.date ?? metadata.envelope?.date)?.getTime?.() ?? null,
    textBody: parsed?.text?.trim() || null,
  };
}

/**
 * Connect to an IMAP account and confirm that the configured mailbox opens.
 * No messages are downloaded.
 *
 * @param {Object} account
 * @param {Object} [options]
 * @returns {Promise<void>}
 */
export async function testMailConnection(account, options = {}) {
  const clientFactory = options.clientFactory ?? defaultClientFactory;
  const client = clientFactory({
    host: account.host,
    port: account.port,
    secure: account.secure,
    auth: { user: account.username, pass: account.password },
  });
  let lock;
  try {
    await client.connect();
    lock = await client.getMailboxLock(account.mailbox ?? 'INBOX');
  } finally {
    lock?.release();
    if (client.usable !== false) await client.logout().catch(() => {});
  }
}

/**
 * Synchronize new messages for one user-owned account.
 *
 * On the first run, only the last 30 days are searched. Later runs resume from
 * the highest stored UID. A changed UIDVALIDITY resets that cursor and starts
 * another bounded initial scan.
 *
 * @param {string} accountId
 * @param {string} userId Ownership boundary for API-triggered syncs.
 * @param {Object} [options]
 * @returns {Promise<{fetched:number,stored:number,matched:number,lastUid:number|null}>}
 */
export async function syncMailAccount(accountId, userId, options = {}) {
  const account = getMailAccountWithCredential(accountId, userId);
  if (!account) throw new Error('IMAP account not found.');
  if (!account.enabled) throw new Error('IMAP account is disabled.');

  const clientFactory = options.clientFactory ?? defaultClientFactory;
  const now = options.now ?? Date.now();
  const client = clientFactory({
    host: account.host,
    port: account.port,
    secure: account.secure,
    auth: { user: account.username, pass: decryptMailCredential(account.passwordEncrypted) },
  });

  let lock;
  try {
    await client.connect();
    lock = await client.getMailboxLock(account.mailbox);
    const uidValidity = String(client.mailbox?.uidValidity ?? '0');
    const resume = account.uidValidity === uidValidity && account.lastUid != null;
    const query = resume
      ? { uid: `${Number(account.lastUid) + 1}:*` }
      : { since: new Date(now - INITIAL_SYNC_DAYS * 24 * 60 * 60 * 1000) };
    const searchResult = await client.search(query, { uid: true });
    const uids = (Array.isArray(searchResult) ? searchResult : []).map(Number).filter(Number.isFinite);

    let stored = 0;
    let lastUid = resume ? Number(account.lastUid) : null;
    for (const uid of uids.sort((a, b) => a - b)) {
      const message = await readMessage(client, uid);
      if (!message) continue;
      if (
        storeMailMessage({
          ...message,
          accountId: account.id,
          mailbox: account.mailbox,
          uidValidity,
        })
      ) {
        stored += 1;
      }
      lastUid = Math.max(lastUid ?? 0, message.uid);
    }

    markMailSyncSuccessful(account.id, uidValidity, lastUid);
    let matched = 0;
    try {
      matched = (await (options.matcher ?? matchUnmatchedMailMessages)(userId)).matched;
    } catch (error) {
      // Mail was downloaded successfully, so a later matching failure must not
      // move the IMAP cursor backwards or report a connection failure.
      logger.warn('Could not match incoming messages to listings.', error);
    }
    return { fetched: uids.length, stored, matched, lastUid };
  } catch (error) {
    markMailSyncFailed(account.id, error.message);
    throw error;
  } finally {
    lock?.release();
    if (client.usable !== false) await client.logout().catch(() => {});
  }
}
