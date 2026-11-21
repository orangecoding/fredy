/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * What a user does to a listing: mark it, annotate it, watch it, remove it.
 *
 * The listing routes (`listingsRouter.js`) and the MCP listing tools both call these. The storage
 * underneath addresses a listing by id alone and would write to anybody's, so the one thing every
 * function here does first is the access check - owner of the listing's job, someone it was shared
 * with, or an admin - and with it in one place no caller can forget it.
 */

import {
  deleteListingsById,
  filterListingIdsForUser,
  setListingNotes,
  setListingStatus,
  userCanAccessListing,
} from '../storage/listingsStorage.js';
import { deleteWatch, ensureWatch, toggleWatch } from '../storage/watchListStorage.js';
import { getSettings } from '../storage/settingsStorage.js';
import { fail } from '../serviceResult.js';

/**
 * @typedef {import('../serviceResult.js').ServiceFailure} ServiceFailure
 * @typedef {{id: string, isAdmin?: boolean}} User
 */

/**
 * Deliberately identical for "listing does not exist" and "listing belongs to someone else", so the
 * answer cannot be used to probe which ids are real.
 */
export const NO_LISTING_ACCESS = 'You are trying to access a listing that is not associated to your user';

/**
 * The most text a listing's notes may hold, whoever writes them.
 * @type {number}
 */
export const MAX_LISTING_NOTES_LENGTH = 20000;

/** The decisions a listing can be marked with. No status at all is `null`. */
export const LISTING_STATUSES = Object.freeze(['applied', 'rejected', 'accepted']);

/**
 * Why the user may not touch this listing, or null when they may.
 *
 * @param {User} user
 * @param {string} listingId
 * @returns {ServiceFailure|null}
 */
function accessRefusal(user, listingId) {
  if (!listingId || !user?.id) return fail('invalid', 'listingId or user not provided');
  if (!userCanAccessListing(listingId, user.id, user.isAdmin === true)) return fail('forbidden', NO_LISTING_ACCESS);
  return null;
}

/**
 * Mark a listing with a decision, or clear it.
 *
 * A listing somebody has applied to, or decided on, is one they are following, so a status also
 * puts it on their watchlist. Clearing the status is not unfollowing it.
 *
 * @param {User} user
 * @param {string} listingId
 * @param {string|null|undefined} status - One of {@link LISTING_STATUSES} in any case, or null to clear.
 * @returns {ServiceFailure|{ok: true, status: string|null}}
 */
export function setListingStatusFor(user, listingId, status) {
  const normalized = status == null ? null : String(status).toLowerCase();
  if (normalized != null && !LISTING_STATUSES.includes(normalized)) return fail('invalid', `Invalid status: ${status}`);
  const refusal = accessRefusal(user, listingId);
  if (refusal) return refusal;

  if (setListingStatus(listingId, normalized) === 0) return fail('notFound', 'Listing not found');
  if (normalized != null) ensureWatch(listingId, user.id);
  return { ok: true, status: normalized };
}

/**
 * Replace a listing's notes. Anything but a string clears them.
 *
 * @param {User} user
 * @param {string} listingId
 * @param {unknown} notes
 * @returns {ServiceFailure|{ok: true, notes: string|null}}
 */
export function setListingNotesFor(user, listingId, notes) {
  const value = typeof notes === 'string' ? notes : null;
  if (value != null && value.length > MAX_LISTING_NOTES_LENGTH) {
    return fail('invalid', `Notes may be at most ${MAX_LISTING_NOTES_LENGTH} characters long.`, { code: 'tooLong' });
  }
  const refusal = accessRefusal(user, listingId);
  if (refusal) return refusal;

  if (setListingNotes(listingId, value) === 0) return fail('notFound', 'Listing not found');
  return { ok: true, notes: value };
}

/**
 * Put a listing on the user's watchlist. Already watched is not an error.
 *
 * @param {User} user
 * @param {string} listingId
 * @returns {ServiceFailure|{ok: true}}
 */
export function watchListingFor(user, listingId) {
  const refusal = accessRefusal(user, listingId);
  if (refusal) return refusal;
  if (!ensureWatch(listingId, user.id).watched) return fail('failed', 'Could not add the listing to the watchlist.');
  return { ok: true };
}

/**
 * Take a listing off the user's watchlist. Not watched is not an error.
 *
 * @param {User} user
 * @param {string} listingId
 * @returns {ServiceFailure|{ok: true, changed: boolean}} `changed` is whether it was watched before.
 */
export function unwatchListingFor(user, listingId) {
  const refusal = accessRefusal(user, listingId);
  if (refusal) return refusal;
  return { ok: true, changed: deleteWatch(listingId, user.id).deleted };
}

/**
 * Flip whether a listing is on the user's watchlist, as the star in the web UI does.
 *
 * @param {User} user
 * @param {string} listingId
 * @returns {ServiceFailure|{ok: true, watched: boolean}}
 */
export function toggleListingWatchFor(user, listingId) {
  const refusal = accessRefusal(user, listingId);
  if (refusal) return refusal;
  return { ok: true, watched: toggleWatch(listingId, user.id).watched };
}

/**
 * Remove listings: hidden by default (the web UI can restore them), or for good.
 *
 * All or nothing: a request that names even one listing the user may not touch is refused whole,
 * rather than deleting the part they happened to own. A hard delete cannot be undone, so a partial
 * success would be impossible to reason about afterwards.
 *
 * @param {User} user
 * @param {string[]} ids
 * @param {{hard?: boolean}} [options]
 * @returns {Promise<ServiceFailure|{ok: true, deleted: number}>}
 */
export async function deleteListingsFor(user, ids, { hard = false } = {}) {
  if (user?.isAdmin !== true && (await getSettings()).demoMode) {
    return fail('forbidden', 'Sorry, but you cannot remove listings in demo mode ;)');
  }
  if (!Array.isArray(ids) || ids.length === 0) return { ok: true, deleted: 0 };

  const allowed = filterListingIdsForUser(ids, user?.id, user?.isAdmin === true);
  if (allowed.length !== new Set(ids).size) return fail('forbidden', NO_LISTING_ACCESS);
  deleteListingsById(allowed, hard === true);
  return { ok: true, deleted: allowed.length };
}
