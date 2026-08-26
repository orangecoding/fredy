/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Keeps a half-finished job around while the user goes somewhere else.
 *
 * The job form holds twelve pieces of plain component state, and the form itself offers two links
 * that unmount it: "Manage channels", and the picker's "you have no channels yet". A first-time
 * user has to follow one of them - a job cannot be saved without a notification channel, and
 * channels are only created on the Settings page - and until now that threw away the name, the deal
 * type and every provider URL they had pasted in.
 *
 * `sessionStorage`, not `localStorage`: an abandoned draft should not still be waiting weeks later
 * on a shared machine. It lasts exactly as long as the tab the user left it in.
 */

/**
 * Bumped whenever the stored shape changes. An old payload is dropped rather than migrated: a draft
 * is worth minutes, and guessing at a shape that has since changed is how a stale value gets saved
 * onto a real job.
 *
 * A field merely *added* to {@link DRAFT_FIELDS} is not that kind of change and does not need a
 * bump. An older draft simply has no key for it, the form leaves that piece of state at whatever the
 * job it is editing already had, and nobody loses the half hour of typing a bump would have thrown
 * away. What needs a bump is a field whose meaning or shape moved under the same name.
 * @type {number}
 */
const VERSION = 1;

const PREFIX = 'fredy:jobDraft:';

/**
 * How long a draft stays interesting. Well inside a tab's lifetime, so this only catches the case
 * of a tab left open overnight and returned to with no memory of what was being edited.
 * @type {number}
 */
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

/**
 * The fields a draft carries. Anything not listed is either derived or belongs to the server.
 * @type {string[]}
 */
export const DRAFT_FIELDS = [
  'name',
  'dealType',
  'providerData',
  'selectedChannelIds',
  'blacklist',
  'shareWithUsers',
  'enabled',
  'spatialFilter',
  'specFilter',
  'commuteFilter',
];

/**
 * Where a draft for a given job is kept.
 *
 * Keyed by job, so a draft of one job can never be restored onto another, and a new job gets its
 * own slot rather than sharing with whichever job was edited last.
 *
 * @param {string|null|undefined} jobId
 * @returns {string}
 */
export function draftKey(jobId) {
  return `${PREFIX}${jobId ?? 'new'}`;
}

/**
 * Whether a draft holds anything worth restoring.
 *
 * An untouched form must not be stored: restoring one would show "draft restored" to someone who
 * has done nothing, and the offer to discard would be about nothing.
 *
 * @param {Object} draft
 * @returns {boolean}
 */
export function hasContent(draft) {
  if (draft == null) {
    return false;
  }
  return (
    (typeof draft.name === 'string' && draft.name.trim().length > 0) ||
    (draft.providerData?.length ?? 0) > 0 ||
    (draft.selectedChannelIds?.length ?? 0) > 0 ||
    (draft.blacklist?.length ?? 0) > 0 ||
    (draft.shareWithUsers?.length ?? 0) > 0 ||
    draft.dealType != null ||
    draft.spatialFilter != null ||
    draft.specFilter != null ||
    draft.commuteFilter != null
  );
}

/**
 * Keep only the fields a draft is allowed to carry.
 *
 * @param {Object} draft
 * @returns {Object}
 */
function pick(draft) {
  const out = {};
  for (const field of DRAFT_FIELDS) {
    if (draft[field] !== undefined) {
      out[field] = draft[field];
    }
  }
  return out;
}

/**
 * Store a draft, or remove it when there is nothing in it.
 *
 * @param {string|null} jobId
 * @param {Object} draft
 * @param {Storage} [storage]
 * @returns {void}
 */
export function saveDraft(jobId, draft, storage = globalThis.sessionStorage) {
  if (storage == null) {
    return;
  }
  if (!hasContent(draft)) {
    clearDraft(jobId, storage);
    return;
  }
  try {
    storage.setItem(draftKey(jobId), JSON.stringify({ version: VERSION, savedAt: Date.now(), draft: pick(draft) }));
  } catch {
    // A full or disabled storage must not take the form down with it. Losing the safety net is
    // survivable; losing the page the user is typing into is not.
  }
}

/**
 * Read a draft back.
 *
 * Anything unreadable, outdated or stale is dropped on the spot rather than returned, so a bad
 * entry cannot keep failing on every visit.
 *
 * @param {string|null} jobId
 * @param {Storage} [storage]
 * @param {number} [now]
 * @returns {Object|null}
 */
export function loadDraft(jobId, storage = globalThis.sessionStorage, now = Date.now()) {
  if (storage == null) {
    return null;
  }
  let raw;
  try {
    raw = storage.getItem(draftKey(jobId));
  } catch {
    return null;
  }
  if (raw == null) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    clearDraft(jobId, storage);
    return null;
  }

  const tooOld = typeof payload?.savedAt !== 'number' || now - payload.savedAt > MAX_AGE_MS;
  if (payload?.version !== VERSION || tooOld || !hasContent(payload.draft)) {
    clearDraft(jobId, storage);
    return null;
  }
  return pick(payload.draft);
}

/**
 * Forget a draft. Called on save and on cancel, so a finished job leaves nothing behind to be
 * restored over it the next time it is opened.
 *
 * @param {string|null} jobId
 * @param {Storage} [storage]
 * @returns {void}
 */
export function clearDraft(jobId, storage = globalThis.sessionStorage) {
  try {
    storage?.removeItem(draftKey(jobId));
  } catch {
    // Nothing to do: the draft is already unreachable.
  }
}
