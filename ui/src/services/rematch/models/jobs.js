import { xhrGet } from '../../xhr';
export const jobs = {
  state: {
    jobs: [],
    insights: {},
    processingTimes: {},
  },
  reducers: {
    setJobs: (state, payload) => {
      return {
        ...state,
        jobs: Object.freeze(payload),
      };
    },
    setProcessingTimes: (state, payload) => {
      return {
        ...state,
        processingTimes: Object.freeze(payload),
      };
    },
    setJobInsights: (state, payload, jobId) => {
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
        this.setJobs(response.json);
      } catch (Exception) {
        console.error(`Error while trying to get resource for api/jobs. Error:`, Exception);
      }
    },
    async getProcessingTimes() {
      try {
        const response = await xhrGet('/api/jobs/processingTimes');
        this.setProcessingTimes(response.json);
      } catch (Exception) {
        console.error(`Error while trying to get resource for api/processingTimes. Error:`, Exception);
      }
    },
    async getInsightDataForJob(jobId) {
      try {
        const response = await xhrGet(`/api/jobs/insights/${jobId}`);
        this.setJobInsights(response.json, jobId);
      } catch (Exception) {
        console.error(`Error while trying to get resource for api/jobs/insights. Error:`, Exception);
      }
    },
  },
};
