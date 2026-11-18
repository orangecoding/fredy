/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import crypto from 'crypto';

/**
 * Notification adapter fields that touch the filesystem or other sensitive process-level resources.
 *
 * Non-admin users must not be able to introduce or modify these, otherwise any authenticated user
 * could make the server open/create files at arbitrary locations writable by the process (e.g. the
 * sqlite adapter's `dbPath`).
 *
 * This lives in its own module because two routes have to agree on it: saving a job
 * (`jobRouter`) and test-firing an adapter (`notificationAdapterRouter`). The test-fire route used
 * to skip the check entirely, which made the guard on the save route pointless - the same adapter
 * with the same field could simply be sent to `/try` instead.
 * @type {Record<string, string[]>}
 */
export const PRIVILEGED_ADAPTER_FIELDS = {
  sqlite: ['dbPath'],
};

/**
 * Ensure a non-admin cannot introduce or change a privileged field on a notification channel.
 *
 * Replaces the job-shaped `sanitiseNotificationAdapter`: privileged fields now live on a channel
 * row, so the comparison is against that row's stored fields rather than against a job's inline
 * adapter list. The "echo the stored value back unchanged" allowance is kept, because the editor
 * round-trips the whole field bag on every save.
 *
 * @param {string} adapterId
 * @param {Record<string, any>} incomingFields - Plain values, as the channel routes send them.
 * @param {Record<string, any>} existingFields - The channel's stored values, `{}` when creating.
 * @param {boolean} requestIsAdmin
 * @returns {{ok: true} | {ok: false, adapterId: string, field: string}}
 */
export function assertPrivilegedFieldsUnchanged(adapterId, incomingFields, existingFields, requestIsAdmin) {
  if (requestIsAdmin) return { ok: true };
  const privilegedFields = PRIVILEGED_ADAPTER_FIELDS[adapterId];
  if (!privilegedFields || privilegedFields.length === 0) return { ok: true };

  const incoming = incomingFields ?? {};
  const existing = existingFields ?? {};
  for (const key of privilegedFields) {
    if (!Object.prototype.hasOwnProperty.call(incoming, key)) continue;
    const value = incoming[key];
    if (value == null || value === '') continue;
    if (existing[key] === value) continue;
    return { ok: false, adapterId, field: key };
  }
  return { ok: true };
}

/**
 * Variant of {@link assertPrivilegedFieldsUnchanged} for the ad-hoc test-fire endpoint.
 *
 * There is no stored job to compare against here, so there is no "echoed back unchanged" case: a
 * non-admin may not set a privileged field at all. An empty value counts as not setting it, so the
 * UI can round-trip a blank form field.
 *
 * @param {string} adapterId
 * @param {Record<string, any>} fields - Raw `{ key: { value } }` shape as sent by the adapter form.
 * @param {boolean} requestIsAdmin
 * @returns {{ok: true} | {ok: false, adapterId: string, field: string}}
 */
export function assertAdapterFieldsAllowed(adapterId, fields, requestIsAdmin) {
  if (requestIsAdmin) return { ok: true };
  const privilegedFields = PRIVILEGED_ADAPTER_FIELDS[adapterId];
  if (!privilegedFields || privilegedFields.length === 0) return { ok: true };

  for (const key of privilegedFields) {
    const raw = fields?.[key];
    // The form sends `{ value }` wrappers, but be tolerant of a plain value too.
    const value = raw != null && typeof raw === 'object' && 'value' in raw ? raw.value : raw;
    if (value == null || value === '') continue;
    return { ok: false, adapterId, field: key };
  }
  return { ok: true };
}

/**
 * Human-readable rejection used by both routes.
 *
 * @param {string} adapterId
 * @param {string} field
 * @returns {string}
 */
export function privilegedFieldError(adapterId, field) {
  return `You are not allowed to set the "${field}" field on the "${adapterId}" notification adapter. Please ask an administrator to configure this value.`;
}

/**
 * A fresh value for a `generated` field: 32 random bytes, url-safe, since it ends up in a url.
 *
 * @returns {string}
 */
const generateFieldValue = () => crypto.randomBytes(32).toString('base64url');

/**
 * Settle the fields Fredy creates itself, marked `generated: true` in the adapter's field
 * definitions (the rss adapter's feed token).
 *
 * Whatever the client sent for such a field is never stored. Taking it would let a clone carry the
 * token of the channel it was cloned from, so two channels answered to one feed url, and would let
 * anyone pick a token as weak as they like. What the client can do is ask for a new one by sending
 * the field empty:
 *
 * - creating a channel always gets a new value;
 * - updating with the field empty gets a new value, the old url stops working;
 * - updating with anything else in it, or without it, keeps the stored value.
 *
 * @param {{fields?: Record<string, {generated?: boolean}>}|null} adapterConfig
 * @param {Record<string, any>} fields - The field bag about to be stored. Not mutated.
 * @param {Record<string, any>|null} existingFields - The stored fields, `null` when creating.
 * @returns {Record<string, any>} The field bag to store.
 */
export function settleGeneratedFields(adapterConfig, fields, existingFields) {
  const settled = { ...(fields ?? {}) };
  for (const [key, definition] of Object.entries(adapterConfig?.fields ?? {})) {
    if (definition?.generated !== true) continue;
    const stored = existingFields?.[key];
    const sent = Object.prototype.hasOwnProperty.call(settled, key) ? settled[key] : undefined;
    const wantsNew = existingFields == null || stored == null || stored === '' || sent === '' || sent === null;
    settled[key] = wantsNew ? generateFieldValue() : stored;
  }
  return settled;
}
