/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import {
  isEnabled,
  enableDebugLogging,
  disableDebugLogging,
  getCurrentSize,
  getMaxSize,
  hasAnyLogs,
  wasEverEnabled,
  clearAllDebugLogs,
} from '../../services/debug/debugLogStorage.js';
import { buildDebugBundleFileName, buildDebugBundleZip } from '../../services/debug/debugBundleService.js';
import { getSettings } from '../../services/storage/settingsStorage.js';

/**
 * Build the JSON status payload returned by /status and after each enable/disable.
 * @returns {Promise<{enabled:boolean, size:number, max:number, hasLogs:boolean, everEnabled:boolean}>}
 */
async function buildStatus() {
  return {
    enabled: isEnabled(),
    size: await getCurrentSize(),
    max: getMaxSize(),
    hasLogs: hasAnyLogs(),
    everEnabled: await wasEverEnabled(),
  };
}

/**
 * Register the lightweight /active probe used by the app-wide red banner. Exposed
 * to every authenticated user (not just admins) so non-admin users see the warning
 * banner too. Returns only a single boolean so it cannot be repurposed to leak any
 * other state.
 *
 * @param {import('fastify').FastifyInstance} fastify
 */
export async function registerDebugPublicProbe(fastify) {
  fastify.get('/active', async () => ({ enabled: isEnabled() }));
}

/**
 * Admin-only debug logging endpoints.
 *
 * Routes (all relative to the registered prefix /api/admin/debug):
 *   GET    /status          → current feature status (used by the UI polling).
 *   POST   /enable          → turn debug logging on. Body: { clearPrevious?:boolean }.
 *   POST   /disable         → turn debug logging off (existing logs are kept on disk).
 *   GET    /download        → ZIP with logs.txt + sys.txt. 409 when the feature has
 *                              never been enabled OR there are no logs to export.
 *   DELETE /logs            → drop every stored debug log row (does NOT change the
 *                              enabled flag — useful to free space while keeping
 *                              recording on).
 *
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function debugPlugin(fastify) {
  fastify.get('/status', async () => buildStatus());

  fastify.post('/enable', async (request) => {
    const clearPrevious = request.body?.clearPrevious === true;
    await enableDebugLogging({ clearPrevious });
    return buildStatus();
  });

  fastify.post('/disable', async () => {
    await disableDebugLogging();
    return buildStatus();
  });

  fastify.delete('/logs', async () => {
    clearAllDebugLogs();
    return buildStatus();
  });

  fastify.get('/download', async (request, reply) => {
    const ever = await wasEverEnabled();
    if (!ever || !hasAnyLogs()) {
      return reply.code(409).send({
        error: 'Debug logging has never produced any data on this Fredy installation.',
      });
    }
    const settings = await getSettings();
    const zipBuffer = await buildDebugBundleZip({ settings });
    const fileName = await buildDebugBundleFileName();
    reply.header('Content-Type', 'application/zip');
    reply.header('Content-Disposition', `attachment; filename="${fileName}"`);
    return reply.send(zipBuffer);
  });
}
