/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => []);
const owned = vi.hoisted(() => ({ message: true, listing: true }));
const sqliteMock = vi.hoisted(() => ({
  execute: vi.fn((sql, params) => {
    calls.push({ sql, params });
    return { changes: 1 };
  }),
  query: vi.fn(() => []),
  withTransaction: vi.fn((callback) =>
    callback({
      prepare: (sql) => ({
        get: () => {
          if (/FROM mail_messages/.test(sql)) return owned.message ? { id: 'message-1' } : undefined;
          if (/FROM listings/.test(sql)) return owned.listing ? { id: 'listing-1' } : undefined;
          return undefined;
        },
        run: (params) => {
          calls.push({ sql, params });
          return { changes: 1 };
        },
      }),
    }),
  ),
}));

vi.mock('../../lib/services/storage/SqliteConnection.js', () => ({ default: sqliteMock }));

const {
  assignMailMessageToListing,
  getUnmatchedMailMessages,
  removeMailMessageListingMatch,
  searchOwnedListingsForMailAssignment,
} = await import('../../lib/services/storage/mailStorage.js');

beforeEach(() => {
  calls.length = 0;
  owned.message = true;
  owned.listing = true;
  vi.clearAllMocks();
});

describe('mail matching storage ownership', () => {
  it('assigns owned rows and updates listing status atomically', () => {
    expect(
      assignMailMessageToListing({
        messageId: 'message-1',
        listingId: 'listing-1',
        userId: 'user-1',
        method: 'manual',
        confidence: 100,
        status: 'documents_sent',
      }),
    ).toBe(true);

    expect(calls.find((call) => /INSERT INTO mail_message_listing_matches/.test(call.sql))).toBeTruthy();
    const statusCall = calls.find((call) => /UPDATE listings SET status/.test(call.sql));
    expect(JSON.parse(statusCall.params.status).status).toBe('documents_sent');
    const watchCall = calls.find((call) => /INSERT INTO watch_list/.test(call.sql));
    expect(watchCall.params).toEqual(expect.objectContaining({ listingId: 'listing-1', userId: 'user-1' }));
  });

  it('does not assign a listing outside the mailbox owner', () => {
    owned.listing = false;
    expect(
      assignMailMessageToListing({
        messageId: 'message-1',
        listingId: 'someone-elses-listing',
        userId: 'user-1',
        method: 'manual',
        confidence: 100,
      }),
    ).toBe(false);
    expect(calls.some((call) => /INSERT INTO mail_message_listing_matches/.test(call.sql))).toBe(false);
  });

  it('scopes removal through the message account owner', () => {
    expect(removeMailMessageListingMatch('message-1', 'user-1')).toBe(true);
    expect(calls[0].sql).toMatch(/a\.user_id = @userId/);
    expect(calls[0].params).toEqual({ messageId: 'message-1', userId: 'user-1' });
  });

  it('uses a stable timestamp and id cursor for unmatched message pages', () => {
    getUnmatchedMailMessages('user-1', 200, { sortAt: 1234, id: 'message-9' });

    expect(sqliteMock.query).toHaveBeenCalledWith(expect.stringMatching(/m\.id < @cursorId/), {
      userId: 'user-1',
      limit: 200,
      cursorSortAt: 1234,
      cursorId: 'message-9',
    });
  });

  it('searches only owned listings and escapes SQL wildcards', () => {
    searchOwnedListingsForMailAssignment('user-1', '50%_Berlin', 500);

    expect(sqliteMock.query).toHaveBeenCalledWith(expect.stringMatching(/j\.user_id = @userId/), {
      userId: 'user-1',
      query: '50%_berlin',
      pattern: '%50\\%\\_berlin%',
      limit: 200,
    });
  });
});
