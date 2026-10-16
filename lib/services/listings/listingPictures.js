/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { isPubliclyFetchableUrl } from '../security/outboundUrl.js';
import logger from '../logger.js';

/**
 * Downloading a listing's picture and shrinking it for storage.
 *
 * Shared by the background capture that keeps the first picture of every listing
 * (`previewCaptureQueue.js`) and by the MCP tool that hands a listing's photo to a vision model.
 */

/** Longest edge of a stored picture, in pixels. Enough for the 400px detail view on a 2x screen. */
export const PREVIEW_MAX_EDGE = 800;

/** WebP quality of a stored picture. */
export const PREVIEW_WEBP_QUALITY = 75;

/** Largest download accepted at all, in bytes. Portals serve their originals well below this. */
export const MAX_PICTURE_DOWNLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Largest picture kept as the portal served it when it cannot be re-encoded (no sharp on this
 * platform). Without the ceiling a single listing could cost megabytes.
 */
export const MAX_UNCOMPRESSED_PREVIEW_BYTES = 512 * 1024;

/** How long one download may take, redirects included. */
const FETCH_TIMEOUT_MS = 10_000;

/** Redirects followed before giving up. Every hop is checked against the outbound guard. */
const MAX_REDIRECTS = 3;

/** Largest image sharp is asked to decode, in pixels. Guards memory against a decompression bomb. */
const MAX_INPUT_PIXELS = 40_000_000;

/**
 * Some CDNs answer a request without a browser user agent with an error page.
 * @type {string}
 */
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Leading bytes of every picture type that is ever stored or served. The list is a security
 * boundary, not a convenience: these bytes are served back from Fredy's own origin, so nothing
 * scriptable (SVG, HTML) may ever pass.
 * @type {Array<{mime: string, matches: (bytes: Uint8Array) => boolean}>}
 */
const SIGNATURES = [
  { mime: 'image/jpeg', matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    matches: (b) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => b[index] === byte),
  },
  // "GIF8"
  { mime: 'image/gif', matches: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 },
  // "RIFF" .... "WEBP"
  {
    mime: 'image/webp',
    matches: (b) =>
      b[0] === 0x52 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x46 &&
      b[8] === 0x57 &&
      b[9] === 0x45 &&
      b[10] === 0x42 &&
      b[11] === 0x50,
  },
];

/**
 * Identify a picture by its leading bytes. The `Content-Type` a CDN sends is a claim; the bytes are
 * what the browser will render.
 *
 * @param {Uint8Array|Buffer|null|undefined} bytes
 * @returns {'image/jpeg'|'image/png'|'image/gif'|'image/webp'|null} Null for anything else.
 */
export function sniffImageMime(bytes) {
  if (bytes == null || bytes.length < 12) return null;
  return SIGNATURES.find(({ matches }) => matches(bytes))?.mime ?? null;
}

/**
 * Download a listing's picture.
 *
 * The url is scraped, so fetching it does what a portal's markup said. Redirects are followed by
 * hand so that every hop, not just the first, has to pass {@link isPubliclyFetchableUrl}: this runs
 * unattended for every new listing, inside the user's home network.
 *
 * @param {string} url
 * @returns {Promise<{buffer: Buffer, mimeType: string, url: string}>} The bytes, their sniffed type
 *   and the url they finally came from.
 * @throws {Error} When the url is not public, the answer is not a picture, or it is too large. The
 *   message says which and names the url.
 */
export async function fetchListingPicture(url) {
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isPubliclyFetchableUrl(current)) {
      throw new Error(
        `Refusing to fetch this image: its URL does not point at a public http(s) address. Image URL: ${current}`,
      );
    }
    const response = await fetch(current, {
      signal,
      redirect: 'manual',
      headers: { 'User-Agent': USER_AGENT, Accept: 'image/webp,image/jpeg,image/png,image/gif,image/*;q=0.8' },
    });

    const location = response.status >= 300 && response.status < 400 ? response.headers.get('location') : null;
    if (location) {
      current = new URL(location, current).toString();
      continue;
    }
    if (!response.ok) {
      throw new Error(`Image fetch returned HTTP ${response.status}. Image URL: ${current}`);
    }

    const advertised = Number(response.headers.get('content-length'));
    if (Number.isFinite(advertised) && advertised > MAX_PICTURE_DOWNLOAD_BYTES) {
      throw new Error(`Image is too large (${advertised} bytes). Image URL: ${current}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_PICTURE_DOWNLOAD_BYTES) {
      throw new Error(`Image is too large (${buffer.length} bytes). Image URL: ${current}`);
    }
    const mimeType = sniffImageMime(buffer);
    if (mimeType == null) {
      throw new Error(`Not a supported image format. Image URL: ${current}`);
    }
    return { buffer, mimeType, url: current };
  }
  throw new Error(`Too many redirects. Image URL: ${url}`);
}

/**
 * sharp, once it has been looked for: the module, or null where this platform has no build of it.
 * Undefined until the first picture asks.
 * @type {import('sharp')|null|undefined}
 */
let sharpModule;

/**
 * Load sharp on first use. A platform without a prebuilt binary still runs Fredy; it just keeps
 * pictures as the portal served them, within {@link MAX_UNCOMPRESSED_PREVIEW_BYTES}.
 *
 * @returns {Promise<import('sharp')|null>}
 */
async function loadSharp() {
  if (sharpModule === undefined) {
    try {
      const { default: sharp } = await import('sharp');
      // Pictures are encoded once and never again, so libvips' operation cache only holds memory.
      // One thread per picture keeps a burst of new listings from occupying every core.
      sharp.cache(false);
      sharp.concurrency(1);
      sharpModule = sharp;
    } catch (error) {
      logger.warn(`sharp is not available, listing pictures are kept as the portal serves them: ${error.message}`);
      sharpModule = null;
    }
  }
  return sharpModule;
}

/**
 * Shrink a picture for storage: at most {@link PREVIEW_MAX_EDGE} pixels on its longer edge, WebP.
 *
 * Keeps the original when re-encoding would not make it smaller, which is the case for a portal that
 * already serves small thumbnails. Without sharp the original is kept up to
 * {@link MAX_UNCOMPRESSED_PREVIEW_BYTES}.
 *
 * @param {Buffer} buffer The downloaded bytes.
 * @param {string} mimeType Their sniffed type, see {@link sniffImageMime}.
 * @returns {Promise<{content: Buffer, mimeType: string}>}
 * @throws {Error} When the picture cannot be decoded, or is too large to keep without sharp.
 */
export async function compressPreview(buffer, mimeType) {
  const sharp = await loadSharp();
  if (sharp != null) {
    const webp = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
      .rotate()
      .resize({ width: PREVIEW_MAX_EDGE, height: PREVIEW_MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: PREVIEW_WEBP_QUALITY })
      .toBuffer();
    return webp.length < buffer.length ? { content: webp, mimeType: 'image/webp' } : { content: buffer, mimeType };
  }
  if (buffer.length <= MAX_UNCOMPRESSED_PREVIEW_BYTES) {
    return { content: buffer, mimeType };
  }
  throw new Error(`Image too large to keep without sharp (${buffer.length} bytes)`);
}
