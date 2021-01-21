import { xhrGet } from '../../xhr';
export const provider = {
  state: [],
  reducers: {
    setProvider: (state, payload) => {
      return [...Object.freeze(payload)];
    },
  },
  effects: {
    async getProvider() {
      try {
        const response = await xhrGet('/api/jobs/provider');
        this.setProvider(response.json);
      } catch (Exception) {
        console.error(`Error while trying to get resource for api/jobs/provider. Error:`, Exception);
      }
    },
  },
};
