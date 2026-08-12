/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Canonical application stages accepted by every listing-status entry point.
 * @type {readonly string[]}
 */
export const LISTING_STATUSES = Object.freeze([
  'applied',
  'invited',
  'visited',
  'documents_sent',
  'accepted',
  'rejected',
  'not_invited',
]);

/**
 * Normalize a status supplied by an API or storage caller.
 *
 * @param {unknown} status
 * @returns {string|null} A canonical status, or null when the value is invalid.
 */
export function normalizeListingStatus(status) {
  const normalized = String(status).trim().toLowerCase();
  return LISTING_STATUSES.includes(normalized) ? normalized : null;
}
