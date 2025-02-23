import { xhrGet } from '../../xhr';
import { RootModel } from '../../../services/rematch/store';
import { RematchDispatch } from '@rematch/core';
import { XhrApiResponse } from 'ui/src/types/XhrApi';

export interface DemoModeState {
  demoMode: boolean;
}

interface DemoModePayload {
  demoMode: boolean;
}

export const demoMode = {
  state: {
    demoMode: false,
  } as DemoModeState,
  reducers: {
    setDemoMode: (state: DemoModeState, payload: DemoModePayload): DemoModeState => ({
      ...state,
      demoMode: payload.demoMode,
    }),
  },
  effects: (dispatch: RematchDispatch<RootModel>) => ({
    async getDemoMode() {
      try {
        const response = (await xhrGet('/api/demo')) as XhrApiResponse<DemoModePayload>;
        dispatch.demoMode.setDemoMode(response.json);
      } catch (error) {
        console.error('Error while trying to get resource for api/demo:', error);
      }
    },
  }),
};
