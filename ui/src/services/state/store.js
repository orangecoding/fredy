/**
 * Zustand store for Fredy ui state.
 */
import { create } from 'zustand';
import { shallow } from 'zustand/shallow';
import { xhrGet } from '../xhr.js';

const logger = (config) => (set, get, api) =>
  config(
    (partial, replace) => {
      const prev = get();
      set(partial, replace);
      const next = get();
      if (process.env.NODE_ENV !== 'production') {
        /* eslint-disable no-console */
        console.info('[zustand] state changed:', { prev, next });
        /* eslint-enable no-console */
      }
    },
    get,
    api,
  );

// Create the Zustand store with slices and actions
export const useFredyState = create(
  logger(
    (set) => {
      // Internal setters
      const reducers = {
        notificationAdapter: {
          setAdapter: (payload) => set(() => ({ notificationAdapter: Object.freeze([...payload]) })),
        },
        generalSettings: {
          setGeneralSettings: (payload) =>
            set((state) => ({ generalSettings: { ...state.generalSettings, settings: payload } })),
        },
        demoMode: {
          setDemoMode: (payload) => set((state) => ({ demoMode: { ...state.demoMode, demoMode: payload.demoMode } })),
        },
        provider: {
          setProvider: (payload) => set(() => ({ provider: Object.freeze([...payload]) })),
        },
        jobs: {
          setJobs: (payload) => set((state) => ({ jobs: { ...state.jobs, jobs: Object.freeze(payload) } })),
          setProcessingTimes: (payload) =>
            set((state) => ({ jobs: { ...state.jobs, processingTimes: Object.freeze(payload) } })),
          setJobInsights: (payload, jobId) =>
            set((state) => ({
              jobs: {
                ...state.jobs,
                insights: { ...state.jobs.insights, [jobId]: Object.freeze(payload) },
              },
            })),
        },
        user: {
          setUsers: (payload) => set((state) => ({ user: { ...state.user, users: payload } })),
          setCurrentUser: (payload) =>
            set((state) => ({ user: { ...state.user, currentUser: Object.freeze(payload) } })),
        },
      };

      // Async actions
      const effects = {
        notificationAdapter: {
          async getAdapter() {
            try {
              const response = await xhrGet('/api/jobs/notificationAdapter');
              reducers.notificationAdapter.setAdapter(response.json);
            } catch (Exception) {
              console.error(`Error while trying to get resource for api/jobs/notificationAdapter. Error:`, Exception);
            }
          },
        },
        generalSettings: {
          async getGeneralSettings() {
            try {
              const response = await xhrGet('/api/admin/generalSettings');
              reducers.generalSettings.setGeneralSettings(response.json);
            } catch (Exception) {
              console.error('Error while trying to get resource for api/admin/generalSettings. Error:', Exception);
            }
          },
        },
        provider: {
          async getProvider() {
            try {
              const response = await xhrGet('/api/jobs/provider');
              reducers.provider.setProvider(response.json);
            } catch (Exception) {
              console.error(`Error while trying to get resource for api/jobs/provider. Error:`, Exception);
            }
          },
        },
        jobs: {
          async getJobs() {
            try {
              const response = await xhrGet('/api/jobs');
              reducers.jobs.setJobs(response.json);
            } catch (Exception) {
              console.error(`Error while trying to get resource for api/jobs. Error:`, Exception);
            }
          },
          async getProcessingTimes() {
            try {
              const response = await xhrGet('/api/jobs/processingTimes');
              reducers.jobs.setProcessingTimes(response.json);
            } catch (Exception) {
              console.error(`Error while trying to get resource for api/processingTimes. Error:`, Exception);
            }
          },
          async getInsightDataForJob(jobId) {
            try {
              const response = await xhrGet(`/api/jobs/insights/${jobId}`);
              reducers.jobs.setJobInsights(response.json, jobId);
            } catch (Exception) {
              console.error(`Error while trying to get resource for api/jobs/insights. Error:`, Exception);
            }
          },
        },
        user: {
          async getUsers() {
            try {
              const response = await xhrGet('/api/admin/users');
              reducers.user.setUsers(response.json);
            } catch (Exception) {
              console.error('Error while trying to get resource for api/admin/users. Error:', Exception);
            }
          },
          async getCurrentUser() {
            try {
              const response = await xhrGet('/api/login/user');
              reducers.user.setCurrentUser(response.json);
            } catch (Exception) {
              console.error('Error while trying to get resource for api/login/user. Error:', Exception);
            }
          },
        },
        demoMode: {
          async getDemoMode() {
            try {
              const response = await xhrGet('/api/demo');
              reducers.demoMode.setDemoMode(response.json);
            } catch (Exception) {
              console.error('Error while trying to get resource for api/demo. Error:', Exception);
            }
          },
        },
      };

      // Initial state
      const initial = {
        notificationAdapter: [],
        generalSettings: { settings: {} },
        demoMode: { demoMode: false },
        provider: [],
        jobs: { jobs: [], insights: {}, processingTimes: {} },
        user: { users: [], currentUser: null },
      };

      // Expose actions by grouping them per slice
      const actions = {
        notificationAdapter: { ...effects.notificationAdapter },
        generalSettings: { ...effects.generalSettings },
        demoMode: { ...effects.demoMode },
        provider: { ...effects.provider },
        jobs: { ...effects.jobs },
        user: { ...effects.user },
      };

      return {
        ...initial,
        __actions: { actions },
      };
    },
    { name: 'fredy' },
  ),
);

/**
 * Selector hook, drop-in replacement for react-redux useSelector.
 * Pass a selector function and optional equality function. Defaults to shallow comparison.
 * @template T
 * @param {(state: FredyState) => T} selector
 * @param {(a: T, b: T) => boolean} [equalityFn]
 * @returns {T}
 */
export function useSelector(selector, equalityFn = shallow) {
  return useFredyState(selector, equalityFn);
}

/**
 * Actions hook returning grouped async actions per slice.
 * Example: const { jobs } = useActions(); await jobs.getJobs();
 * @returns {{notificationAdapter: any, generalSettings: any, demoMode: any, provider: any, jobs: any, user: any}}
 */
export function useActions() {
  return useFredyState((s) => s.__actions.actions);
}
