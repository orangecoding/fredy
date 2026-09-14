/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import * as attachmentStorage from '../../services/storage/listingAttachmentsStorage.js';
import * as listingStorage from '../../services/storage/listingsStorage.js';
import { isAdmin as isAdminFn } from '../security.js';
import logger from '../../services/logger.js';
import { getSettings } from '../../services/storage/settingsStorage.js';
import { trackPoi } from '../../services/tracking/Tracker.js';
import { TRACKING_POIS } from '../../TRACKING_POIS.js';
import {
  ALLOWED_ATTACHMENT_TYPES,
  INLINE_ATTACHMENT_TYPES,
  sanitizeAttachmentName,
  sniffAttachmentMime,
} from '../../services/listings/attachmentTypes.js';
/**
 * Deliberately identical for "listing does not exist" and "listing belongs to someone else", so the
 * response cannot be used to probe which ids are real. Same wording as the listings router.
 */
const NO_ACCESS_MESSAGE = 'You are trying to access a listing that is not associated to your user';

/**
 * Fallbacks for the two ceilings, used only when the settings row is missing or unreadable.
 *
 * Migration 44 seeds the real values and the admin page edits them; these numbers exist so a
 * settings table that somehow lost them refuses sensibly rather than accepting anything. They are
 * duplicated here rather than imported from the migration on purpose - a migration is a frozen
 * snapshot of one moment in the schema, and runtime code reaching into one couples the two.
 * @type {number}
 */
const FALLBACK_MAX_MB = 10;

/** @type {number} */
const FALLBACK_MAX_PER_LISTING = 20;

/**
 * The configured ceilings, with the fallbacks above under them.
 *
 * @returns {Promise<{maxBytes: number, maxCount: number}>}
 */
async function attachmentLimits() {
  const settings = await getSettings();
  const maxMb = Number(settings.listingAttachmentMaxMb);
  const maxCount = Number(settings.listingAttachmentMaxPerListing);
  return {
    maxBytes: (Number.isFinite(maxMb) && maxMb > 0 ? maxMb : FALLBACK_MAX_MB) * 1024 * 1024,
    maxCount: Number.isFinite(maxCount) && maxCount > 0 ? Math.floor(maxCount) : FALLBACK_MAX_PER_LISTING,
  };
}

/**
 * Everything a handler needs before it may touch a listing: the ids, and permission.
 *
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @param {boolean} mutating Whether demo mode should block this.
 * @returns {{listingId: string, userId: string}|null} Null when a response has already been sent.
 */
async function authorize(request, reply, mutating) {
  const { listingId } = request.params || {};
  const userId = request.session?.currentUser;
  if (!listingId || !userId) {
    reply.code(400).send({ message: 'listingId or user not provided' });
    return null;
  }

  if (mutating) {
    const settings = await getSettings();
    if (settings.demoMode && !isAdminFn(request)) {
      reply.code(403).send({ error: 'Sorry, but you cannot change documents in demo mode ;)' });
      return null;
    }
  }

  if (!listingStorage.userCanAccessListing(listingId, userId, isAdminFn(request))) {
    reply.code(403).send({ message: NO_ACCESS_MESSAGE });
    return null;
  }
  return { listingId, userId };
}

