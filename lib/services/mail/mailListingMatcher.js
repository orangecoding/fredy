/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import {
  assignMailMessageToListing,
  getOwnedListingsForMailMatching,
  getUnmatchedMailMessages,
} from '../storage/mailStorage.js';

/**
 * Make punctuation, casing and German diacritics irrelevant while retaining
 * word boundaries needed for conservative exact matching.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeMailMatchText(value) {
  return String(value ?? '')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * IDs from listing URLs are more reliable than addresses. Only URL tokens
 * containing a digit are accepted; common words such as "wohnung" can never
 * become a match key, and five-digit German postal codes are excluded.
 *
 * @param {string|null|undefined} link
 * @returns {string[]}
 */
export function extractListingCodes(link) {
  if (!link) return [];
  const candidates = new Set();
  const addTokens = (value) => {
    let decoded = String(value);
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      // A malformed portal URL is still safe to tokenize in its raw form.
    }
    for (const token of normalizeMailMatchText(decoded).split(' ')) {
      const hasLetter = /[a-z]/.test(token);
      const hasDigit = /\d/.test(token);
      if (!hasDigit) continue;
      if ((!hasLetter && token.length < 6) || (hasLetter && token.length < 5)) continue;
      candidates.add(token);
    }
  };

  try {
    const url = new URL(link);
    for (const segment of url.pathname.split('/')) addTokens(segment);
    for (const [name, value] of url.searchParams) {
      if (/^(id|objectid|listingid|offerid|adid|expose|exposeid|oid)$/i.test(name)) addTokens(value);
    }
  } catch {
    addTokens(link);
  }
  return [...candidates];
}

/**
 * A city or postal code is not enough for an address match. Require a house
 * number that is not a five-digit postcode and a meaningful street name.
 *
 * @param {string|null|undefined} address
 * @returns {string|null}
 */
export function normalizeMatchableAddress(address) {
  const normalized = normalizeMailMatchText(address);
  if (normalized.length < 8 || !/[a-z]/.test(normalized)) return null;
  const hasHouseNumber = normalized.split(' ').some((token) => /^\d{1,4}[a-z]?$/.test(token));
  return hasHouseNumber ? normalized : null;
}

function containsPhrase(text, phrase) {
  return ` ${text} `.includes(` ${phrase} `);
}

/**
 * Match all currently unassigned messages belonging to one user.
 *
 * Listing code wins over address. A match is persisted only when exactly one
 * owned listing qualifies; ambiguous messages stay available for manual work.
 *
 * @param {string} userId
 * @param {Object} [options]
 * @returns {Promise<{processed:number,matched:number,ambiguous:number}>}
 */
export async function matchUnmatchedMailMessages(userId, options = {}) {
  const messages = options.messages ?? getUnmatchedMailMessages(userId);
  const listings = options.listings ?? getOwnedListingsForMailMatching(userId);
  const assign = options.assign ?? assignMailMessageToListing;
  let matched = 0;
  let ambiguous = 0;

  const prepared = listings.map((listing) => ({
    ...listing,
    codes: extractListingCodes(listing.link),
    normalizedAddress: normalizeMatchableAddress(listing.address),
  }));

  for (const message of messages) {
    const text = normalizeMailMatchText([message.subject, message.textBody].filter(Boolean).join('\n'));
    if (!text) continue;

    const codeCandidates = prepared.filter((listing) => listing.codes.some((code) => containsPhrase(text, code)));
    let candidate = codeCandidates.length === 1 ? codeCandidates[0] : null;
    let method = 'listing_code';
    let confidence = 100;

    if (codeCandidates.length === 0) {
      const addressCandidates = prepared.filter(
        (listing) => listing.normalizedAddress && containsPhrase(text, listing.normalizedAddress),
      );
      candidate = addressCandidates.length === 1 ? addressCandidates[0] : null;
      method = 'address';
      confidence = 85;
      if (addressCandidates.length > 1) ambiguous += 1;
    } else if (codeCandidates.length > 1) {
      ambiguous += 1;
    }

    if (
      candidate &&
      assign({
        messageId: message.id,
        listingId: candidate.id,
        userId,
        method,
        confidence,
      })
    ) {
      matched += 1;
    }
  }

  return { processed: messages.length, matched, ambiguous };
}
