/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Local gallery storage for on-demand detail enrichment.
 *
 * Exposé image URLs are remote, hotlink-protected and short-lived, so the gallery pulled by
 * "enrich on click" is downloaded once into `<imagesDir>/<listingId>/NN.<ext>` and served back
 * through `GET /api/listings/:listingId/images/:index`. The remote `image_url` cover column is
 * left alone: notifications keep sending it, and the gallery is purely additive.
 *
 * Downloads are sequential and forgiving - one dead CDN file must not fail the other 29 - and
 * capped, so a 200-photo new-build exposé cannot fill the disk.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import logger from '../logger.js';
import { computeDbPath } from '../storage/SqliteConnection.js';

/** How many gallery images are kept per listing. The providers cap their URL lists at the same number. */
export const MAX_GALLERY_IMAGES = 30;

/** Per-image fetch timeout. A slow CDN file is skipped, not waited out. */
const IMAGE_FETCH_TIMEOUT_MS = 15_000;

/** Per-image size cap, mirroring the Telegram multipart limit. */
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Accept header that excludes `image/webp`, borrowed from the Telegram photo uploader: CDNs
 * that content-negotiate (notably Cloudimage on mms.immowelt.de) transcode WEBP to JPEG instead
 * of serving bytes half the ecosystem rejects.
 */
const NON_WEBP_ACCEPT = 'image/jpeg,image/png,image/*;q=0.8';

/** A plain browser User-Agent. Some picture CDNs answer bots with 403 and browsers with bytes. */
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const EXTENSION_BY_MIME = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/gif', 'gif'],
  ['image/webp', 'webp'],
]);

const MIME_BY_EXTENSION = new Map([...EXTENSION_BY_MIME.entries()].map(([mime, ext]) => [ext, mime]));

/**
 * Where galleries live. Next to the database, so the `./db:/db` volume that already
 * persists `listings.db` keeps the images too. Overridable for tests and exotic setups.
 *
 * @returns {Promise<string>} Absolute path of the images directory, created if needed.
 */
export async function resolveImagesDir() {
  if (process.env.IMAGES_DIR && process.env.IMAGES_DIR.trim().length > 0) {
    const dir = path.resolve(process.env.IMAGES_DIR.trim());
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }
  const { dir } = await computeDbPath();
  const imagesDir = path.join(dir, 'listing-images');
  await fs.mkdir(imagesDir, { recursive: true });
  return imagesDir;
}

/**
 * Listing ids are nanoids, but the filesystem path is built defensively anyway: a hostile or
 * corrupted id must never escape the images directory.
 *
 * @param {string} listingId
 * @returns {string|null} The id when it is a safe single path segment, else null.
 */
function safeSegment(listingId) {
  if (typeof listingId !== 'string' || listingId.length === 0) return null;
  if (listingId === '.' || listingId === '..' || listingId.includes('/') || listingId.includes('\\')) return null;
  return path.basename(listingId);
}

/**
 * Download one gallery image.
 *
 * @param {string} url Remote image URL.
 * @param {string} targetFile Absolute path to write the bytes to.
 * @returns {Promise<string|null>} The file extension reflecting the served bytes, or null when skipped.
 */