/**
 * Documents attached to a listing - the exposé, the floor plan, the photos the agent mailed over.
 *
 * Registered under the same `/api/listings` prefix as the listings router, in its own plugin so the
 * raw-body content type parser below stays encapsulated and the JSON routes next door keep parsing
 * JSON.
 *
 * There is no multipart anywhere in Fredy and this feature does not introduce any: the body *is*
 * the file, exactly as backup restore already does it, with the filename in the query string. One
 * file per request keeps both ends trivial.
 *
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function listingAttachmentsPlugin(fastify) {
  fastify.addContentTypeParser(
    [...Object.keys(ALLOWED_ATTACHMENT_TYPES), 'application/octet-stream'],
    { parseAs: 'buffer' },
    (req, body, done) => done(null, body),
  );

  /*
   * The limits ride along with the list rather than living in the settings endpoint, because they
   * are admin-level settings and the person looking at a listing usually is not an admin. The
   * component needs them only to say "too big" before uploading, and this is the call it already
   * makes.
   */
  fastify.get('/:listingId/attachments', async (request, reply) => {
    const scope = await authorize(request, reply, false);
    if (scope == null) return reply;

    try {
      return reply.send({
        attachments: attachmentStorage.listAttachments(scope.listingId),
        limits: await attachmentLimits(),
      });
    } catch (error) {
      logger.error(error);
      return reply.code(500).send({ message: 'Failed to load documents' });
    }
  });

  fastify.post('/:listingId/attachments', async (request, reply) => {
    const scope = await authorize(request, reply, true);
    if (scope == null) return reply;

    const content = request.body;
    if (!Buffer.isBuffer(content) || content.length === 0) {
      return reply.code(400).send({ message: 'No file content received' });
    }

    const { maxBytes, maxCount } = await attachmentLimits();
    if (content.length > maxBytes) {
      return reply
        .code(413)
        .send({ message: `File is larger than the configured limit of ${Math.round(maxBytes / (1024 * 1024))} MB` });
    }

    // The type comes from the bytes, never from the Content-Type header the browser guessed off the
    // file extension. These files are served back from Fredy's own origin, so a renamed .html
    // getting through here would be a stored cross-site scripting hole.
    const mimeType = sniffAttachmentMime(content);
    if (mimeType == null) {
      return reply.code(415).send({ message: 'Only PDF, JPG and PNG files can be attached' });
    }

    try {
      if (attachmentStorage.countAttachments(scope.listingId) >= maxCount) {
        return reply.code(409).send({ message: `This listing already has the maximum of ${maxCount} documents` });
      }

      const attachment = attachmentStorage.addAttachment({
        listingId: scope.listingId,
        filename: sanitizeAttachmentName(request.query?.name, mimeType),
        mimeType,
        content,
      });

      await trackPoi(TRACKING_POIS.LISTING_ATTACHMENT_UPLOAD);
      return reply.code(201).send(attachment);
    } catch (error) {
      logger.error(error);
      return reply.code(500).send({ message: 'Failed to store the document' });
    }
  });

  fastify.get('/:listingId/attachments/:attachmentId', async (request, reply) => {
    const scope = await authorize(request, reply, false);
    if (scope == null) return reply;

    try {
      const attachment = attachmentStorage.getAttachment(request.params?.attachmentId, scope.listingId);
      if (attachment == null) {
        return reply.code(404).send({ message: 'Document not found' });
      }

      // Images go out inline so an <img src> can point straight at this route; a PDF is handed over
      // as a download. `nosniff` keeps the browser from second-guessing either, which is the point
      // of having sniffed the bytes on the way in.
      const disposition = INLINE_ATTACHMENT_TYPES.has(attachment.mimeType) ? 'inline' : 'attachment';
      reply.header('Content-Type', attachment.mimeType);
      reply.header('X-Content-Type-Options', 'nosniff');
      reply.header(
        'Content-Disposition',
        `${disposition}; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
      );
      return reply.send(attachment.content);
    } catch (error) {
      logger.error(error);
      return reply.code(500).send({ message: 'Failed to load the document' });
    }
  });

  fastify.delete('/:listingId/attachments/:attachmentId', async (request, reply) => {
    const scope = await authorize(request, reply, true);
    if (scope == null) return reply;

    try {
      const changes = attachmentStorage.deleteAttachment(request.params?.attachmentId, scope.listingId);
      if (changes === 0) {
        return reply.code(404).send({ message: 'Document not found' });
      }
      return reply.send({ deleted: true });
    } catch (error) {
      logger.error(error);
      return reply.code(500).send({ message: 'Failed to delete the document' });
    }
  });
}
