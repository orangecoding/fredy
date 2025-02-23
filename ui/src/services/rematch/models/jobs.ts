import { xhrGet } from '../../xhr';
import { JobsState, ProcessingTimes } from '../../../types';
import { RootModel } from '../store';
import { RematchDispatch } from '@rematch/core';
import { Job } from '#types/Jobs.ts';

const defaultState: JobsState = {
  jobs: [],
  insights: {},
  processingTimes: {
    interval: 0, // Default interval, adjust if necessary
  },
};

export const jobs = {
  state: defaultState,
  reducers: {
    setJobs: (state: JobsState, payload: Job[]): JobsState => ({
      ...state,
      jobs: payload,
    }),
    setProcessingTimes: (state: JobsState, payload: ProcessingTimes): JobsState => ({
      ...state,
      processingTimes: payload,
    }),
    setJobInsights: (state: JobsState, payload: Job, jobId: number): JobsState => ({
      ...state,
      insights: {
        ...state.insights,
        [jobId]: payload,
      },
    }),
  },
  effects: (dispatch: RematchDispatch<RootModel>) => ({
    async getJobs() {
      try {
        const response = await xhrGet<Job[]>('/api/jobs');
        const jobs = response.json;
        dispatch.jobs.setJobs(jobs);
      } catch (error) {
        console.error(`Error while trying to get resource for api/jobs. Error:`, error);
      }
    },
    async getProcessingTimes() {
      try {
        const response = await xhrGet<ProcessingTimes>('/api/jobs/processingTimes');
        const processingTimes = response.json;
        dispatch.jobs.setProcessingTimes(processingTimes);
      } catch (error) {
        console.error(`Error while trying to get resource for api/processingTimes. Error:`, error);
      }
    },
    async getInsightDataForJob(jobId: number) {
      try {
        const response = await xhrGet<Job>(`/api/jobs/insights/${jobId}`);
        const job = response.json;
        dispatch.jobs.setJobInsights(job, jobId);
      } catch (error) {
        console.error(`Error while trying to get resource for api/jobs/insights. Error:`, error);
      }
    },
  }),
};
