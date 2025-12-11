/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import restana from 'restana';
import { getSettings } from '../../services/storage/settingsStorage.js';
const service = restana();
const demoRouter = service.newRouter();

demoRouter.get('/', async (req, res) => {
  const settings = await getSettings();
  res.body = Object.assign({}, { demoMode: settings.demoMode });
  res.send();
});

export { demoRouter };
