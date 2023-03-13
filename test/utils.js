import { readFile } from 'fs/promises';
import esmock from 'esmock';
import * as mockStore from './mocks/mockStore.js';
import { send } from './mocks/mockNotification.js';

export const providerConfig = JSON.parse(await readFile(new URL('./provider/testProvider.json', import.meta.url)));

export const mockFredy = async () => {
  return await esmock('../lib/FredyRuntime', {
    '../lib/services/storage/listingsStorage.js': {
      ...mockStore,
    },
    '../lib/notification/notify.js': {
      send,
    },
  });
};
