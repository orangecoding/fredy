/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Zustand store for Fredy ui state.
 */
import { create } from 'zustand';
import { shallow } from 'zustand/shallow';
import { xhrGet, xhrPost } from '../xhr.js';
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

/**
 * Middleware to track loading state of async actions.
 */
const loadingTracker = (config) => (set, get, api) => {
  const wrappedSet = (partial, replace) => {
    set(partial, replace);
  };

  return config(wrappedSet, get, api);
};

// Create the Zustand store with slices and actions
export const useFredyState = create(
  logger(
    loadingTracker((set) => {
      // Async actions that directly set state (no separate reducer concept)
      const effects = {
        dashboard: {
          async getDashboard() {
            try {
              const response = await xhrGet('/api/dashboard');
              set((state) => ({ dashboard: { ...state.dashboard, data: response.json } }));
            } catch (Exception) {
              console.error('Error while trying to get resource for /api/dashboard. Error:', Exception);
            }
          },
        },
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
        jobsData: {
          async getJobs() {
            try {
              const response = await xhrGet('/api/jobs');
              set((state) => ({ jobsData: { ...state.jobsData, jobs: Object.freeze(response.json) } }));
            } catch (Exception) {
              console.error(`Error while trying to get resource for api/jobs. Error:`, Exception);
            }
          },
          async getJobsData({
            page = 1,
            pageSize = 20,
            freeTextFilter = null,
            sortfield = null,
            sortdir = 'asc',
            filter,
          } = {}) {
            try {
              const qryString = queryString.stringify({
                page,
                pageSize,
                freeTextFilter,
                sortfield,
                sortdir,
                ...filter,
              });
              const response = await xhrGet(`/api/jobs/data?${qryString}`);
              set((state) => ({
                jobsData: { ...state.jobsData, ...response.json },
              }));
            } catch (Exception) {
              console.error('Error while trying to get resource for api/jobs/data. Error:', Exception);
            }
          },
          async getSharableUserList() {
            try {
              const response = await xhrGet('/api/jobs/shareableUserList');
              set((state) => ({ jobsData: { ...state.jobsData, shareableUserList: Object.freeze(response.json) } }));
            } catch (Exception) {
              console.error(`Error while trying to get resource for api/jobs. Error:`, Exception);
            }
          },
          setJobRunning(jobId, running) {
            if (!jobId) return;
            set((state) => {
              const list = state.jobsData.jobs || [];
              const updated = list.map((j) => (j.id === jobId ? { ...j, running: !!running } : j));
              const result = (state.jobsData.result || []).map((j) =>
                j.id === jobId ? { ...j, running: !!running } : j,
              );
              return { jobsData: { ...state.jobsData, jobs: Object.freeze(updated), result: Object.freeze(result) } };
            });
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
        tracking: {
          async getTrackingPois() {
            try {
              const response = await xhrGet('/api/tracking/trackingPois');
              set((state) => ({ tracking: { ...state.tracking, pois: Object.freeze(response.json) } }));
            } catch (Exception) {
              console.error('Error while trying to get resource for api/tracking. Error:', Exception);
            }
          },
          async trackPoi(poi) {
            try {
              await xhrPost('/api/tracking/poi', { poi });
            } catch (Exception) {
              console.error('Error while trying to track poi. Error:', Exception);
            }
          },
        },
        listingsData: {
          async getListingsData({
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
                listingsData: { ...state.listingsData, ...response.json },
              }));
            } catch (Exception) {
              console.error('Error while trying to get resource for api/listings. Error:', Exception);
            }
          },
          async getListing(listingId) {
            try {
              const response = await xhrGet(`/api/listings/${listingId}`);
              set((state) => ({
                listingsData: { ...state.listingsData, currentListing: response.json },
              }));
              return response.json;
            } catch (Exception) {
              console.error(`Error while trying to get resource for api/listings/${listingId}. Error:`, Exception);
              throw Exception;
            }
          },
          async getListingsForMap({ jobId, minPrice, maxPrice } = {}) {
            try {
              const qryString = queryString.stringify(
                {
                  jobId,
                  minPrice,
                  maxPrice,
                },
                { skipNull: true, skipEmptyString: true },
              );
              const response = await xhrGet(`/api/listings/map?${qryString}`);
              set((state) => ({
                listingsData: {
                  ...state.listingsData,
                  mapListings: response.json?.listings || [],
                  maxPrice: response.json?.maxPrice || 0,
                },
              }));
            } catch (Exception) {
              console.error('Error while trying to get resource for api/listings/map. Error:', Exception);
            }
          },
        },
        userSettings: {
          async getUserSettings() {
            try {
              const response = await xhrGet('/api/user/settings');
              set((state) => ({ userSettings: { ...state.userSettings, settings: response.json, loaded: true } }));
            } catch (Exception) {
              console.error('Error while trying to get resource for api/user/settings. Error:', Exception);
              // Mark as loaded even on error to prevent blocking the UI
              set((state) => ({ userSettings: { ...state.userSettings, loaded: true } }));
            }
          },
          async setNewsHash(newsHash) {
            try {
              await xhrPost('/api/user/settings/news-hash', { news_hash: newsHash });
              set((state) => ({
                userSettings: {
                  ...state.userSettings,
                  settings: { ...state.userSettings.settings, news_hash: newsHash },
                },
              }));
            } catch (Exception) {
              console.error('Error while trying to update news hash. Error:', Exception);
              throw Exception;
            }
          },
          async setHomeAddress(address) {
            try {
              const response = await xhrPost('/api/user/settings/home-address', { home_address: address });
              if (response.status === 200) {
                set((state) => ({
                  userSettings: {
                    ...state.userSettings,
                    settings: {
                      ...state.userSettings.settings,
                      home_address: { address, coords: response.json.coords },
                    },
                  },
                }));
                return response.json;
              }
              throw response;
            } catch (Exception) {
              console.error('Error while trying to update home address. Error:', Exception);
              throw Exception;
            }
          },
        },
      };

      // Initial state
      const initial = {
        dashboard: { data: null },
        notificationAdapter: [],
        listingsData: {
          totalNumber: 0,
          page: 1,
          result: [],
          mapListings: [],
          currentListing: null,
          maxPrice: 0,
        },
        generalSettings: { settings: {} },
        userSettings: { settings: {}, loaded: false },
        demoMode: { demoMode: false },
        versionUpdate: {},
        tracking: { pois: {} },
        provider: [],
        jobsData: {
          jobs: [],
          shareableUserList: [],
          totalNumber: 0,
          page: 1,
          result: [],
        },
        user: { users: [], currentUser: null },
      };

      // Expose actions by grouping them per slice
      const actions = {
        dashboard: { ...effects.dashboard },
        notificationAdapter: { ...effects.notificationAdapter },
        generalSettings: { ...effects.generalSettings },
        demoMode: { ...effects.demoMode },
        versionUpdate: { ...effects.versionUpdate },
        tracking: { ...effects.tracking },
        listingsData: { ...effects.listingsData },
        provider: { ...effects.provider },
        jobsData: { ...effects.jobsData },
        user: { ...effects.user },
        userSettings: { ...effects.userSettings },
      };

      // Wrap actions to track loading state
      const wrappedActions = {};
      Object.keys(actions).forEach((slice) => {
        wrappedActions[slice] = {};
        Object.keys(actions[slice]).forEach((actionName) => {
          const originalAction = actions[slice][actionName];
          if (typeof originalAction === 'function') {
            wrappedActions[slice][actionName] = async (...args) => {
              const fullActionName = `${slice}.${actionName}`;
              set((state) => ({ loading: { ...state.loading, [fullActionName]: true } }));
              try {
                return await originalAction(...args);
              } finally {
                set((state) => ({ loading: { ...state.loading, [fullActionName]: false } }));
              }
            };
          } else {
            wrappedActions[slice][actionName] = originalAction;
          }
        });
      });

      return {
        ...initial,
        loading: {},
        __actions: { actions: wrappedActions },
      };
    }),
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

/**
 * Hook to check if a specific action is currently loading.
 * @param {Function} action - The action function from useActions()
 * @returns {boolean}
 */
export function useIsLoading(action) {
  const actions = useActions();
  const loading = useSelector((state) => state.loading);

  // Find the action name by comparing the function
  let actionPath = null;
  for (const slice in actions) {
    for (const name in actions[slice]) {
      if (actions[slice][name] === action) {
        actionPath = `${slice}.${name}`;
        break;
      }
    }
    if (actionPath) break;
  }

  return !!loading[actionPath];
}
