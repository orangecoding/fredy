import { xhrGet } from '../../xhr';
export const jobs = {
  state: {
    jobs: [],
    insights: {},
    processingTimes: {},
  },
  reducers: {
    setJobs: (state: any, payload: any) => {
      return {
        ...state,
        jobs: Object.freeze(payload),
      };
    },
    setProcessingTimes: (state: any, payload: any) => {
      return {
        ...state,
        processingTimes: Object.freeze(payload),
      };
    },
    setJobInsights: (state: any, payload: any, jobId: any) => {
      return {
        ...state,
        insights: {
          ...state.insights,
          [jobId]: Object.freeze(payload),
        },
      };
    },
  },
  effects: {
    async getJobs() {
      try {
        const response = await xhrGet('/api/jobs');
        // @ts-expect-error TS(2551): Property 'setJobs' does not exist on type '{ getJo... Remove this comment to see the full error message
        this.setJobs(response.json);
      } catch (Exception) {
        console.error(`Error while trying to get resource for api/jobs. Error:`, Exception);
      }
    },
    async getProcessingTimes() {
      try {
        const response = await xhrGet('/api/jobs/processingTimes');
        // @ts-expect-error TS(2551): Property 'setProcessingTimes' does not exist on ty... Remove this comment to see the full error message
        this.setProcessingTimes(response.json);
      } catch (Exception) {
        console.error(`Error while trying to get resource for api/processingTimes. Error:`, Exception);
      }
    },
    async getInsightDataForJob(jobId: any) {
      try {
        const response = await xhrGet(`/api/jobs/insights/${jobId}`);
        // @ts-expect-error TS(2339): Property 'setJobInsights' does not exist on type '... Remove this comment to see the full error message
        this.setJobInsights(response.json, jobId);
      } catch (Exception) {
        console.error(`Error while trying to get resource for api/jobs/insights. Error:`, Exception);
      }
    },
  },
};
