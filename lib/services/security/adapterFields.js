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
 * Read the stored fields of one adapter out of a job's adapter list.
 *
 * @param {Array<{id?: string, fields?: Record<string, any>}>|undefined} adapterList
 * @param {string} adapterId
 * @returns {Record<string, any>}
 */
function getAdapterFields(adapterList, adapterId) {
  if (!Array.isArray(adapterList)) return {};
  const entry = adapterList.find((a) => a && a.id === adapterId);
  return (entry && entry.fields) || {};
}

/**
 * Ensure a non-admin user cannot introduce or change privileged notification adapter fields.
 *
 * Admins are unaffected, so existing configurations continue to work unchanged. Non-admin requests
 * that omit privileged fields (or echo back the admin-set value unchanged) are also allowed
 * through - the UI round-trips the whole adapter when editing a shared job.
 *
 * @param {Array<Object>|undefined} notificationAdapter - The adapter list from the request.
 * @param {Object|null} existingJob - The stored job being updated, or null when creating one.
 * @param {boolean} requestIsAdmin
 * @returns {{ok: true, notificationAdapter: Array<Object>|undefined} | {ok: false, adapterId: string, field: string}}
 */
export function sanitiseNotificationAdapter(notificationAdapter, existingJob, requestIsAdmin) {
  if (requestIsAdmin || !Array.isArray(notificationAdapter)) {
    return { ok: true, notificationAdapter };
  }

  for (const adapter of notificationAdapter) {
    if (!adapter || typeof adapter !== 'object') continue;
    const privilegedFields = PRIVILEGED_ADAPTER_FIELDS[adapter.id];
    if (!privilegedFields || !privilegedFields.length) continue;

    const incomingFields = adapter.fields || {};
    const existingFields = existingJob ? getAdapterFields(existingJob.notificationAdapter, adapter.id) : {};
    for (const key of privilegedFields) {
      if (!Object.prototype.hasOwnProperty.call(incomingFields, key)) continue;
      if (incomingFields[key] === existingFields[key]) continue;
      return { ok: false, adapterId: adapter.id, field: key };
    }
  }

  return { ok: true, notificationAdapter };
}

/**
 * Variant of {@link sanitiseNotificationAdapter} for the ad-hoc test-fire endpoint.
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
