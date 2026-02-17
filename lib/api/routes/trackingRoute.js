/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import restana from 'restana';
import { trackPoi } from '../../services/tracking/Tracker.js';
import { TRACKING_POIS } from '../../TRACKING_POIS.js';
import logger from '../../services/logger.js';

const service = restana();
const trackingRouter = service.newRouter();

trackingRouter.get('/trackingPois', async (req, res) => {
  res.body = TRACKING_POIS;
  res.send();
});

trackingRouter.post('/poi', async (req, res) => {
  const { poi } = req.body;
  if (!poi) {
    res.statusCode = 400;
    res.send({ error: 'Feature name is required' });
    return;
  }

  try {
    await trackPoi(poi);
    res.send({ success: true });
  } catch (error) {
    logger.error('Error tracking feature', error);
    res.statusCode = 500;
    res.send({ error: error.message });
  }
});

export { trackingRouter };
