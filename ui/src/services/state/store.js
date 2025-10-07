/**
 * Zustand store for Fredy ui state.
 */
import { create } from 'zustand';
import { shallow } from 'zustand/shallow';
import { xhrGet } from '../xhr.js';
import queryString from 'query-string';

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
      // Async actions that directly set state (no separate reducer concept)
      const effects = {
        notificationAdapter: {
          async getAdapter() {
            try {
              const response = await xhrGet('/api/jobs/notificationAdapter');
              set(() => ({ notificationAdapter: Object.freeze([...response.json]) }));
            } catch (Exception) {
              console.error(`Error while trying to get resource for api/jobs/notificationAdapter. Error:`, Exception);
            }
          },
        },
        generalSettings: {
          async getGeneralSettings() {
            try {
              const response = await xhrGet('/api/admin/generalSettings');
              set((state) => ({ generalSettings: { ...state.generalSettings, settings: response.json } }));
            } catch (Exception) {
              console.error('Error while trying to get resource for api/admin/generalSettings. Error:', Exception);
            }
          },
        },
        provider: {
          async getProvider() {
            try {
              const response = await xhrGet('/api/jobs/provider');
              set(() => ({ provider: Object.freeze([...response.json]) }));
            } catch (Exception) {
              console.error(`Error while trying to get resource for api/jobs/provider. Error:`, Exception);
            }
          },
        },
        jobs: {
          async getJobs() {
            try {
              const response = await xhrGet('/api/jobs');
              set((state) => ({ jobs: { ...state.jobs, jobs: Object.freeze(response.json) } }));
            } catch (Exception) {
              console.error(`Error while trying to get resource for api/jobs. Error:`, Exception);
            }
          },
          async getSharableUserList() {
            try {
              const response = await xhrGet('/api/jobs/shareableUserList');
              set((state) => ({ jobs: { ...state.jobs, shareableUserList: Object.freeze(response.json) } }));
            } catch (Exception) {
              console.error(`Error while trying to get resource for api/jobs. Error:`, Exception);
            }
          },
          async getProcessingTimes() {
            try {
              const response = await xhrGet('/api/jobs/processingTimes');
              set((state) => ({ jobs: { ...state.jobs, processingTimes: Object.freeze(response.json) } }));
            } catch (Exception) {
              console.error(`Error while trying to get resource for api/processingTimes. Error:`, Exception);
            }
          },
          async getInsightDataForJob(jobId) {
            try {
              const response = await xhrGet(`/api/jobs/insights/${jobId}`);
              set((state) => ({
                jobs: {
                  ...state.jobs,
                  insights: { ...state.jobs.insights, [jobId]: Object.freeze(response.json) },
                },
              }));
            } catch (Exception) {
              console.error(`Error while trying to get resource for api/jobs/insights. Error:`, Exception);
            }
          },
        },
        user: {
          async getUsers() {
            try {
              const response = await xhrGet('/api/admin/users');
              set((state) => ({ user: { ...state.user, users: response.json } }));
            } catch (Exception) {
              console.error('Error while trying to get resource for api/admin/users. Error:', Exception);
            }
          },
          async getCurrentUser() {
            try {
              const response = await xhrGet('/api/login/user');
              set((state) => ({ user: { ...state.user, currentUser: Object.freeze(response.json) } }));
            } catch (Exception) {
              console.error('Error while trying to get resource for api/login/user. Error:', Exception);
            }
          },
        },
        demoMode: {
          async getDemoMode() {
            try {
              const response = await xhrGet('/api/demo');
              set((state) => ({
                demoMode: { ...state.demoMode, demoMode: response.json.demoMode },
              }));
            } catch (Exception) {
              console.error('Error while trying to get resource for api/demo. Error:', Exception);
            }
          },
        },
        versionUpdate: {
          async getVersionUpdate() {
            try {
              const response = await xhrGet('/api/version');
              set((state) => ({
                versionUpdate: { ...state.versionUpdate, versionUpdate: response.json },
              }));
            } catch (Exception) {
              console.error('Error while trying to get resource for api/version. Error:', Exception);
            }
          },
        },
        listingsTable: {
          async getListingsTable({
            page = 1,
            pageSize = 20,
            freeTextFilter = null,
            sortfield = null,
            sortdir = 'asc',
            filter,
          }) {
            try {
              const qryString = queryString.stringify({
                page,
                pageSize,
                freeTextFilter,
                sortfield,
                sortdir,
                ...filter,
              });
              const response = await xhrGet(`/api/listings/table?${qryString}`);
              set((state) => ({
                listingsTable: { ...state.listingsTable, ...response.json },
              }));
            } catch (Exception) {
              console.error('Error while trying to get resource for api/listings. Error:', Exception);
            }
          },
        },
      };

      // Initial state
      const initial = {
        notificationAdapter: [],
        listingsTable: {
          totalNumber: 0,
          page: 1,
          result: [],
        },
        generalSettings: { settings: {} },
        demoMode: { demoMode: false },
        versionUpdate: {},
        provider: [],
        jobs: { jobs: [], insights: {}, processingTimes: {}, shareableUserList: [] },
        user: { users: [], currentUser: null },
      };

      // Expose actions by grouping them per slice
      const actions = {
        notificationAdapter: { ...effects.notificationAdapter },
        generalSettings: { ...effects.generalSettings },
        demoMode: { ...effects.demoMode },
        versionUpdate: { ...effects.versionUpdate },
        listingsTable: { ...effects.listingsTable },
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
