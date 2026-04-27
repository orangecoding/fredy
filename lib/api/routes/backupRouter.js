/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import {
  buildBackupFileName,
  createBackupZip,
  precheckRestore,
  restoreFromZip,
} from '../../services/storage/backupRestoreService.js';

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function backupPlugin(fastify) {
  // Parse raw binary uploads as Buffer
  fastify.addContentTypeParser(
    ['application/zip', 'application/octet-stream'],
    { parseAs: 'buffer' },
    (req, body, done) => done(null, body),
  );

  fastify.get('/', async (_request, reply) => {
    const zipBuffer = await createBackupZip();
    const fileName = await buildBackupFileName();
    reply.header('Content-Type', 'application/zip');
    reply.header('Content-Disposition', `attachment; filename="${fileName}"`);
    return reply.send(zipBuffer);
  });

  fastify.post('/restore', async (request, reply) => {
    const { dryRun = 'false', force = 'false' } = request.query || {};
    const doDryRun = String(dryRun) === 'true';
    const doForce = String(force) === 'true';
    const body = request.body; // Buffer from addContentTypeParser

    if (doDryRun) {
      return precheckRestore(body);
    }

    try {
      return restoreFromZip(body, { force: doForce });
    } catch (e) {
      return reply.code(400).send({
        message: e?.message || 'Restore failed',
        details: e?.payload || null,
      });
    }
  });
}
