import { NotificationAdapterConfig } from '#types/NotificationAdapter.ts';
import { xhrGet } from '../../xhr';
import { RootModel } from '../store';
import { RematchDispatch } from '@rematch/core';

export interface NotificationAdapterState {
  adapter: NotificationAdapterConfig[];
}

const defaultState: NotificationAdapterState = {
  adapter: [],
};

export const notificationAdapter = {
  state: defaultState,
  reducers: {
    setAdapter: (state: NotificationAdapterState, payload: NotificationAdapterConfig[]) => {
      return { ...state, adapter: payload };
    },
  },
  effects: (dispatch: RematchDispatch<RootModel>) => ({
    async getAdapter() {
      try {
        const response = await xhrGet<NotificationAdapterConfig[]>('/api/jobs/notificationAdapter');
        const adapter = response.json;
        dispatch.notificationAdapter.setAdapter(adapter);
      } catch (error) {
        console.error(`Error while trying to get resource for api/jobs/notificationAdapter. Error:`, error);
      }
    },
  }),
};
