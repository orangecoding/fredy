/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { getNearbyStops, getDepartures } from '../../services/transit/transitService.js';
import { refineTravelTimesForListing } from '../../services/listings/travelTimeSweeper.js';
import { attachTravelTimes, getListingById, userCanAccessListing } from '../../services/storage/listingsStorage.js';
import { getJob } from '../../services/storage/jobStorage.js';
import { getAddresses, getUserSettings } from '../../services/storage/settingsStorage.js';
import { isAdmin as isAdminFn } from '../security.js';
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

  /**
   * The exact travel times for one listing.
   *
   * Everything else in Fredy works from an estimate: one region-wide reachability lookup per address
   * plus the straight-line walk from the nearest stop, which costs nothing per listing. That is the
   * right trade for a page of fifty listings, and the wrong one for the flat somebody is actually
   * considering - so opening a detail page asks for the real journey, which also answers for car,
   * bike and walking and carries the driving route the map draws.
   *
   * One person looking at one listing is a handful of requests at human pace, which is a very
   * different thing from a batch, and the result is stored so it is only paid for once.
   */
  fastify.get('/travel-times', async (request, reply) => {
    const listingId = request.query.listingId;
    if (!listingId) {
      return reply.code(400).send({ error: 'listingId is required' });
    }

    const userId = request.session?.currentUser;
    const isAdmin = isAdminFn(request);
    if (!userCanAccessListing(listingId, userId, isAdmin)) {
      return reply.code(403).send({ error: 'Not allowed to access this listing' });
    }

    const listing = getListingById(listingId, userId, isAdmin);
    if (listing == null) {
      return reply.code(404).send({ error: 'Listing not found' });
    }
    // No short circuit on "already exact": whether a stored journey still answers the question is
    // decided inside refineTravelTimesForListing, which also knows about rows written by an older
    // version that cannot name their stops. Returning early here made those unrepairable.
    if (listing.latitude == null || listing.longitude == null) {
      return { travelTimes: [] };
    }

    // The reference addresses belong to whoever owns the job, the same rule the stored distances
    // follow - a shared job shows the owner's commute, not the viewer's.
    const ownerId = getJob(listing.job_id)?.userId ?? userId;
    const addresses = getAddresses(getUserSettings(ownerId));
    if (addresses.length === 0) {
      return { travelTimes: [] };
    }

    try {
      await refineTravelTimesForListing(listing, addresses);
      return { travelTimes: attachTravelTimes([{ id: listing.id }], { includeGeometry: true })[0].travelTimes ?? [] };
    } catch (error) {
      logger.error('Error computing travel times', error);
      return reply.code(502).send({ error: 'Travel time lookup failed' });
    }
  });
}
