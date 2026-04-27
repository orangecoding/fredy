/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { getDirName } from '../../utils.js';
import fs from 'fs';
import { ensureDemoUserExists } from '../../services/storage/userStorage.js';
import logger from '../../services/logger.js';
import { getSettings, upsertSettings } from '../../services/storage/settingsStorage.js';
import { isAdmin } from '../security.js';

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function generalSettingsPlugin(fastify) {
  fastify.get('/', async () => {
    return Object.assign({}, await getSettings());
  });

  fastify.post('/', async (request, reply) => {
    const { sqlitepath, ...appSettings } = request.body || {};
    if (typeof appSettings.baseUrl === 'string') {
      appSettings.baseUrl = appSettings.baseUrl.trim().replace(/\/$/, '');
    }
    const localSettings = await getSettings();

    if (localSettings.demoMode && !isAdmin(request)) {
      return reply.code(403).send({ error: 'In demo mode, it is not allowed to change these settings.' });
    }

    try {
      if (typeof sqlitepath !== 'undefined') {
        fs.writeFileSync(`${getDirName()}/../conf/config.json`, JSON.stringify({ sqlitepath }));
      }
      upsertSettings(appSettings);
      ensureDemoUserExists();
    } catch (err) {
      logger.error(err);
      return reply.code(500).send({ error: 'Error while trying to write settings.' });
    }
    return reply.send();
  });
}
