/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import restana from 'restana';
import { getDirName } from '../../utils.js';
import fs from 'fs';
import { ensureDemoUserExists } from '../../services/storage/userStorage.js';
import logger from '../../services/logger.js';
import { getSettings, upsertSettings } from '../../services/storage/settingsStorage.js';
const service = restana();
const generalSettingsRouter = service.newRouter();

generalSettingsRouter.get('/', async (req, res) => {
  res.body = Object.assign({}, await getSettings());
  res.send();
});
generalSettingsRouter.post('/', async (req, res) => {
  const { sqlitepath, ...appSettings } = req.body || {};
  const localSettings = await getSettings();

  if (localSettings.demoMode) {
    res.send(new Error('In demo mode, it is not allowed to change these settings.'));
    return;
  }

  try {
    if (typeof sqlitepath !== 'undefined') {
      fs.writeFileSync(`${getDirName()}/../conf/config.json`, JSON.stringify({ sqlitepath }));
    }
    upsertSettings(appSettings);
    ensureDemoUserExists();
  } catch (err) {
    logger.error(err);
    res.send(new Error('Error while trying to write settings.'));
    return;
  }
  res.send();
});
export { generalSettingsRouter };
