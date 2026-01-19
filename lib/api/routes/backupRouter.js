/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import restana from 'restana';
import {
  buildBackupFileName,
  createBackupZip,
  precheckRestore,
  restoreFromZip,
} from '../../services/storage/backupRestoreService.js';

/**
 * Backup & Restore Admin Router
 *
 * Endpoints:
 * - GET /api/admin/backup
 *   Returns the current database as a zip download. Content-Type: application/zip
 * - POST /api/admin/backup/restore?dryRun=true
 *   Accepts a zip file (raw body). Returns a compatibility report, does not restore.
 * - POST /api/admin/backup/restore?force=true|false
 *   Accepts a zip file (raw body). Restores the database; when incompatible and force=false, returns 400.
 */
const service = restana();
const backupRouter = service.newRouter();

backupRouter.get('/', async (req, res) => {
  const zipBuffer = await createBackupZip();
  const fileName = await buildBackupFileName();
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.send(zipBuffer);
});

/**
 * Read the full request body as a Buffer. Used for raw zip uploads.
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<Buffer>}
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', (e) => reject(e));
  });
}

// Upload endpoint. Accepts raw zip (Content-Type: application/zip or application/octet-stream)
// Query parameters:
// - dryRun=true => only validate and return compatibility info
// - force=true  => proceed even if incompatible
backupRouter.post('/restore', async (req, res) => {
  const { dryRun = 'false', force = 'false' } = req.query || {};
  const doDryRun = String(dryRun) === 'true';
  const doForce = String(force) === 'true';
  const body = await readBody(req);

  if (doDryRun) {
    res.body = await precheckRestore(body);
    return res.send();
  }

  try {
    res.body = await restoreFromZip(body, { force: doForce });
    return res.send();
  } catch (e) {
    res.statusCode = 400;
    res.body = { message: e?.message || 'Restore failed', details: e?.payload || null };
    return res.send();
  }
});

export { backupRouter };
