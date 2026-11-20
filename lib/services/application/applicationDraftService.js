/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * AI application drafts on one listing, asked for by a person rather than by a job run.
 *
 * The draft belongs to the listing, not to a notification channel: whichever way the user hears
 * about a listing, the draft is in Fredy, in the "Copy application" dialog, and an assistant reaches
 * the same one over MCP. The listings route and the MCP `write_application_draft` tool both call
 * {@link writeApplicationDraft}, so what it takes to write one is decided once.
 */

import logger from '../logger.js';
import { getSettings, getUserSettings } from '../storage/settingsStorage.js';
import { getListingById, setApplicationDraft } from '../storage/listingsStorage.js';
import { fail } from '../serviceResult.js';
import { APPLICANT_PROFILE_SETTING } from './applicationService.js';
import { isLlmDraftConfigured, isLlmDraftEnabled } from './llmSettings.js';
import { generateDraftForListing, profileHasName } from './llmDraft.js';

/**
 * @typedef {import('../serviceResult.js').ServiceFailure} ServiceFailure
 * @typedef {import('./llmDraft.js').ApplicationDraft} ApplicationDraft
 * @typedef {{id: string, isAdmin?: boolean}} User
 */

/**
 * Whether drafts can be written on this instance at all: switched on by an admin, with an endpoint.
 *
 * @param {Record<string, any>} settings Global settings as `getSettings()` returns them.
 * @returns {boolean}
 */
export function aiDraftsAvailable(settings) {
  return isLlmDraftEnabled(settings) && isLlmDraftConfigured(settings);
}

/**
 * The draft stored on a listing row, or null when it has none.
 *
 * @param {Record<string, any>|null|undefined} listing A row as `getListingById` returns it.
 * @returns {ApplicationDraft|null}
 */
export function storedDraftOf(listing) {
  const text = typeof listing?.application_draft === 'string' ? listing.application_draft.trim() : '';
  if (text.length === 0) return null;
  return {
    text,
    model: listing.application_draft_model ?? null,
    generatedAt: listing.application_draft_generated_at ?? null,
  };
}

/**
 * What the "Copy application" dialog shows about the AI draft.
 *
 * @param {Record<string, any>} listing A row as `getListingById` returns it.
 * @returns {Promise<{available: boolean, draft: ApplicationDraft|null}>}
 */
export async function describeAiDraft(listing) {
  return { available: aiDraftsAvailable(await getSettings()), draft: storedDraftOf(listing) };
}

/**
 * Write (or rewrite) the AI draft for one listing from the caller's own profile, letter and
 * instructions, and store it on the listing.
 *
 * Every request goes to the endpoint the admin pays for, so a stored draft is replaced only because
 * somebody asked for a new one: with `rewrite: false` a listing that has a draft answers with it and
 * nothing is requested. Without a name in the caller's applicant profile nothing is asked for: the
 * letter the model works from would have nobody in it.
 *
 * @param {User} user
 * @param {string} listingId
 * @param {Object} [options]
 * @param {boolean} [options.rewrite] Write a new draft even when the listing has one. The web
 *   dialog's buttons always do; an assistant does only when the user asks for a new version.
 * @param {string|null} [options.language] Write in this letter language instead of the portal's.
 * @param {Function} [options.fetchFn] Fetch override, for tests.
 * @returns {Promise<ServiceFailure|{ok: true, draft: ApplicationDraft, reused: boolean, listing: Object}>}
 */
export async function writeApplicationDraft(user, listingId, { rewrite = true, language = null, fetchFn } = {}) {
  const settings = await getSettings();
  if (!aiDraftsAvailable(settings)) {
    return fail(
      'unavailable',
      'AI application drafts are not set up on this Fredy. An admin can switch them on under Administration → Execution.',
      { code: 'notConfigured' },
    );
  }

  const listing =
    typeof listingId === 'string' && listingId.length > 0
      ? getListingById(listingId, user.id, user.isAdmin === true, { includeGeometry: false })
      : null;
  if (listing == null) return fail('notFound', 'Listing not found or access denied.');

  const stored = storedDraftOf(listing);
  if (!rewrite && stored != null) return { ok: true, draft: stored, reused: true, listing };

  if (!profileHasName(getUserSettings(user.id)?.[APPLICANT_PROFILE_SETTING])) {
    return fail(
      'invalid',
      'Your applicant profile has no name yet, so a draft would have nobody in it. Add one under Settings → Application.',
      { code: 'noProfileName' },
    );
  }

  try {
    const draft = await generateDraftForListing(listing, user.id, { settings, language, fetchFn });
    setApplicationDraft(listing.id, draft);
    return { ok: true, draft, reused: false, listing };
  } catch (error) {
    logger.warn(`Could not write an application draft for listing ${listing.id}: ${error?.message}`);
    return fail('failed', `The AI endpoint did not write a draft: ${error?.message ?? 'unknown error'}`);
  }
}
