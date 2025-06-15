import { xhrGet } from '../../xhr';

export const dashboard = {
  state: {
    listings: [],
  },
  reducers: {
    setListings: (state, payload) => {
      return {
        ...state,
        listings: Object.freeze(payload),
      };
    },
  },
  effects: {
    async getListings(jobId) {
      try {
        const response = await xhrGet(`/api/dashboard/${jobId}`);
        this.setListings(response.json);
      } catch (Exception) {
        console.error(`Error while trying to get resource for api/dashboard. Error:`, Exception);
      }
    },
  },
}; 