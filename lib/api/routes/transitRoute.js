/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { getNearbyStops, getDepartures } from '../../services/transit/transitService.js';
import logger from '../../services/logger.js';

/**
 * Parses a coordinate from the query string.
 *
 * @param {unknown} value
 * @param {number} max - 90 for a latitude, 180 for a longitude.
 * @returns {number|null} `null` when the value is missing or out of range.
 */
function parseCoordinate(value, max) {
  const parsed = Number(value);
  if (value == null || value === '' || !Number.isFinite(parsed) || Math.abs(parsed) > max) {
    return null;
  }
  return parsed;
}

/**
 * Parses a positive integer from the query string, clamped into a range.
 *
 * @param {unknown} value
 * @param {number} fallback - Used when the value is missing or unparseable.
 * @param {number} max
 * @returns {number}
 */
function parseLimit(value, fallback, max) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(parsed, max);
}

/**
 * Public transport lookups for the map. Everything goes through Fredy's backend rather than the
 * browser so the upstream community API sees one cached, throttled client per installation instead
 * of one per open tab.
 *
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function transitPlugin(fastify) {
  fastify.get('/stops/nearby', async (request, reply) => {
    const lat = parseCoordinate(request.query.lat, 90);
    const lng = parseCoordinate(request.query.lng, 180);

    if (lat == null || lng == null) {
      return reply.code(400).send({ error: 'lat and lng are required' });
    }

    try {
      return { stops: await getNearbyStops(lat, lng, parseLimit(request.query.limit, 3, 10)) };
    } catch (error) {
      logger.error('Error looking up nearby transit stops', error);
      return reply.code(502).send({ error: 'Transit lookup failed' });
    }
  });

  fastify.get('/departures', async (request, reply) => {
    const { stopId, name } = request.query;
    const lat = parseCoordinate(request.query.lat, 90);
    const lng = parseCoordinate(request.query.lng, 180);

    if (!stopId && (lat == null || lng == null)) {
      return reply.code(400).send({ error: 'stopId or lat/lng are required' });
    }

    try {
      const board = await getDepartures({
        stopId,
        lat,
        lng,
        name,
        limit: parseLimit(request.query.limit, 8, 20),
      });

      if (board == null) {
        // Not a server fault and not a client fault: the timetable service had no answer. The UI
        // tells the user that departures are unavailable right now.
        return reply.code(502).send({ error: 'No departures available' });
      }

      return board;
    } catch (error) {
      logger.error('Error looking up departures', error);
      return reply.code(502).send({ error: 'Transit lookup failed' });
    }
  });
}
