import { xhrGet } from '../../xhr';

export const dashboard = {
  state: {
    listings: [],
    schema: null,
  },
  reducers: {
    setListings: (state, payload) => {
      return {
        ...state,
        listings: Object.freeze(payload),
      };
    },
    setSchema: (state, payload) => {
      return {
        ...state,
        schema: Object.freeze(payload),
      };
    },
  },
  effects: {
    async getListings(jobId) {
      try {
        const response = await xhrGet(`/api/dashboard/${jobId}/data`);
        this.setListings(response.json);
      } catch (Exception) {
        console.error(`Error while trying to get resource for api/dashboard. Error:`, Exception);
      }
    },
    async getSchema(jobId) {
      try {
        const response = await xhrGet(`/api/dashboard/${jobId}/schema`);
        this.setSchema(response.json);
      } catch (Exception) {
        console.error(`Error while trying to get schema for api/dashboard. Error:`, Exception);
      }
    },
  },
}; 