/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({
  assignMailMessageToListing: vi.fn(),
  getMailAccountWithCredential: vi.fn(),
  getMatchedMailThreadAnchors: vi.fn(),
  getOwnedListingsForMailMatching: vi.fn(),
  getUnmatchedMailMessages: vi.fn(),
  markMailSyncFailed: vi.fn(),
  markMailSyncSuccessful: vi.fn(),
  storeMailMessage: vi.fn(),
}));

vi.mock('../../../lib/services/storage/mailStorage.js', () => storage);
vi.mock('../../../lib/services/mail/mailCredentialCrypto.js', () => ({
  decryptMailCredential: () => 'decrypted-password',
}));
vi.mock('imapflow', () => ({ ImapFlow: class {} }));
vi.mock('mailparser', () => ({
  simpleParser: vi.fn(async () => ({
    messageId: '<mail-1@example.com>',
    inReplyTo: '<application@example.com>',
    references: ['<application@example.com>'],
    from: { value: [{ name: 'Agent', address: 'agent@example.com' }] },
    subject: 'Viewing invitation',
    date: new Date('2026-08-12T10:00:00Z'),
    text: 'You are invited.',
  })),
}));

const { syncMailAccount } = await import('../../../lib/services/mail/imapSyncService.js');
const { simpleParser } = await import('mailparser');

function createClient({ uids = [41], size = 500, uidValidity = 12 } = {}) {
  return {
    usable: true,
    mailbox: { uidValidity: BigInt(uidValidity) },
    connect: vi.fn(async () => {}),
    getMailboxLock: vi.fn(async () => ({ release: vi.fn() })),
    search: vi.fn(async () => uids),
    fetchOne: vi.fn(async (uid, fields) => {
      if (fields.source) return { source: Buffer.from('raw message') };
      return {
        uid,
        size,
        envelope: {
          from: [{ name: 'Fallback', address: 'fallback@example.com' }],
          subject: 'Fallback subject',
          date: new Date('2026-08-12T09:00:00Z'),
        },
      };
    }),
    logout: vi.fn(async () => {}),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  storage.getMailAccountWithCredential.mockReturnValue({
    id: 'account-1',
    userId: 'user-1',
    host: 'imap.example.com',
    port: 993,
    secure: true,
    username: 'user@example.com',
    passwordEncrypted: 'encrypted',
    mailbox: 'INBOX',
    enabled: true,
    uidValidity: null,
    lastUid: null,
  });
  storage.storeMailMessage.mockReturnValue(true);
  storage.getMatchedMailThreadAnchors.mockReturnValue([]);
  storage.getOwnedListingsForMailMatching.mockReturnValue([]);
  storage.getUnmatchedMailMessages.mockReturnValue([]);
});

describe('syncMailAccount', () => {
  it('uses a bounded date search on first sync and stores plain-text messages', async () => {
    const client = createClient();
    const now = Date.parse('2026-08-12T12:00:00Z');
    const matcher = vi.fn(async () => ({ matched: 1 }));
    const result = await syncMailAccount('account-1', 'user-1', { clientFactory: () => client, matcher, now });

    expect(client.search).toHaveBeenCalledWith({ since: new Date('2026-07-13T12:00:00Z') }, { uid: true });
    expect(storage.storeMailMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'account-1',
        uidValidity: '12',
        uid: 41,
        senderAddress: 'agent@example.com',
        subject: 'Viewing invitation',
        textBody: 'You are invited.',
      }),
    );
    expect(simpleParser).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({ skipHtmlToText: false, skipTextToHtml: true }),
    );
    expect(storage.markMailSyncSuccessful).toHaveBeenCalledWith('account-1', '12', 41);
    expect(matcher).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({ fetched: 1, stored: 1, matched: 1, lastUid: 41 });
  });

  it('resumes from the next UID when UIDVALIDITY is unchanged', async () => {
    storage.getMailAccountWithCredential.mockReturnValue({
      ...storage.getMailAccountWithCredential(),
      uidValidity: '12',
      lastUid: 41,
    });
    const client = createClient({ uids: [] });

    await syncMailAccount('account-1', 'user-1', { clientFactory: () => client });

    expect(client.search).toHaveBeenCalledWith({ uid: '42:*' }, { uid: true });
    expect(storage.markMailSyncSuccessful).toHaveBeenCalledWith('account-1', '12', 41);
  });

  it('filters the cursor UID returned by an empty reversed IMAP range', async () => {
    storage.getMailAccountWithCredential.mockReturnValue({
      ...storage.getMailAccountWithCredential(),
      uidValidity: '12',
      lastUid: 41,
    });
    const client = createClient({ uids: [41] });

    const result = await syncMailAccount('account-1', 'user-1', { clientFactory: () => client });

    expect(client.search).toHaveBeenCalledWith({ uid: '42:*' }, { uid: true });
    expect(client.fetchOne).not.toHaveBeenCalled();
    expect(storage.markMailSyncSuccessful).toHaveBeenCalledWith('account-1', '12', 41);
    expect(result).toEqual({ fetched: 0, stored: 0, matched: 0, lastUid: 41 });
  });

  it('does not download the source of a message larger than the safety limit', async () => {
    const client = createClient({ size: 2 * 1024 * 1024 });

    await syncMailAccount('account-1', 'user-1', { clientFactory: () => client });

    expect(client.fetchOne).toHaveBeenCalledTimes(1);
    expect(storage.storeMailMessage).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Fallback subject', textBody: null }),
    );
  });

  it('records a safe failure message before returning the error', async () => {
    const client = createClient();
    client.connect.mockRejectedValue(new Error('authentication failed'));

    await expect(syncMailAccount('account-1', 'user-1', { clientFactory: () => client })).rejects.toThrow(
      'authentication failed',
    );
    expect(storage.markMailSyncFailed).toHaveBeenCalledWith('account-1', 'authentication failed');
  });

  it('shares one IMAP operation between concurrent sync requests', async () => {
    const client = createClient();
    const clientFactory = vi.fn(() => client);

    const [first, second] = await Promise.all([
      syncMailAccount('account-1', 'user-1', { clientFactory }),
      syncMailAccount('account-1', 'user-1', { clientFactory }),
    ]);

    expect(clientFactory).toHaveBeenCalledTimes(1);
    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });
});
