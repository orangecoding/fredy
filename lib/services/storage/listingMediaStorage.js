/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import zlib from 'node:zlib';
import SqliteConnection from './SqliteConnection.js';
import { toListingImages, withoutFirstPicture } from '../../utils/listingImages.js';

/** @import { ListingImage } from '../../types/listing.js' */

/**
 * The pictures of a listing (`listing_media`, see `48.listing-media.js`): the first one as bytes,
 * the rest of the gallery as deflated urls.
 *
 * Every read here names its columns, for the same reason as in `listingAttachmentsStorage.js`:
 * `preview` is a BLOB, and only the query that exists to send those bytes to the browser touches it.
 *
 * @typedef {Object} ListingPicture
 * @property {string|null} imageUrl The portal's url of the first picture (`listings.image_url`).
 * @property {Buffer|null} content The stored bytes of that picture, or null when none are kept yet.
 * @property {string|null} mimeType What `content` is.
 * @property {number|null} failedAt When the last attempt to keep it failed, epoch millis.
 *
 * @typedef {Object} PreviewState
 * @property {boolean} hasPreview Whether the bytes of the first picture are stored.
 * @property {number|null} failedAt When the last attempt to keep it failed, epoch millis.
 */

/**
 * Pack a gallery for storage: JSON, deflated. Gallery urls of one listing share almost everything
 * but an id, so they shrink to roughly a quarter.
 *
 * @param {ListingImage[]} images
 * @returns {Buffer}
 */
export const encodeGallery = (images) => zlib.deflateRawSync(JSON.stringify(images), { level: 9 });

/**
 * Unpack what {@link encodeGallery} stored. Anything unreadable is an empty gallery rather than an
 * error, because a listing without its pictures is still a listing worth showing.
 *
 * @param {Buffer|null|undefined} blob
 * @returns {ListingImage[]}
 */
export const decodeGallery = (blob) => {
  if (!Buffer.isBuffer(blob) || blob.length === 0) return [];
  try {
    const parsed = JSON.parse(zlib.inflateRawSync(blob).toString('utf8'));
    return toListingImages(Array.isArray(parsed) ? parsed : []);
  } catch {
    return [];
  }
};

/**
 * Store the gallery of a listing, without the picture `previewUrl` names: that one is the
 * listing's own `image_url`, and its bytes are what `preview` holds. Matched as a picture, not as a
 * url, because the search and the detail page usually ask for different sizes of it (see
 * `withoutFirstPicture`).
 *
 * Does nothing for a listing without further pictures, so a detail refetch that comes back without
 * a gallery never wipes the one already stored, and nothing when the gallery is the one already
 * stored. Runs inside `storeListings`' transaction, which is why it only writes and never fetches.
 *
 * @param {string} listingId
 * @param {ListingImage[]|undefined} images The gallery as the provider built it.
 * @param {string|null|undefined} previewUrl The listing's first picture.
 * @returns {boolean} Whether a new or different gallery was written.
 */
export const storeListingGallery = (listingId, images, previewUrl) => {
  if (!listingId) return false;
  const gallery = withoutFirstPicture(toListingImages(images), previewUrl);
  if (gallery.length === 0) return false;
  if (JSON.stringify(getListingGallery(listingId, previewUrl)) === JSON.stringify(gallery)) return false;
  SqliteConnection.execute(
    `INSERT INTO listing_media (listing_id, gallery, created_at)
     VALUES (@listingId, @gallery, @createdAt)
     ON CONFLICT(listing_id) DO UPDATE SET gallery = excluded.gallery`,
    { listingId, gallery: encodeGallery(gallery), createdAt: Date.now() },
  );
  return true;
};

/**
 * The stored gallery of a listing, floor plans first. Empty when there is none.
 *
 * Given the listing's first picture, leaves that one out on the way out as well. A gallery written
 * before the comparison was by picture rather than by url still carries it in another size, and the
 * detail view would show it twice.
 *
 * @param {string} listingId
 * @param {string|null} [previewUrl] The listing's `image_url`.
 * @returns {ListingImage[]}
 */
export const getListingGallery = (listingId, previewUrl = null) => {
  if (!listingId) return [];
  const row = SqliteConnection.query(`SELECT gallery FROM listing_media WHERE listing_id = @listingId`, {
    listingId,
  })[0];
  return withoutFirstPicture(decodeGallery(row?.gallery), previewUrl);
};

/**
 * Everything needed to answer for the first picture of a listing: its stored bytes when there are
 * any, and the portal's url otherwise. Null when the listing does not exist.
 *
 * @param {string} listingId
 * @returns {ListingPicture|null}
 */
export const getListingPicture = (listingId) => {
  if (!listingId) return null;
  const row = SqliteConnection.query(
    `SELECT l.image_url AS imageUrl, m.preview_mime AS mimeType, m.preview_failed_at AS failedAt, m.preview AS content
     FROM listings l
            LEFT JOIN listing_media m ON m.listing_id = l.id
     WHERE l.id = @listingId`,
    { listingId },
  )[0];
  if (row == null) return null;
  return {
    imageUrl: row.imageUrl ?? null,
    content: Buffer.isBuffer(row.content) && row.content.length > 0 ? row.content : null,
    mimeType: row.mimeType ?? null,
    failedAt: row.failedAt ?? null,
  };
};

/**
 * Whether the first picture of a listing is stored, without reading it: SQLite answers `length()`
 * of a BLOB from the record header.
 *
 * @param {string} listingId
 * @returns {PreviewState}
 */
export const getPreviewState = (listingId) => {
  const row = SqliteConnection.query(
    `SELECT length(preview) AS previewBytes, preview_failed_at AS failedAt
     FROM listing_media
     WHERE listing_id = @listingId`,
    { listingId },
  )[0];
  return { hasPreview: (row?.previewBytes ?? 0) > 0, failedAt: row?.failedAt ?? null };
};

/**
 * Keep the bytes of a listing's first picture. Clears an earlier failure.
 *
 * @param {string} listingId
 * @param {Buffer} content
 * @param {string} mimeType
 * @returns {void}
 */
export const storeListingPreview = (listingId, content, mimeType) => {
  SqliteConnection.execute(
    `INSERT INTO listing_media (listing_id, preview_mime, preview_failed_at, created_at, preview)
     VALUES (@listingId, @mimeType, NULL, @createdAt, @content)
     ON CONFLICT(listing_id) DO UPDATE SET preview_mime      = excluded.preview_mime,
                                           preview_failed_at = NULL,
                                           preview           = excluded.preview`,
    { listingId, mimeType, content, createdAt: Date.now() },
  );
};

/**
 * Remember that the first picture of a listing could not be kept, so it is not asked for again on
 * every page view.
 *
 * @param {string} listingId
 * @param {number} [at=Date.now()] Epoch millis.
 * @returns {void}
 */
export const markListingPreviewFailed = (listingId, at = Date.now()) => {
  SqliteConnection.execute(
    `INSERT INTO listing_media (listing_id, preview_failed_at, created_at)
     VALUES (@listingId, @at, @at)
     ON CONFLICT(listing_id) DO UPDATE SET preview_failed_at = excluded.preview_failed_at`,
    { listingId, at },
  );
};
