/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Helpers for sending photos to Telegram via `multipart/form-data` instead of
 * the HTTP-URL path. Used when the URL is one that Telegram's URL-fetcher will
 * reject - notably `.webp` images from Cloudimage (mms.immowelt.de), which
 * Telegram refuses with "Bad Request: failed to get HTTP URL content".
 *
 * The HTTP-URL path is faster and is still the default in telegram.js; this
 * module is the fallback for URLs whose extension makes Telegram fail.
 */

/** Telegram's sendPhoto limit when uploading bytes via multipart/form-data. */
const TELEGRAM_MULTIPART_MAX_BYTES = 10 * 1024 * 1024;

/** Accept header used when re-fetching the image ourselves.
 *  Deliberately excludes `image/webp` so CDNs that content-negotiate
 *  (like Cloudimage on mms.immowelt.de) transcode WEBP to JPEG. */
const NON_WEBP_ACCEPT = 'image/jpeg,image/png,image/*;q=0.8';

/**
 * Returns true if the URL's path ends in a `.webp` extension. Such URLs need
 * multipart upload because Telegram identifies media types from the URL path
 * and rejects `.webp` in sendPhoto via HTTP URL.
 *
 * Conservative: returns false for null/empty/non-string input, malformed URLs,
 * and non-https schemes.
 *
 * @param {string|null|undefined} url
 * @returns {boolean}
 */
export function shouldUseMultipart(url) {
  if (typeof url !== 'string' || url.length === 0) return false;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  return /\.webp$/i.test(parsed.pathname);
}

/**
 * Fetch an image from `imageUrl` and build a `FormData` body suitable for
 * POSTing to `https://api.telegram.org/bot<token>/sendPhoto`.
 *
 * - Sends an `Accept` header that excludes `image/webp` so origin/CDN servers
 *   that content-negotiate return JPEG bytes.
 * - Rejects images larger than Telegram's 10 MB multipart limit, both
 *   advertised via `Content-Length` and (defensively) after download.
 * - The `photo` field is named with a `.jpg` extension because Telegram
 *   identifies file type from the filename.
 *
 * Throws if the image fetch fails, the size limit is exceeded, or the URL is
 * unreachable. The caller is responsible for catching and falling back.
 *
 * @param {Object} args
 * @param {string|number} args.chatId
 * @param {string} args.imageUrl
 * @param {string} args.caption
 * @param {string} [args.parseMode]      - Telegram parse_mode, e.g. 'HTML'.
 * @param {number} [args.messageThreadId] - Telegram supergroup topic id.
 * @returns {Promise<FormData>}
 */
export async function buildPhotoFormData({ chatId, imageUrl, caption, parseMode, messageThreadId }) {
  const res = await fetch(imageUrl, {
    method: 'GET',
    headers: { Accept: NON_WEBP_ACCEPT },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch image for multipart upload (${res.status}): ${imageUrl}`);
  }

  const advertised = Number(res.headers.get('content-length'));
  if (Number.isFinite(advertised) && advertised > TELEGRAM_MULTIPART_MAX_BYTES) {
    throw new Error(
      `Image exceeds Telegram multipart size limit (advertised ${advertised} bytes, max ${TELEGRAM_MULTIPART_MAX_BYTES}): ${imageUrl}`,
    );
  }

  const buf = await res.arrayBuffer();
  if (buf.byteLength > TELEGRAM_MULTIPART_MAX_BYTES) {
    throw new Error(
      `Image exceeds Telegram multipart size limit (downloaded ${buf.byteLength} bytes, max ${TELEGRAM_MULTIPART_MAX_BYTES}): ${imageUrl}`,
    );
  }

  // Telegram identifies the media type from the filename extension. We always
  // upload as .jpg because the Accept header forces JPEG bytes from CDNs that
  // honor it; for the rare CDN that ignores Accept and still returns WEBP, the
  // .jpg filename is a small lie but Telegram's image pipeline accepts it.
  const blob = new Blob([buf], { type: 'image/jpeg' });

  const fd = new FormData();
  fd.append('chat_id', String(chatId));
  fd.append('caption', caption);
  if (parseMode) fd.append('parse_mode', parseMode);
  if (messageThreadId != null) fd.append('message_thread_id', String(messageThreadId));
  fd.append('photo', blob, 'photo.jpg');
  return fd;
}
