import { xhrGet } from '../../xhr';
export const notificationAdapter = {
  state: [],
  reducers: {
    setAdapter: (state: any, payload: any) => {
      return [...Object.freeze(payload)];
    },
  },
  effects: {
    async getAdapter() {
      try {
        const response = await xhrGet('/api/jobs/notificationAdapter');
        // @ts-expect-error TS(2551): Property 'setAdapter' does not exist on type '{ ge... Remove this comment to see the full error message
        this.setAdapter(response.json);
      } catch (Exception) {
        console.error(`Error while trying to get resource for api/jobs/notificationAdapter. Error:`, Exception);
      }
    },
  },
};