async function downloadOne(url, targetFileBase) {
  let response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: NON_WEBP_ACCEPT,
        'User-Agent': BROWSER_USER_AGENT,
        Referer: new URL(url).origin,
      },
      signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    logger.debug(`Skipping gallery image, fetch failed: ${url}`, error?.message || error);
    return null;
  }
  if (!response.ok) {
    logger.debug(`Skipping gallery image, HTTP ${response.status}: ${url}`);
    return null;
  }
  const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!contentType.startsWith('image/')) {
    logger.debug(`Skipping gallery image, not an image (${contentType || 'unknown type'}): ${url}`);
    return null;
  }
  const advertised = Number(response.headers.get('content-length'));
  if (Number.isFinite(advertised) && advertised > IMAGE_MAX_BYTES) {
    logger.debug(`Skipping gallery image, advertised ${advertised} bytes over the cap: ${url}`);
    return null;
  }
  let bytes;
  try {
    bytes = Buffer.from(await response.arrayBuffer());
  } catch (error) {
    logger.debug(`Skipping gallery image, body unreadable: ${url}`, error?.message || error);
    return null;
  }
  if (bytes.length === 0 || bytes.length > IMAGE_MAX_BYTES) {
    logger.debug(`Skipping gallery image, ${bytes.length} bytes downloaded: ${url}`);
    return null;
  }
  const extension = EXTENSION_BY_MIME.get(contentType) ?? 'jpg';
  await fs.writeFile(`${targetFileBase}.${extension}`, bytes);
  return extension;
}

/**
 * Download a listing's gallery into local storage.
 *
 * Sequential on purpose: thirty parallel connections against a portal CDN from a residential IP
 * is exactly the traffic shape bot detection scores. Failures are skipped, never thrown - a
 * gallery of 27 out of 30 still enriches the listing.
 *
 * @param {string} listingId DB id of the listing, used as the directory name.
 * @param {string[]} imageUrls Remote gallery URLs, already capped by the provider.
 * @returns {Promise<string[]>} Stored paths relative to the images directory, in gallery order.
 */
export async function downloadListingImages(listingId, imageUrls) {
  const segment = safeSegment(listingId);
  if (segment == null) return [];
  const unique = [...new Set((imageUrls ?? []).filter((url) => typeof url === 'string' && url.length > 0))].slice(
    0,
    MAX_GALLERY_IMAGES,
  );
  if (unique.length === 0) return [];

  const imagesDir = await resolveImagesDir();
  const listingDir = path.join(imagesDir, segment);
  await fs.mkdir(listingDir, { recursive: true });

  const stored = [];
  let index = 0;
  for (const url of unique) {
    const name = `${String(index).padStart(2, '0')}`;
    const extension = await downloadOne(url, path.join(listingDir, name));
    if (extension != null) {
      stored.push(`${segment}/${name}.${extension}`);
      index += 1;
    }
  }
  return stored;
}

/**
 * Remove a listing's local gallery. Called from the hard-delete paths; soft deletes keep the
 * files so a restore brings the gallery back.
 *
 * @param {string|string[]} listingIds One DB id or a list of them.
 * @returns {Promise<void>}
 */
export async function deleteListingImages(listingIds) {
  const ids = (Array.isArray(listingIds) ? listingIds : [listingIds])
    .map(safeSegment)
    .filter((segment) => segment != null);
  if (ids.length === 0) return;
  const imagesDir = await resolveImagesDir();
  for (const segment of ids) {
    try {
      await fs.rm(path.join(imagesDir, segment), { recursive: true, force: true });
    } catch (error) {
      logger.debug(`Could not remove gallery for listing ${segment}`, error?.message || error);
    }
  }
}

/**
 * Read one stored gallery file for serving.
 *
 * @param {string} relativePath A path as stored in `listings.image_files`, `<listingId>/NN.<ext>`.
 * @returns {Promise<{buffer: Buffer, contentType: string}|null>} The bytes and mime type, or null
 *   when the path is invalid, escapes the images directory, or the file is gone.
 */
export async function readListingImage(relativePath) {
  if (typeof relativePath !== 'string' || relativePath.length === 0) return null;
  const imagesDir = await resolveImagesDir();
  const resolved = path.resolve(imagesDir, relativePath);
  if (path.relative(imagesDir, resolved).startsWith('..') || path.isAbsolute(relativePath)) return null;
  const extension = path.extname(resolved).slice(1).toLowerCase();
  const contentType = MIME_BY_EXTENSION.get(extension);
  if (!contentType) return null;
  try {
    const buffer = await fs.readFile(resolved);
    return { buffer, contentType };
  } catch {
    return null;
  }
}
