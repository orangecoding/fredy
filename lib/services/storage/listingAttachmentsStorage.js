/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import SqliteConnection from './SqliteConnection.js';
import { nanoid } from 'nanoid';

/**
 * Documents a user attached to a listing.
 *
 * Every read here names its columns. `SELECT *` would pull the BLOB along with the metadata, so a
 * listing carrying twenty scanned exposés would put a few hundred megabytes through the heap just
 * to render a list of filenames. Exactly one query below touches `content`, and it is the one that
 * exists to send those bytes to the browser.
 *
 * @typedef {Object} ListingAttachment
 * @property {string} id
 * @property {string} listingId
 * @property {string} filename
 * @property {string} mimeType
 * @property {number} size Bytes.
 * @property {number} createdAt Epoch millis.
 */

/**
 * Columns making up the metadata of an attachment, aliased into the shape the API speaks.
 * @type {string}
 */
const METADATA_COLUMNS = `id, listing_id AS listingId, filename, mime_type AS mimeType, size, created_at AS createdAt`;

/**
 * All documents on a listing, oldest first.
 *
 * @param {string} listingId
 * @returns {ListingAttachment[]}
 */
export const listAttachments = (listingId) => {
  if (!listingId) return [];
  return SqliteConnection.query(
    `SELECT ${METADATA_COLUMNS}
     FROM listing_attachments
     WHERE listing_id = @listingId
     ORDER BY created_at ASC`,
    { listingId },
  );
};

/**
 * How many documents a listing already carries. Drives the per-listing ceiling.
 *
 * @param {string} listingId
 * @returns {number}
 */
export const countAttachments = (listingId) => {
  if (!listingId) return 0;
  const rows = SqliteConnection.query(
    `SELECT COUNT(*) AS total FROM listing_attachments WHERE listing_id = @listingId`,
    { listingId },
  );
  return rows[0]?.total ?? 0;
};

/**
 * One document including its bytes.
 *
 * Scoped by `listing_id` as well as by id on purpose: the route has already established that the
 * caller may see *this listing*, and nothing else. Looking an attachment up by id alone would let
 * an id borrowed from somebody else's listing through that check.
 *
 * @param {string} attachmentId
 * @param {string} listingId
 * @returns {(ListingAttachment & {content: Buffer})|null}
 */
export const getAttachment = (attachmentId, listingId) => {
  if (!attachmentId || !listingId) return null;
  const rows = SqliteConnection.query(
    `SELECT ${METADATA_COLUMNS}, content
     FROM listing_attachments
     WHERE id = @attachmentId AND listing_id = @listingId
     LIMIT 1`,
    { attachmentId, listingId },
  );
  return rows[0] ?? null;
};

/**
 * Store a document against a listing.
 *
 * @param {Object} params
 * @param {string} params.listingId
 * @param {string} params.filename Already sanitised by the caller.
 * @param {string} params.mimeType Already sniffed by the caller, never the client's claim.
 * @param {Buffer} params.content
 * @returns {ListingAttachment} The stored metadata.
 */
export const addAttachment = ({ listingId, filename, mimeType, content }) => {
  const attachment = {
    id: nanoid(),
    listingId,
    filename,
    mimeType,
    size: content.length,
    createdAt: Date.now(),
  };
  SqliteConnection.execute(
    `INSERT INTO listing_attachments (id, listing_id, filename, mime_type, size, content, created_at)
     VALUES (@id, @listingId, @filename, @mimeType, @size, @content, @createdAt)`,
    { ...attachment, content },
  );
  return attachment;
};

/**
 * Remove one document.
 *
 * @param {string} attachmentId
 * @param {string} listingId
 * @returns {number} Rows deleted, so the caller can tell a missing id from a successful delete.
 */
export const deleteAttachment = (attachmentId, listingId) => {
  if (!attachmentId || !listingId) return 0;
  const result = SqliteConnection.execute(
    `DELETE FROM listing_attachments WHERE id = @attachmentId AND listing_id = @listingId`,
    { attachmentId, listingId },
  );
  return result?.changes ?? 0;
};
