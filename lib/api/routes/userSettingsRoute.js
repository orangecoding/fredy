/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import restana from 'restana';
import SqliteConnection from '../../services/storage/SqliteConnection.js';
import { upsertSettings } from '../../services/storage/settingsStorage.js';
import { geocodeAddress } from '../../services/geocoding/geoCodingService.js';
import { autocompleteAddress } from '../../services/geocoding/autocompleteService.js';
import { fromJson } from '../../utils.js';

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
    res.status(500).send({ error: error.message });
  }
});

userSettingsRouter.post('/', async (req, res) => {
  const userId = req.session.currentUser;
  const { home_address } = req.body;

  try {
    if (home_address) {
      const coords = await geocodeAddress(home_address);
      if (coords && coords.lat !== -1) {
        upsertSettings({ home_address: { address: home_address, coords } }, userId);
        res.send({ success: true, coords });
      } else {
        res.status(400).send({ error: 'Could not geocode address' });
      }
    } else {
      // If address is empty, maybe clear it?
      upsertSettings({ home_address: null }, userId);
      res.send({ success: true });
    }
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

export { userSettingsRouter };
