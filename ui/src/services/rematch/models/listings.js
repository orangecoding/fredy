import { xhrGet } from '../../xhr';

export const listings = {
  state: {
    listings: [],
    loading: false,
    error: null,
  },
  reducers: {
    setListings(state, payload) {
      return {
        ...state,
        listings: payload,
        loading: false,
        error: null,
      };
    },
    setLoading(state, payload) {
      return {
        ...state,
        loading: payload,
      };
    },
    setError(state, payload) {
      return {
        ...state,
        error: payload,
        loading: false,
      };
    },
  },
  effects: (dispatch) => ({
    async getListings() {
      dispatch.listings.setLoading(true);
      try {
        const response = await xhrGet('/api/listings');
        dispatch.listings.setListings(response.json || []);
      } catch (error) {
        dispatch.listings.setError(error.message || error.json?.message || 'Failed to fetch listings');
      }
    },
    async getListingsByJob(jobKey) {
      dispatch.listings.setLoading(true);
      try {
        const response = await xhrGet(`/api/listings/job/${jobKey}`);
        dispatch.listings.setListings(response.json || []);
      } catch (error) {
        dispatch.listings.setError(error.message || error.json?.message || 'Failed to fetch listings');
      }
    },
  }),
};
