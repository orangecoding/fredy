/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { decryptMailCredential, encryptMailCredential } from '../../services/mail/mailCredentialCrypto.js';
import { syncMailAccount, testMailConnection } from '../../services/mail/imapSyncService.js';
import { matchUnmatchedMailMessages } from '../../services/mail/mailListingMatcher.js';
import { normalizeListingStatus } from '../../services/listings/listingStatus.js';
import {
  assignMailMessageToListing,
  deleteMailAccount,
  getMailAccount,
  getMailAccountWithCredential,
  getMailMessages,
  removeMailMessageListingMatch,
  searchOwnedListingsForMailAssignment,
  upsertMailAccount,
} from '../../services/storage/mailStorage.js';

/**
 * Validate and normalize the account fields accepted from the UI.
 *
 * @param {Object} input
 * @returns {Object}
 */
function normalizeAccountInput(input) {
  const host = String(input?.host ?? '').trim();
  const username = String(input?.username ?? '').trim();
  const mailbox = String(input?.mailbox ?? 'INBOX').trim();
  const port = Number(input?.port);
  if (!host || !username || !mailbox) throw new Error('Host, username and mailbox are required.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be between 1 and 65535.');
  return { host, username, mailbox, port, secure: input?.secure !== false, enabled: input?.enabled !== false };
}

/**
 * User-owned IMAP account and incoming message endpoints.
 *
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function mailPlugin(fastify) {
  fastify.get('/account', async (request) => getMailAccount(request.session.currentUser));

  fastify.put('/account', async (request, reply) => {
    const userId = request.session.currentUser;
    try {
      const input = normalizeAccountInput(request.body);
      const current = getMailAccount(userId);
      const password = request.body?.password;
      let passwordEncrypted;
      if (typeof password === 'string' && password.length > 0) {
        passwordEncrypted = encryptMailCredential(password);
      } else if (current) {
        passwordEncrypted = getMailAccountWithCredential(current.id, userId)?.passwordEncrypted;
      }
      if (!passwordEncrypted) throw new Error('An IMAP password is required.');
      return upsertMailAccount({ ...input, userId, passwordEncrypted });
    } catch (error) {
      return reply.code(400).send({ error: error.message });
    }
  });

  fastify.delete('/account', async (request) => ({ deleted: deleteMailAccount(request.session.currentUser) }));

  fastify.post('/account/test', async (request, reply) => {
    const userId = request.session.currentUser;
    const account = getMailAccount(userId);
    if (!account) return reply.code(404).send({ error: 'IMAP account not found.' });
    try {
      const stored = getMailAccountWithCredential(account.id, userId);
      await testMailConnection({
        ...stored,
        password: decryptMailCredential(stored.passwordEncrypted),
      });
      return { success: true };
    } catch (error) {
      return reply.code(400).send({ error: error.message });
    }
  });

  fastify.post('/sync', async (request, reply) => {
    const userId = request.session.currentUser;
    const account = getMailAccount(userId);
    if (!account) return reply.code(404).send({ error: 'IMAP account not found.' });
    try {
      return await syncMailAccount(account.id, userId);
    } catch (error) {
      return reply.code(502).send({ error: error.message });
    }
  });

  fastify.post('/match', async (request) => matchUnmatchedMailMessages(request.session.currentUser));

  fastify.get('/messages', async (request) => getMailMessages(request.session.currentUser, request.query?.limit));

  fastify.get('/listings', async (request) =>
    searchOwnedListingsForMailAssignment(request.session.currentUser, request.query?.query, request.query?.limit),
  );

  fastify.put('/messages/:messageId/listing', async (request, reply) => {
    const userId = request.session.currentUser;
    const messageId = String(request.params?.messageId ?? '');
    const listingId = String(request.body?.listingId ?? '');
    const status = request.body?.status === undefined ? undefined : normalizeListingStatus(request.body.status);
    if (!messageId || !listingId) return reply.code(400).send({ error: 'messageId and listingId are required.' });
    if (request.body?.status !== undefined && status == null) {
      return reply.code(400).send({ error: `Invalid listing status: ${request.body?.status}` });
    }

    const assigned = assignMailMessageToListing({
      messageId,
      listingId,
      userId,
      method: 'manual',
      confidence: 100,
      status,
    });
    if (!assigned) return reply.code(404).send({ error: 'Message or listing not found.' });
    return { assigned: true };
  });

  fastify.delete('/messages/:messageId/listing', async (request, reply) => {
    const removed = removeMailMessageListingMatch(String(request.params?.messageId ?? ''), request.session.currentUser);
    if (!removed) return reply.code(404).send({ error: 'Mail match not found.' });
    return { removed: true };
  });
}
