/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import restana from 'restana';
import SqliteConnection from '../../services/storage/SqliteConnection.js';
import { getSettings, upsertSettings } from '../../services/storage/settingsStorage.js';
import { resetGeocoordinatesAndDistanceForUser } from '../../services/storage/listingsStorage.js';
import { geocodeAddress } from '../../services/geocoding/geoCodingService.js';
import { autocompleteAddress } from '../../services/geocoding/autocompleteService.js';
import { fromJson } from '../../utils.js';
import { trackPoi } from '../../services/tracking/Tracker.js';
import { TRACKING_POIS } from '../../TRACKING_POIS.js';
import logger from '../../services/logger.js';
import { runGeoCordTask } from '../../services/crons/geocoding-cron.js';

const service = restana();
const userSettingsRouter = service.newRouter();

userSettingsRouter.get('/', async (req, res) => {
  const userId = req.session.currentUser;
  const rows = SqliteConnection.query('SELECT name, value FROM settings WHERE user_id = @userId', { userId });
  const settings = {};
  for (const r of rows) {
    settings[r.name] = fromJson(r.value, null);
  }
  res.body = settings;
  res.send();
});

userSettingsRouter.get('/autocomplete', async (req, res) => {
  const { q } = req.query;
  try {
    const results = await autocompleteAddress(q);
    res.body = results;
    res.send();
  } catch (error) {
    res.statusCode = 500;
    res.send({ error: error.message });
  }
});

userSettingsRouter.post('/home-address', async (req, res) => {
  const userId = req.session.currentUser;
  const { home_address } = req.body;
  const settings = await getSettings();

  if (settings.demoMode) {
    res.send(new Error('In demo mode, it is not allowed to change the home address.'));
    return;
  }

  try {
    if (home_address) {
      await trackPoi(TRACKING_POIS.DISTANCE_ADDRESS_ENTERED);
      const coords = await geocodeAddress(home_address);
      if (coords && coords.lat !== -1) {
        upsertSettings({ home_address: { address: home_address, coords } }, userId);
        resetGeocoordinatesAndDistanceForUser(userId);
        //we do NOT wait for this to finish, as we don't want to block the response
        runGeoCordTask();
        res.send({ success: true, coords });
      } else {
        res.statusCode = 400;
        res.send({ error: 'Could not geocode address' });
      }
    } else {
      upsertSettings({ home_address: null }, userId);
      res.send({ success: true });
    }
  } catch (error) {
    logger.error('Error updating home address settings', error);
    res.statusCode = 500;
    res.send({ error: error.message });
  }
});

userSettingsRouter.post('/news-hash', async (req, res) => {
  const userId = req.session.currentUser;
  const { news_hash } = req.body;

  const globalSettings = await getSettings();
  if (globalSettings.demoMode) {
    res.statusCode = 403;
    res.send({ error: 'In demo mode, it is not allowed to change settings.' });
    return;
  }

  try {
    upsertSettings({ news_hash }, userId);
    res.send({ success: true });
  } catch (error) {
    logger.error('Error updating news hash', error);
    res.statusCode = 500;
    res.send({ error: error.message });
  }
});

export { userSettingsRouter };
