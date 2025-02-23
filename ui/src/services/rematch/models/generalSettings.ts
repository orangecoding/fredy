import { xhrGet } from '../../xhr';
export const generalSettings = {
  state: {
    settings: {},
  },
  reducers: {
    //only admins
    setGeneralSettings: (state: any, payload: any) => {
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
        // @ts-expect-error TS(2551): Property 'setGeneralSettings' does not exist on ty... Remove this comment to see the full error message
        this.setGeneralSettings(response.json);
      } catch (Exception) {
        console.error('Error while trying to get resource for api/admin/generalSettings. Error:', Exception);
      }
    },
  },
};
