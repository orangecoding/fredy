import { GeneralSettings } from '#types/GeneralSettings.ts';
import { xhrGet } from '../../xhr';
import { RootModel } from '../store';
import { RematchDispatch } from '@rematch/core';

export interface GeneralSettingsState {
  settings: GeneralSettings;
}

export interface GeneralSettingsModel {
  state: GeneralSettingsState;
  reducers: {
    setGeneralSettings: (state: GeneralSettingsState, payload: GeneralSettings) => GeneralSettingsState;
  };
  effects: (dispatch: RematchDispatch<RootModel>) => {
    getGeneralSettings: () => Promise<void>;
  };
}

export const generalSettings: GeneralSettingsModel = {
  state: {
    settings: {
      demoMode: false,
      analyticsEnabled: null,
      workingHours: {
        from: null,
        to: null,
      },
    },
  },
  reducers: {
    setGeneralSettings: (state: GeneralSettingsState, payload: GeneralSettings): GeneralSettingsState => {
      return {
        ...state,
        settings: payload,
      };
    },
  },
  effects: (dispatch: RematchDispatch<RootModel>) => ({
    async getGeneralSettings() {
      try {
        const response = await xhrGet<GeneralSettings>('/api/admin/generalSettings');
        dispatch.generalSettings.setGeneralSettings(response.json);
      } catch (error) {
        console.error('Error while trying to get resource for api/admin/generalSettings. Error:', error);
      }
    },
  }),
};
