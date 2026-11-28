/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { compressPreview } from '../services/listings/listingPictures.js';
import { PdfReadError, readPdfText } from '../services/listings/pdfText.js';

/**
 * Turning a document attached to a listing into something an MCP client passes on to the model.
 *
 * Neither kind of document can go out as stored. A PDF sent as an embedded binary resource mostly
 * never reaches the model: Claude Desktop drops it, a remote connector may refuse the whole result,
 * Claude Code writes it to disk. So a PDF goes out as its text. An image goes out as an image, but
 * shrunk first: an upload may be as large as the admin's limit allows (up to 50 MB), and the Claude
 * API refuses any image over 5 MB, so a phone photo of a floor plan would fail the whole call.
 */

/**
 * Longest edge of a document image, in pixels. Claude scales anything longer than 1568px down
 * before looking at it, so more is only bytes. A floor plan is still legible here, which it is not
 * at the 800px of a stored listing picture.
 * @type {number}
 */
export const DOCUMENT_IMAGE_MAX_EDGE = 1600;

/**
 * WebP quality of a document image. Above the listing picture's, because thin lines and small print
 * are what lossy compression blurs first.
 * @type {number}
 */
export const DOCUMENT_IMAGE_WEBP_QUALITY = 85;

/**
 * Largest image handed out, in bytes. Base64 adds a third on the way, which keeps it below the 5 MB
 * the Claude API accepts per image. Only reached without sharp, or by an image that does not shrink.
 * @type {number}
 */
export const MAX_DOCUMENT_IMAGE_BYTES = 3.5 * 1024 * 1024;

/**
 * Characters of PDF text in one answer, about ten thousand tokens. MCP clients cap what a tool may
 * return (Claude Code warns from 10,000 tokens and cuts off at 25,000), so a longer document is read
 * in several calls, page ranges continuing where the last one stopped.
 * @type {number}
 */
export const MAX_DOCUMENT_TEXT_CHARS = 40_000;

/**
 * Where the user finds the document themselves, for every case the model cannot be given it.
 * @type {string}
 */
export const OPEN_IN_WEB_UI = "The user can open it in Fredy's web UI, under Documents on the listing's page.";

/**
 * @typedef {Object} PreparedImage
 * @property {'image'} kind
 * @property {Buffer} content The bytes to send, shrunk.
 * @property {string} mimeType Their type, `image/webp` unless the original was already smaller.
 */

/**
 * @typedef {{kind: 'text'} & import('../services/listings/pdfText.js').PdfText} PreparedText
 */

/**
 * Prepare one stored document for a model: an image shrunk, a PDF as the text of its next pages.
 *
 * @param {import('../services/storage/listingAttachmentsStorage.js').ListingAttachment & {content: Buffer}} document
 * @param {Object} [options]
 * @param {number} [options.fromPage=1] For a PDF, the one-based page to start reading at.
 * @returns {Promise<PreparedImage|PreparedText>}
 * @throws {Error} When the document cannot be sent or read. The message is meant for the user and,
 *   where it helps, says where to look at the document instead.
 */
export async function prepareListingDocument(document, { fromPage = 1 } = {}) {
  if (document.mimeType.startsWith('image/')) {
    return prepareImage(document);
  }
  if (document.mimeType === 'application/pdf') {
    return preparePdf(document, fromPage);
  }
  // attachmentTypes.js allows nothing else today. A type added there later has to be handled here.
  throw new Error(`Documents of type ${document.mimeType} cannot be read here. ${OPEN_IN_WEB_UI}`);
}

/**
 * @param {{content: Buffer, mimeType: string}} document
 * @returns {Promise<PreparedImage>}
 */
async function prepareImage(document) {
  let image;
  try {
    image = await compressPreview(document.content, document.mimeType, {
      maxEdge: DOCUMENT_IMAGE_MAX_EDGE,
      quality: DOCUMENT_IMAGE_WEBP_QUALITY,
      maxUncompressedBytes: MAX_DOCUMENT_IMAGE_BYTES,
    });
  } catch (error) {
    throw new Error(`The image could not be prepared (${error.message}). ${OPEN_IN_WEB_UI}`);
  }
  if (image.content.length > MAX_DOCUMENT_IMAGE_BYTES) {
    throw new Error(
      `The image is too large to send (${image.content.length} bytes after shrinking). ${OPEN_IN_WEB_UI}`,
    );
  }
  return { kind: 'image', ...image };
}

/**
 * @param {{content: Buffer}} document
 * @param {number} fromPage
 * @returns {Promise<PreparedText>}
 */
async function preparePdf(document, fromPage) {
  let text;
  try {
    text = await readPdfText(document.content, { fromPage, maxChars: MAX_DOCUMENT_TEXT_CHARS });
  } catch (error) {
    const message = error instanceof PdfReadError ? error.message : `The PDF cannot be read: ${error.message}`;
    throw new Error(`${message} ${OPEN_IN_WEB_UI}`);
  }
  if (text.pages.length === 0) {
    throw new Error(
      `The PDF has ${text.totalPages} page${text.totalPages === 1 ? '' : 's'}, so there is no page ${fromPage}.`,
    );
  }
  return { kind: 'text', ...text };
}
