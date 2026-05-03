/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import SqliteConnection from '../../services/storage/SqliteConnection.js';
import { getSettings, upsertSettings } from '../../services/storage/settingsStorage.js';
import { isAdmin } from '../security.js';
import { resetGeocoordinatesAndDistanceForUser } from '../../services/storage/listingsStorage.js';
import { geocodeAddress } from '../../services/geocoding/geoCodingService.js';
import { autocompleteAddress } from '../../services/geocoding/autocompleteService.js';
import { fromJson } from '../../utils.js';
import { trackPoi } from '../../services/tracking/Tracker.js';
import { TRACKING_POIS } from '../../TRACKING_POIS.js';
import logger from '../../services/logger.js';
import { runGeoCordTask } from '../../services/crons/geocoding-cron.js';

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function userSettingsPlugin(fastify) {
  fastify.get('/', async (request) => {
    const userId = request.session.currentUser;
    const rows = SqliteConnection.query('SELECT name, value FROM settings WHERE user_id = @userId', { userId });
    const settings = {};
    for (const r of rows) {
      settings[r.name] = fromJson(r.value, null);
    }
    return settings;
  });

  fastify.get('/autocomplete', async (request, reply) => {
    const { q } = request.query;
    try {
      const results = await autocompleteAddress(q);
      return results;
    } catch (error) {
      return reply.code(500).send({ error: error.message });
    }
  });

  fastify.post('/home-address', async (request, reply) => {
    const userId = request.session.currentUser;
    const { home_address } = request.body;
    const settings = await getSettings();

    if (settings.demoMode && !isAdmin(request)) {
      return reply.code(403).send({ error: 'In demo mode, it is not allowed to change the home address.' });
    }

    try {
      if (home_address) {
        await trackPoi(TRACKING_POIS.DISTANCE_ADDRESS_ENTERED);
        const coords = await geocodeAddress(home_address);
        if (coords && coords.lat !== -1) {
          upsertSettings({ home_address: { address: home_address, coords } }, userId);
          resetGeocoordinatesAndDistanceForUser(userId);
          runGeoCordTask();
          return { success: true, coords };
        } else {
          return reply.code(400).send({ error: 'Could not geocode address' });
        }
      } else {
        upsertSettings({ home_address: null }, userId);
        return { success: true };
      }
    } catch (error) {
      logger.error('Error updating home address settings', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  fastify.post('/news-hash', async (request, reply) => {
    const userId = request.session.currentUser;
    const { news_hash } = request.body;

    const globalSettings = await getSettings();
    if (globalSettings.demoMode && !isAdmin(request)) {
      return reply.code(403).send({ error: 'In demo mode, it is not allowed to change settings.' });
    }

    try {
      upsertSettings({ news_hash }, userId);
      return { success: true };
    } catch (error) {
      logger.error('Error updating news hash', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  fastify.post('/provider-details', async (request, reply) => {
    const userId = request.session.currentUser;
    const { provider_details } = request.body;

    const globalSettings = await getSettings();
    if (globalSettings.demoMode && !isAdmin(request)) {
      return reply.code(403).send({ error: 'In demo mode, it is not allowed to change settings.' });
    }

    if (!Array.isArray(provider_details)) {
      return reply.code(400).send({ error: 'provider_details must be an array of provider ids.' });
    }

    try {
      upsertSettings({ provider_details }, userId);
      return { success: true };
    } catch (error) {
      logger.error('Error updating provider details setting', error);
      return reply.code(500).send({ error: error.message });
    }
  });
}
