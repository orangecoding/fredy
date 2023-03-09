import { xhrGet } from '../../xhr';
export const generalSettings = {
  state: {
    settings: {},
  },
  reducers: {
    //only admins
    setGeneralSettings: (state, payload) => {
      return {
        ...state,
        settings: payload,
      };
    },
  },
  effects: {
    async getGeneralSettings() {
      try {
        const response = await xhrGet('/api/admin/generalSettings');
        this.setGeneralSettings(response.json);
      } catch (Exception) {
        console.error('Error while trying to get resource for api/admin/generalSettings. Error:', Exception);
      }
    },
  },
};
