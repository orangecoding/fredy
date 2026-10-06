/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import crypto from 'crypto';
import * as listingStorage from '../../services/storage/listingsStorage.js';
import logger from '../../services/logger.js';

/**
 * Validate the machine-to-machine service token.
 *
 * Compared with a timing-safe equality so the token cannot be probed byte by byte, and
 * fail-closed: when no token is configured (or none is sent) nothing is accepted.
 *
 * @param {string|null|undefined} provided Value of the `x-service-token` header.
 * @returns {boolean} True when it matches `FREDY_SERVICE_TOKEN`.
 */
const isServiceTokenValid = (provided) => {
  const expected = process.env.FREDY_SERVICE_TOKEN;
  if (!expected || typeof provided !== 'string' || provided.length === 0) {
    return false;
  }
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

/**
 * Immo-bot score write-back (`POST /api/listings/scores`).
 *
 * Machine-to-machine endpoint for the scoring backend - the second half of the single-
 * database merge. The backend used to UPDATE this file directly, which put two SQLite
 * engines on one file over a Docker Desktop mount and corrupted it; from here on Fredy
 * is the only process that ever opens the database and the backend goes through here.
 *
 * Registered OUTSIDE the session `authHook` group in api.js on purpose: the backend holds
 * no user session. Auth is the shared service token (`FREDY_SERVICE_TOKEN` env, sent as
 * `x-service-token`), which may only write the closed score-column allowlist - see
 * {@link listingStorage.updateListingScoresByLink}.
 *
 * @param {import('fastify').FastifyInstance} fastify
 * @returns {void}
 */
export default async function serviceScoresRouter(fastify) {
  fastify.post('/scores', async (request, reply) => {
    if (!isServiceTokenValid(request.headers?.['x-service-token'])) {
      return reply.code(403).send({ error: 'Invalid or missing service token' });
    }
    const { items } = request.body || {};
    if (!Array.isArray(items)) {
      return reply.code(400).send({ error: 'items must be an array' });
    }
    if (items.length > 1000) {
      return reply.code(400).send({ error: 'items must not exceed 1000 entries per request' });
    }
    let updated = 0;
    let skipped = 0;
    let invalid = 0;
    for (const item of items) {
      if (item == null || typeof item.link !== 'string' || item.link.length === 0) {
        invalid += 1;
        continue;
      }
      try {
        const result = listingStorage.updateListingScoresByLink(item.link, item);
        updated += result.updated;
        if (result.skipped) skipped += 1;
      } catch (error) {
        logger.error(error);
        invalid += 1;
      }
    }
    return reply.send({ updated, skipped, invalid, total: items.length });
  });
}
