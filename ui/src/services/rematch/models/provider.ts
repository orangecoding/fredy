import { xhrGet } from '../../xhr';
import { Provider } from '../../../types';
import { RootModel } from '../store';
import { RematchDispatch } from '@rematch/core';

export interface ProviderState {
  provider: Provider[];
}

const defaultState: ProviderState = {
  provider: [],
};

export const provider = {
  state: defaultState,
  reducers: {
    setProvider: (state: ProviderState, payload: Provider[]): ProviderState => {
      return { ...state, provider: payload };
    },
  },
  effects: (dispatch: RematchDispatch<RootModel>) => ({
    async getProvider() {
      try {
        const response = await xhrGet<Provider[]>('/api/jobs/provider');
        const provider = response.json;
        dispatch.provider.setProvider(provider);
      } catch (error) {
        console.error(`Error while trying to get resource for api/jobs/provider. Error:`, error);
      }
    },
  }),
};
