/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Client for the documents attached to a listing.
 *
 * Not part of `xhr.js` because that helper JSON-stringifies every body and pins the content type,
 * which is exactly wrong for a request whose body *is* a file. `backupRestoreClient.js` already
 * reaches for raw `fetch` for the same reason; this follows it.
 */

/**
 * @typedef {Object} ListingAttachment
 * @property {string} id
 * @property {string} listingId
 * @property {string} filename
 * @property {string} mimeType
 * @property {number} size Bytes.
 * @property {number} createdAt Epoch millis.
 */

/**
 * Turn a failed response into an Error carrying the backend's message.
 *
 * @param {Response} response
 * @param {string} fallback
 * @returns {Promise<Error>}
 */
async function toError(response, fallback) {
  let message = fallback;
  try {
    const body = await response.json();
    message = body?.message || body?.error || fallback;
  } catch {
    // A non-JSON error body is nothing to say about; the fallback already covers it.
  }
  const error = new Error(message);
  error.status = response.status;
  return error;
}

/**
 * The documents on a listing, together with the limits the backend will enforce.
 *
 * The limits come back here rather than from the settings endpoint because they are admin-level
 * settings and whoever is looking at a listing usually is not an admin.
 *
 * @param {string} listingId
 * @returns {Promise<{attachments: ListingAttachment[], limits: {maxBytes: number, maxCount: number}}>}
 */
export async function listAttachments(listingId) {
  const response = await fetch(`/api/listings/${encodeURIComponent(listingId)}/attachments`, {
    credentials: 'include',
  });
  if (!response.ok) throw await toError(response, 'Failed to load documents');
  return response.json();
}

/**
 * Upload one file. The body is the file itself; the name travels in the query string.
 *
 * @param {string} listingId
 * @param {File} file
 * @returns {Promise<ListingAttachment>}
 */
export async function uploadAttachment(listingId, file) {
  const response = await fetch(
    `/api/listings/${encodeURIComponent(listingId)}/attachments?name=${encodeURIComponent(file.name)}`,
    {
      method: 'POST',
      credentials: 'include',
      // A hint only - the backend decides the type from the bytes.
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    },
  );
  if (!response.ok) throw await toError(response, 'Upload failed');
  return response.json();
}

/**
 * Where one document's bytes live. A plain URL, so it can go straight into an `<img src>` or an
 * `<a href>` - the session cookie rides along because it is the same origin.
 *
 * @param {string} listingId
 * @param {string} attachmentId
 * @returns {string}
 */
export function attachmentUrl(listingId, attachmentId) {
  return `/api/listings/${encodeURIComponent(listingId)}/attachments/${encodeURIComponent(attachmentId)}`;
}

/**
 * Remove one document.
 *
 * @param {string} listingId
 * @param {string} attachmentId
 * @returns {Promise<void>}
 */
export async function deleteAttachment(listingId, attachmentId) {
  const response = await fetch(attachmentUrl(listingId, attachmentId), {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok) throw await toError(response, 'Delete failed');
}
