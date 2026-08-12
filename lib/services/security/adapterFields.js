/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

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
