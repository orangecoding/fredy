import { xhrGet } from '../../xhr';
export const demoMode = {
  state: {
    demoMode: false,
  },
  reducers: {
    setDemoMode: (state: any, payload: any) => {
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
        // @ts-expect-error TS(2551): Property 'setDemoMode' does not exist on type '{ g... Remove this comment to see the full error message
        this.setDemoMode(response.json);
      } catch (Exception) {
        console.error('Error while trying to get resource for api/demo. Error:', Exception);
      }
    },
  },
};
