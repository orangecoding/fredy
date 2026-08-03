/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { getSettings } from '../../services/storage/settingsStorage.js';
import { isPriceTrackingRunning, runPriceTracking } from '../../services/crons/price-tracking-cron.js';
import logger from '../../services/logger.js';

/**
 * Start the price tracking sweep by hand.
 *
 * Registered admin-only. The sweep covers every tracked listing on the instance, not the caller's
 * own, and it is the single heaviest thing Fredy does - one rendered browser page per listing - so
 * who may set it off is the same question as who may configure it.
 *
 * Answers 202 and returns immediately rather than awaiting the run. A sweep can take minutes; the
 * caller wants to know it was accepted, not sit on an open connection until it finishes.
 *
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function priceTrackingPlugin(fastify) {
  fastify.post('/run', async (request, reply) => {
    const settings = await getSettings();

    if (settings.priceTrackingEnabled !== true) {
      return reply.code(409).send({ error: 'Price tracking is switched off for this instance.' });
    }
    // The cron's guard would drop this silently, which is the right thing for a scheduled slot and
    // the wrong thing for a button: the operator would be told it started when it did not.
    if (isPriceTrackingRunning()) {
      return reply.code(409).send({ error: 'A price tracking run is already in progress.' });
    }

    // Deliberately not awaited. Failures inside are logged by the runner, which never throws.
    runPriceTracking().catch((error) => {
      logger.warn('A manually started price tracking run failed', error);
    });

    return reply.code(202).send({ message: 'Price tracking run accepted' });
  });
}
