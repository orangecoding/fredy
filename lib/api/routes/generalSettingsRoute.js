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
import { trackPoi } from '../../services/tracking/Tracker.js';
import { TRACKING_POIS } from '../../TRACKING_POIS.js';

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

    if (!isAdmin(request)) {
      const reason = localSettings.demoMode
        ? 'In demo mode, it is not allowed to change these settings.'
        : 'Only admins can change these settings.';
      return reply.code(403).send({ error: reason });
    }

    try {
      if (typeof sqlitepath !== 'undefined') {
        fs.writeFileSync(`${getDirName()}/../conf/config.json`, JSON.stringify({ sqlitepath }));
      }

      upsertSettings(appSettings);
      ensureDemoUserExists();
      if (appSettings.baseUrl != null) {
        await trackPoi(TRACKING_POIS.BASE_URL_SETTING);
      }
    } catch (err) {
      logger.error(err);
      return reply.code(500).send({ error: 'Error while trying to write settings.' });
    }
    return reply.send();
  });
}
