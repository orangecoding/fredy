/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { getSettings } from '../../services/storage/settingsStorage.js';
import { getProviders } from '../../utils.js';
import { trackPoi } from '../../services/tracking/Tracker.js';
import { TRACKING_POIS } from '../../TRACKING_POIS.js';
import logger from '../../services/logger.js';
import {
  TOUR_OUTCOMES,
  TOUR_STATUS,
  declineTour,
  finishTour,
  getTourState,
  startTour,
} from '../../services/tour/tourService.js';

/** The POI each way of ending a running tour reports. */
const OUTCOME_POIS = Object.freeze({
  [TOUR_STATUS.COMPLETED]: TRACKING_POIS.TOUR_COMPLETED,
  [TOUR_STATUS.CANCELLED]: TRACKING_POIS.TOUR_CANCELLED,
});

/**
 * The onboarding tour, always on behalf of the signed-in user and nobody else.
 *
 * The answer to "do you want a tour" is reported as a POI here rather than from the browser, so it
 * is counted once per decision the server actually stored and not once per click.
 *
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function tourPlugin(fastify) {
  fastify.get('/', async (request) => {
    return getTourState(request.session.currentUser);
  });

  /**
   * Accept the tour. Only possible while it is on offer, or to restart one that is already running,
   * so a scripted client cannot keep re-seeding example data into an account that said no.
   */
  fastify.post('/start', async (request, reply) => {
    const userId = request.session.currentUser;
    const settings = await getSettings();
    if (settings.demoMode) {
      return reply.code(403).send({ error: 'The tour is not available in demo mode.' });
    }

    const state = await getTourState(userId);
    if (!state.offer && state.status !== TOUR_STATUS.RUNNING) {
      return reply.code(409).send({ error: 'The tour has already been answered for this account.' });
    }

    try {
      const started = startTour(userId, await getProviders());
      if (state.offer) {
        await trackPoi(TRACKING_POIS.TOUR_ACCEPTED);
      }
      return started;
    } catch (error) {
      logger.error('Could not start the onboarding tour', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  /** Decline the tour. Same condition as starting it: only an open question can be answered. */
  fastify.post('/decline', async (request, reply) => {
    const userId = request.session.currentUser;
    const state = await getTourState(userId);
    if (!state.offer) {
      return reply.code(409).send({ error: 'The tour is not on offer for this account.' });
    }
    try {
      declineTour(userId);
      await trackPoi(TRACKING_POIS.TOUR_DECLINED);
      return { success: true };
    } catch (error) {
      logger.error('Could not store that the onboarding tour was declined', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * End the tour and remove its example data.
   *
   * Also the target of the beacon the browser sends when the tab is closed mid-tour, which is why a
   * finish for a tour that is no longer running still succeeds: it removes whatever might be left
   * and reports nothing, so the beacon racing an explicit finish cannot count one tour twice.
   */
  fastify.post('/finish', async (request, reply) => {
    const userId = request.session.currentUser;
    const outcome = request.body?.outcome;
    if (!TOUR_OUTCOMES.includes(outcome)) {
      return reply.code(400).send({ error: `outcome must be one of ${TOUR_OUTCOMES.join(', ')}.` });
    }
    try {
      const { wasRunning } = finishTour(userId, outcome);
      if (wasRunning) {
        await trackPoi(OUTCOME_POIS[outcome]);
      }
      return { success: true };
    } catch (error) {
      logger.error('Could not finish the onboarding tour', error);
      return reply.code(500).send({ error: error.message });
    }
  });
}
