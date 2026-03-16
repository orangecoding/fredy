/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi } from 'vitest';
import { readFile } from 'fs/promises';
import * as mockStore from './mocks/mockStore.js';
import { send } from './mocks/mockNotification.js';

export const providerConfig = JSON.parse(await readFile(new URL('./provider/testProvider.json', import.meta.url)));

vi.mock('../lib/services/storage/listingsStorage.js', () => mockStore);
vi.mock('../lib/services/storage/settingsStorage.js', () => mockStore);
vi.mock('../lib/services/geocoding/geoCodingService.js', () => ({
  geocodeAddress: mockStore.getGeocoordinatesByAddress,
}));
vi.mock('../lib/services/storage/jobStorage.js', () => ({
  getJob: (jobKey) => ({ id: jobKey, userId: 'user1' }),
}));
vi.mock('../lib/notification/notify.js', () => ({ send }));

export const mockFredy = async () => {
  const mod = await import('../lib/FredyPipelineExecutioner.js');
  return mod.default ?? mod;
};
