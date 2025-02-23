import { readFile } from 'fs/promises';
import esmock from 'esmock';
import * as mockStore from './mocks/mockStore';
import { send } from './mocks/mockNotification';

const configString = await readFile(new URL('./provider/testProvider.json', import.meta.url)).toString();
export const providerConfig = JSON.parse(configString);

export const mockFredy = async () => {
  return await esmock('../lib/FredyRuntime', {
    '../lib/services/storage/listingsStorage.js': {
      ...mockStore,
    },
    '../lib/notification/notify': {
      send,
    },
  });
};
