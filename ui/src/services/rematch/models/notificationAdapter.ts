import { xhrGet } from '../../xhr';
export const notificationAdapter = {
  state: [],
  reducers: {
    setAdapter: (state, payload) => {
      return [...Object.freeze(payload)];
    },
  },
  effects: {
    async getAdapter() {
      try {
        const response = await xhrGet('/api/jobs/notificationAdapter');
        this.setAdapter(response.json);
      } catch (Exception) {
        console.error(`Error while trying to get resource for api/jobs/notificationAdapter. Error:`, Exception);
      }
    },
  },
};
