/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import {
  assignMailMessageToListing,
  getMatchedMailThreadAnchors,
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

function normalizeMessageId(value) {
  return String(value ?? '').trim();
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
  const listings = options.listings ?? getOwnedListingsForMailMatching(userId);
  const assign = options.assign ?? assignMailMessageToListing;
  const getMessages = options.getMessages ?? getUnmatchedMailMessages;
  const hasInjectedMessageSource = options.messages !== undefined || options.getMessages !== undefined;
  const anchors = options.anchors ?? (hasInjectedMessageSource ? [] : getMatchedMailThreadAnchors(userId));
  const pageSize = Math.max(1, Math.min(500, Number(options.pageSize) || 200));
  let matched = 0;
  let ambiguous = 0;
  let processed = 0;
  let cursor = null;
  const unresolved = [];

  const prepared = listings.map((listing) => ({
    ...listing,
    codes: extractListingCodes(listing.link),
    normalizedAddress: normalizeMatchableAddress(listing.address),
  }));
  const listingById = new Map(prepared.map((listing) => [listing.id, listing]));
  const threadAnchors = new Map();
  const addThreadAnchor = (messageId, listingId) => {
    const normalized = normalizeMessageId(messageId);
    if (!normalized || !listingById.has(listingId)) return;
    const listingIds = threadAnchors.get(normalized) ?? new Set();
    listingIds.add(listingId);
    threadAnchors.set(normalized, listingIds);
  };
  for (const anchor of anchors) addThreadAnchor(anchor.messageId, anchor.listingId);

  while (true) {
    const messages = options.messages
      ? cursor == null
        ? options.messages
        : []
      : getMessages(userId, pageSize, cursor);
    if (messages.length === 0) break;
    processed += messages.length;

    for (const message of messages) {
      const text = normalizeMailMatchText([message.subject, message.textBody].filter(Boolean).join('\n'));
      if (!text) {
        unresolved.push({ message, directAmbiguous: false });
        continue;
      }

      const codeCandidates = prepared.filter((listing) => listing.codes.some((code) => containsPhrase(text, code)));
      let candidate = codeCandidates.length === 1 ? codeCandidates[0] : null;
      let method = 'listing_code';
      let confidence = 100;
      let directAmbiguous = codeCandidates.length > 1;

      if (codeCandidates.length === 0) {
        const addressCandidates = prepared.filter(
          (listing) => listing.normalizedAddress && containsPhrase(text, listing.normalizedAddress),
        );
        candidate = addressCandidates.length === 1 ? addressCandidates[0] : null;
        method = 'address';
        confidence = 85;
        directAmbiguous = addressCandidates.length > 1;
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
        addThreadAnchor(message.messageId, candidate.id);
      } else {
        unresolved.push({
          message,
          directAmbiguous,
        });
      }
    }

    if (options.messages || messages.length < pageSize) break;
    const last = messages.at(-1);
    const nextCursor = { sortAt: Number(last.matchSortAt), id: last.id };
    if (!Number.isFinite(nextCursor.sortAt) || !nextCursor.id) break;
    cursor = nextCursor;
  }

  // Direct matches above seed anchors for every message in this run. Resolve
  // replies iteratively so a chain can inherit through another newly matched
  // reply even when messages were returned newest-first by IMAP.
  let pending = unresolved;
  let madeProgress = true;
  while (madeProgress && pending.length > 0) {
    madeProgress = false;
    const next = [];
    for (const entry of pending) {
      const references = [entry.message.inReplyTo, ...(entry.message.references ?? [])]
        .map(normalizeMessageId)
        .filter(Boolean);
      const candidateIds = new Set();
      for (const reference of references) {
        for (const listingId of threadAnchors.get(reference) ?? []) candidateIds.add(listingId);
      }
      if (candidateIds.size !== 1) {
        next.push({ ...entry, threadAmbiguous: candidateIds.size > 1 });
        continue;
      }

      const [listingId] = candidateIds;
      if (
        assign({
          messageId: entry.message.id,
          listingId,
          userId,
          method: 'thread',
          confidence: 95,
        })
      ) {
        matched += 1;
        madeProgress = true;
        addThreadAnchor(entry.message.messageId, listingId);
      } else {
        next.push(entry);
      }
    }
    pending = next;
  }
  ambiguous += pending.filter((entry) => entry.directAmbiguous || entry.threadAmbiguous).length;

  return { processed, matched, ambiguous };
}
