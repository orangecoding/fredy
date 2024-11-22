import { xhrGet } from '../../xhr';
export const demoMode = {
  state: {
    demoMode: false,
  },
  reducers: {
    setDemoMode: (state, payload) => {
      return {
        ...state,
        demoMode: payload.demoMode,
      };
    },
  },
  effects: {
    async getDemoMode() {
      try {
        const response = await xhrGet('/api/demo');
        this.setDemoMode(response.json);
      } catch (Exception) {
        console.error('Error while trying to get resource for api/demo. Error:', Exception);
      }
    },
  },
};
