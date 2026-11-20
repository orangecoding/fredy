/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The AI application draft as the notification channels carry it.
 *
 * The draft belongs to the listing, not to a channel: it is stored on the row and shown in Fredy's
 * "Copy application" dialog, which every notification already links to as "Open in Fredy". A channel
 * with room for a letter carries the text as well, through these helpers, so the wording and the
 * warning that goes with it are the same in every channel that shows it.
 */

/** What a channel puts above the draft. It is written by a model, and has to be read before it is sent. */
export const APPLICATION_DRAFT_HEADING = 'Application draft (written by AI, check it before you send it)';

/**
 * A listing's draft, trimmed, or `''` when it has none.
 *
 * @param {Object} listing As the pipeline hands it to the adapters.
 * @returns {string}
 */
export function applicationDraftOf(listing) {
  return typeof listing?.applicationDraft === 'string' ? listing.applicationDraft.trim() : '';
}

/**
 * The draft as a field of a channel's own listing shape: present when there is one, absent otherwise,
 * so a consumer of a JSON payload never has to tell an empty draft from a missing one.
 *
 * @param {Object} listing
 * @returns {{applicationDraft?: string}}
 */
export function applicationDraftField(listing) {
  const draft = applicationDraftOf(listing);
  return draft.length > 0 ? { applicationDraft: draft } : {};
}

/**
 * The draft as the email template renders it: the text, split into lines so the template can break
 * them without unescaped HTML, and the heading. Empty when the listing has no draft, so the
 * template's `{{#if this.applicationDraft}}` leaves the block out.
 *
 * @param {Object} listing
 * @returns {{applicationDraft?: string, applicationDraftLines?: string[], applicationDraftHeading?: string}}
 */
export function applicationDraftEmailFields(listing) {
  const draft = applicationDraftOf(listing);
  if (draft.length === 0) return {};
  return {
    applicationDraft: draft,
    applicationDraftLines: draft.split('\n'),
    applicationDraftHeading: APPLICATION_DRAFT_HEADING,
  };
}
