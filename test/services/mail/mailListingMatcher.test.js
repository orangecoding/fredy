/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it, vi } from 'vitest';
import {
  extractListingCodes,
  matchUnmatchedMailMessages,
  normalizeMailMatchText,
  normalizeMatchableAddress,
} from '../../../lib/services/mail/mailListingMatcher.js';

describe('mailListingMatcher normalization', () => {
  it('normalizes German text and extracts safe URL identifiers', () => {
    expect(normalizeMailMatchText('Grüße aus der Goethestraße!')).toBe('grusse aus der goethestrasse');
    expect(extractListingCodes('https://www.immobilienscout24.de/expose/123456789')).toEqual(['123456789']);
    expect(extractListingCodes('https://example.com/wohnung/10115/berlin')).toEqual([]);
  });

  it('requires a street-level address with a house number', () => {
    expect(normalizeMatchableAddress('Goethestraße 18, 10625 Berlin')).toBe('goethestrasse 18 10625 berlin');
    expect(normalizeMatchableAddress('10625 Berlin')).toBeNull();
  });
});

describe('matchUnmatchedMailMessages', () => {
  const listings = [
    {
      id: 'listing-1',
      link: 'https://www.immobilienscout24.de/expose/123456789',
      address: 'Goethestraße 18, 10625 Berlin',
    },
    {
      id: 'listing-2',
      link: 'https://www.wg-gesucht.de/9876543.html',
      address: 'Kantstraße 10, 10623 Berlin',
    },
  ];

  it('prefers a unique listing code over another address in the same message', async () => {
    const assign = vi.fn(() => true);
    const result = await matchUnmatchedMailMessages('user-1', {
      messages: [
        {
          id: 'message-1',
          subject: 'Ihre Anfrage 123456789',
          textBody: 'Unser Büro ist in der Kantstraße 10, 10623 Berlin.',
        },
      ],
      listings,
      assign,
    });

    expect(assign).toHaveBeenCalledWith({
      messageId: 'message-1',
      listingId: 'listing-1',
      userId: 'user-1',
      method: 'listing_code',
      confidence: 100,
    });
    expect(result).toEqual({ processed: 1, matched: 1, ambiguous: 0 });
  });

  it('uses an exact normalized address when no listing code is present', async () => {
    const assign = vi.fn(() => true);
    await matchUnmatchedMailMessages('user-1', {
      messages: [{ id: 'message-2', subject: 'Besichtigung', textBody: 'Objekt: Goethestrasse 18, 10625 Berlin' }],
      listings,
      assign,
    });

    expect(assign).toHaveBeenCalledWith(expect.objectContaining({ listingId: 'listing-1', method: 'address' }));
  });

  it('leaves duplicate identifiers unmatched for manual selection', async () => {
    const assign = vi.fn(() => true);
    const result = await matchUnmatchedMailMessages('user-1', {
      messages: [{ id: 'message-3', subject: '123456789', textBody: null }],
      listings: [...listings, { ...listings[0], id: 'listing-duplicate' }],
      assign,
    });

    expect(assign).not.toHaveBeenCalled();
    expect(result).toEqual({ processed: 1, matched: 0, ambiguous: 1 });
  });

  it('paginates past recent nonmatches so older messages are not starved', async () => {
    const assign = vi.fn(() => true);
    const getMessages = vi
      .fn()
      .mockReturnValueOnce([
        { id: 'new-2', subject: 'Newsletter', textBody: null, matchSortAt: 300 },
        { id: 'new-1', subject: 'General reply', textBody: null, matchSortAt: 200 },
      ])
      .mockReturnValueOnce([{ id: 'old-match', subject: 'Ihre Anfrage 123456789', textBody: null, matchSortAt: 100 }]);

    const result = await matchUnmatchedMailMessages('user-1', {
      getMessages,
      pageSize: 2,
      listings,
      assign,
    });

    expect(getMessages).toHaveBeenNthCalledWith(2, 'user-1', 2, { sortAt: 200, id: 'new-1' });
    expect(assign).toHaveBeenCalledWith(expect.objectContaining({ messageId: 'old-match', listingId: 'listing-1' }));
    expect(result).toEqual({ processed: 3, matched: 1, ambiguous: 0 });
  });
});
