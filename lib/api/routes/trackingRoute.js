/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { trackPoi } from '../../services/tracking/Tracker.js';
import { TRACKING_POIS } from '../../TRACKING_POIS.js';
import logger from '../../services/logger.js';

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function trackingPlugin(fastify) {
  fastify.get('/trackingPois', async () => {
    return TRACKING_POIS;
  });

  fastify.post('/poi', async (request, reply) => {
    const { poi } = request.body;
    if (!poi) {
      return reply.code(400).send({ error: 'Feature name is required' });
    }
    try {
      await trackPoi(poi);
      return { success: true };
    } catch (error) {
      logger.error('Error tracking feature', error);
      return reply.code(500).send({ error: error.message });
    }
  });
}
