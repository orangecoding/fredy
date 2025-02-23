import { xhrGet } from '../../xhr';
export const provider = {
  state: [],
  reducers: {
    setProvider: (state: any, payload: any) => {
      return [...Object.freeze(payload)];
    },
  },
  effects: {
    async getProvider() {
      try {
        const response = await xhrGet('/api/jobs/provider');
        // @ts-expect-error TS(2551): Property 'setProvider' does not exist on type '{ g... Remove this comment to see the full error message
        this.setProvider(response.json);
      } catch (Exception) {
        console.error(`Error while trying to get resource for api/jobs/provider. Error:`, Exception);
      }
    },
  },
};
