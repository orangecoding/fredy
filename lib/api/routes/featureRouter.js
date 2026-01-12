/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import restana from 'restana';
import getFeatures from '../../features.js';
const service = restana();
const featureRouter = service.newRouter();

featureRouter.get('/', async (req, res) => {
  const features = getFeatures();
  res.body = Object.assign({}, { features });
  res.send();
});

export { featureRouter };
