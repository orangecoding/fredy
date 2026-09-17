/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The document types a listing may carry, mapped to the extension used when a filename has to be
 * invented.
 *
 * Deliberately short: an exposé is a PDF, and what an agent sends alongside it is a JPEG or a PNG.
 * Every entry here is a type the browser will be asked to render from Fredy's own origin, so the
 * list is a security boundary rather than a convenience - nothing scriptable (SVG, HTML) belongs
 * in it.
 * @type {Record<string, string>}
 */
export const ALLOWED_ATTACHMENT_TYPES = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

/**
 * Types that are safe to hand the browser inline, so an `<img src>` can point straight at them.
 * A PDF is served as a download instead: it is the one allowed type with an active content model.
 * @type {Set<string>}
 */
export const INLINE_ATTACHMENT_TYPES = new Set(['image/jpeg', 'image/png']);

/**
 * Longest filename kept, in characters. Comfortably inside every filesystem's limit for whoever
 * downloads it, and short enough that the header it ends up in stays sane.
 * @type {number}
 */
const MAX_FILENAME_LENGTH = 255;

/**
 * Control characters and DEL, none of which belong in a name that ends up in an HTTP header.
 * @type {RegExp}
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

/**
 * Leading bytes that identify each allowed type.
 * @type {Array<{mime: string, magic: number[]}>}
 */
const SIGNATURES = [
  // "%PDF-"
  { mime: 'application/pdf', magic: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  { mime: 'image/jpeg', magic: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
];

/**
 * Identify an upload by its leading bytes.
 *
 * The `Content-Type` the browser sent is a claim, not evidence: it is whatever the OS guessed from
 * the file extension, and whoever uploads picks both. Reading the magic bytes is the only way to
 * know that what is about to be stored - and later served back from Fredy's own origin - is really
 * one of the three types the feature allows.
 *
 * @param {Buffer} buffer The uploaded bytes.
 * @returns {string|null} The MIME type, or null when it is not an allowed one.
 */
export function sniffAttachmentMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;
  for (const { mime, magic } of SIGNATURES) {
    if (buffer.length < magic.length) continue;
    if (magic.every((byte, index) => buffer[index] === byte)) return mime;
  }
  return null;
}

/**
 * Turn whatever the browser called a file into something safe to store and to echo back.
 *
 * The name travels in a `Content-Disposition` header on the way out, so a carriage return or line
 * feed in it would be header injection; the slashes go because a name that reads like a path
 * invites somebody to later treat it as one. Nothing here is defence for a filesystem - there is
 * no filesystem - it is defence for the header and for the person reading the list.
 *
 * @param {any} name The raw filename from the client.
 * @param {string} mimeType The sniffed MIME type, used for the fallback extension.
 * @returns {string} A non-empty, single-segment filename.
 */
export function sanitizeAttachmentName(name, mimeType) {
  const cleaned = (typeof name === 'string' ? name : '')
    .replace(CONTROL_CHARACTERS, '')
    .replace(/[\\/]/g, '_')
    .trim()
    .slice(0, MAX_FILENAME_LENGTH)
    .trim();

  // "." and ".." survive every rule above and are still not names.
  if (cleaned.length === 0 || cleaned === '.' || cleaned === '..') {
    return `document.${ALLOWED_ATTACHMENT_TYPES[mimeType] ?? 'bin'}`;
  }
  return cleaned;
}
