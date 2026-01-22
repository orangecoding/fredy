/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { readFile } from 'fs/promises';
import esmock from 'esmock';
import * as mockStore from './mocks/mockStore.js';
import { send } from './mocks/mockNotification.js';

export const providerConfig = JSON.parse(await readFile(new URL('./provider/testProvider.json', import.meta.url)));

export const mockFredy = async () => {
  return await esmock('../lib/FredyPipelineExecutioner', {
    '../lib/services/storage/listingsStorage.js': {
      ...mockStore,
    },
    '../lib/services/storage/settingsStorage.js': {
      ...mockStore,
    },
    '../lib/services/geocoding/geoCodingService.js': {
      geocodeAddress: mockStore.getGeocoordinatesByAddress,
    },
    '../lib/services/storage/jobStorage.js': {
      getJob: (jobKey) => ({ id: jobKey, userId: 'user1' }),
    },
    '../lib/notification/notify.js': {
      send,
    },
  });
};
