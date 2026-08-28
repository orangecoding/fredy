/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Zustand store for Fredy ui state.
 */
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { xhrGet, xhrPost, xhrDelete } from '../xhr.js';
import queryString from 'query-string';

/**
 * Optional state-change logging, off unless VITE_DEBUG_STORE is set.
 *
 * It used to log the whole previous and next state on every single `set` in development. That
 * retains two full snapshots per action in the console - including every loaded listing page - and
 * makes the devtools sluggish exactly when the app has enough data to be worth debugging.
 */
const DEBUG_STORE = import.meta.env?.VITE_DEBUG_STORE === 'true';

const logger = (config) => (set, get, api) =>
  config(
    (partial, replace) => {
      if (!DEBUG_STORE) {
        return set(partial, replace);
      }
      const prev = get();
      set(partial, replace);
      const next = get();
      // Only the keys that actually changed, rather than two copies of everything.
      const changed = Object.keys(next).filter((key) => next[key] !== prev[key]);
      /* eslint-disable no-console */
      console.info('[zustand]', changed.join(', '), Object.fromEntries(changed.map((key) => [key, next[key]])));
      /* eslint-enable no-console */
    },
    get,
    api,
  );

/**
 * Re-read the derived profile view after the profile changed.
 *
 * Every finance surface reads the summary rather than deriving anything, so it has to be refreshed
 * whenever the profile behind it moves - otherwise the chips keep quoting the old ceilings.
 *
 * @param {(updater: Function) => void} set Zustand setter.
 * @returns {Promise<void>}
 */
async function refreshFinanceSummary(set) {
  try {
    const response = await xhrGet('/api/finance/profile-summary');
    set((state) => ({ finance: { ...state.finance, summary: response.json } }));
  } catch (Exception) {
    console.error('Error while refreshing the finance profile summary. Error:', Exception);
  }
}

/**
 * Save or clear one tab of the finance profile, letting the server merge it into what is stored.
 *
 * The response carries the merged profile, so the store mirrors what the server decided rather
 * than a second, locally computed guess at it.
 *
 * @param {(updater: Function) => void} set Zustand setter.
 * @param {{section: 'rent'|'buy', profile?: Object, remove?: boolean}} payload
 * @returns {Promise<Object>} The profile that is now stored.
 */
async function persistFinanceSection(set, payload) {
  try {
    const response = await xhrPost('/api/user/settings/finance-profile/section', payload);
    const stored = response.json.finance_profile;
    set((state) => ({
      userSettings: {
        ...state.userSettings,
        settings: { ...state.userSettings.settings, finance_profile: stored },
      },
    }));
    await refreshFinanceSummary(set);
    return stored;
  } catch (Exception) {
    console.error('Error while trying to persist a finance profile section. Error:', Exception);
    throw Exception;
  }
}

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
        finance: {
          /**
           * Load the derived view of the stored finance profile.
           *
           * All of it is computed server-side; the browser holds no finance math of its own.
           * Called on boot and after every profile write.
           */
          async getProfileSummary() {
            try {
              const response = await xhrGet('/api/finance/profile-summary');
              set((state) => ({ finance: { ...state.finance, summary: response.json } }));
              return response.json;
            } catch (Exception) {
              console.error('Error while trying to load the finance profile summary. Error:', Exception);
              return null;
            }
          },
          /**
           * Run the calculator against a draft profile the user is still editing.
           *
           * Returns the full breakdown plus the budget, ceilings and completeness flags for that
           * draft, so the calculator's panels need one request rather than four.
           *
           * @param {Object} profile
           * @returns {Promise<Object|null>} Null when the draft is not calculable yet.
           */
          async calculate(profile) {
            try {
              const response = await xhrPost('/api/finance/calculate', { profile });
              return response.json;
            } catch (Exception) {
              // A 400 here is the normal "not enough entered yet" case, not a failure worth
              // shouting about; the calculator simply shows nothing.
              if (Exception?.status !== 400) {
                console.error('Error while trying to calculate financing. Error:', Exception);
              }
              return null;
            }
          },
          /**
           * The financing breakdown for one listing, measured against the stored profile.
           *
           * @param {string} listingId
           * @returns {Promise<Object|null>}
           */
          async getListingFinance(listingId) {
            try {
              const response = await xhrGet(`/api/finance/listing/${listingId}`);
              return response.json;
            } catch (Exception) {
              console.error(`Error while trying to load the financing of listing ${listingId}. Error:`, Exception);
              return null;
            }
          },
          async getAffordability(payload) {
            set((state) => ({ finance: { ...state.finance, loading: true } }));
            try {
              const response = await xhrPost('/api/finance/affordability', payload);
              set((state) => ({ finance: { ...state.finance, data: response.json, loading: false } }));
              return response.json;
            } catch (Exception) {
              console.error('Error while trying to score listings for affordability. Error:', Exception);
              set((state) => ({ finance: { ...state.finance, loading: false } }));
              throw Exception;
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
          /**
           * Test-fire a draft that has not been saved yet.
           *
           * The saved-channel equivalent is `notificationChannels.tryChannel`, which fires with the
           * values already in the database. A draft has no id, so its values have to travel with
           * the request - which is also why this one cannot be used for an existing channel whose
           * secrets the client never received.
           */
          async tryDraft(adapterId, fields) {
            await xhrPost('/api/jobs/notificationAdapter/try', { id: adapterId, fields });
          },
        },
        notificationChannels: {
          async getChannels() {
            try {
              const response = await xhrGet('/api/notificationChannels');
              set(() => ({ notificationChannels: { channels: [...response.json], loaded: true } }));
            } catch (Exception) {
              console.error('Error while trying to get resource for api/notificationChannels. Error:', Exception);
            }
          },
          /**
           * Load one channel including its field values.
           *
           * Deliberately not written into the slice: this is editor state, and a bag of credentials
           * sitting in a global store is a leak waiting for the next `console.log(state)`. The
           * server only reveals the secret values to someone who may edit the channel.
           */
          async loadChannel(channelId) {
            const response = await xhrGet(`/api/notificationChannels/${channelId}`);
            return response.json;
          },
          async saveChannel(payload) {
            const response = await xhrPost('/api/notificationChannels', payload);
            await effects.notificationChannels.getChannels();
            return response.json;
          },
          async removeChannel(channelId) {
            await xhrDelete(`/api/notificationChannels/${channelId}`);
            await effects.notificationChannels.getChannels();
          },
          async tryChannel(channelId) {
            await xhrPost(`/api/notificationChannels/${channelId}/try`, {});
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
          /**
           * Loads the logged-in user and returns it, so a caller that needs to act on the
           * answer immediately does not have to wait for the store update to reach its props.
           *
           * @returns {Promise<Object|null>}
           */
          async getCurrentUser() {
            try {
              const response = await xhrGet('/api/login/user');
              const currentUser = Object.freeze(response.json);
              set((state) => ({ user: { ...state.user, currentUser } }));
              return currentUser;
            } catch (Exception) {
              console.error('Error while trying to get resource for api/login/user. Error:', Exception);
              return null;
            }
          },
          /**
           * Drops the cached current user so the app falls back to the login screen. Triggered when a
           * request returns 401 (expired session) so the UI recovers instead of staying stuck.
           */
          async resetCurrentUser() {
            set((state) => ({ user: { ...state.user, currentUser: {} } }));
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
              const qryString = queryString.stringify(
                {
                  page,
                  pageSize,
                  freeTextFilter,
                  sortfield,
                  sortdir,
                  ...filter,
                },
                { skipNull: true, skipEmptyString: true },
              );
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
          async setListingStatus(listingId, status) {
            try {
              await xhrPost(`/api/listings/${listingId}/status`, { status });
            } catch (Exception) {
              console.error(`Error while trying to set status for listing ${listingId}. Error:`, Exception);
              throw Exception;
            }
          },
          async setListingNotes(listingId, notes) {
            try {
              await xhrPost(`/api/listings/${listingId}/notes`, { notes });
            } catch (Exception) {
              console.error(`Error while trying to set notes for listing ${listingId}. Error:`, Exception);
              throw Exception;
            }
          },
          /**
           * Replace a listing's address and position with one the user picked.
           *
           * The route answers with the stored row, but the detail view is re-read through
           * `getListing` anyway: only that endpoint adds the affordability verdict, and a listing
           * in the store without it would drop the chip until the next navigation.
           *
           * @param {string} listingId
           * @param {{address: string, latitude: number, longitude: number}} position
           */
          async setListingAddress(listingId, { address, latitude, longitude }) {
            try {
              await xhrPost(`/api/listings/${listingId}/address`, { address, latitude, longitude });
            } catch (Exception) {
              console.error(`Error while trying to set address for listing ${listingId}. Error:`, Exception);
              throw Exception;
            }
          },
          async restoreListings(ids) {
            try {
              await xhrPost('/api/listings/restore', { ids });
            } catch (Exception) {
              console.error('Error while trying to restore listings. Error:', Exception);
              throw Exception;
            }
          },
          /**
           * Mark listings the alive-checker wrongly gave up on as available again.
           *
           * Distinct from `restoreListings`, which undoes a deletion the user made themselves.
           *
           * @param {string[]} ids
           */
          async reactivateListings(ids) {
            try {
              await xhrPost('/api/listings/reactivate', { ids });
            } catch (Exception) {
              console.error('Error while trying to reactivate listings. Error:', Exception);
              throw Exception;
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
          /**
           * Remember the newest release this user has been shown the news for.
           *
           * @param {string} version
           * @returns {Promise<void>}
           */
          async setNewsLastSeenVersion(version) {
            try {
              await xhrPost('/api/user/settings/news-last-seen-version', { news_last_seen_version: version });
              set((state) => ({
                userSettings: {
                  ...state.userSettings,
                  settings: { ...state.userSettings.settings, news_last_seen_version: version },
                },
              }));
            } catch (Exception) {
              console.error('Error while trying to update the last seen news version. Error:', Exception);
              throw Exception;
            }
          },
          async setHomeAddresses(addresses) {
            try {
              const response = await xhrPost('/api/user/settings/home-address', { home_addresses: addresses });
              if (response.status === 200) {
                set((state) => ({
                  userSettings: {
                    ...state.userSettings,
                    settings: {
                      ...state.userSettings.settings,
                      home_addresses: response.json.home_addresses,
                    },
                  },
                }));
                return response.json;
              }
              throw response;
            } catch (Exception) {
              console.error('Error while trying to update addresses. Error:', Exception);
              throw Exception;
            }
          },
          /**
           * Persist one tab (renting or buying) of the finance profile, leaving the other tab as
           * it is already stored.
           *
           * The merge happens server-side against what is actually stored. Doing it here meant a
           * second copy of the merge rules in the browser, and a lost update whenever two tabs
           * saved from stale state.
           *
           * @param {{section: 'rent'|'buy', profile: Object}} params
           * @returns {Promise<Object>} The profile that is now stored.
           */
          async saveFinanceSection({ section, profile }) {
            return persistFinanceSection(set, { section, profile });
          },
          /**
           * Remove one tab (renting or buying) from the stored finance profile, keeping the
           * household and the other tab.
           *
           * @param {'rent'|'buy'} section
           * @returns {Promise<Object>} The profile that is now stored.
           */
          async deleteFinanceSection(section) {
            return persistFinanceSection(set, { section, remove: true });
          },
          async setProviderDetails(providers) {
            try {
              await xhrPost('/api/user/settings/provider-details', { provider_details: providers });
              set((state) => ({
                userSettings: {
                  ...state.userSettings,
                  settings: { ...state.userSettings.settings, provider_details: providers },
                },
              }));
            } catch (Exception) {
              console.error('Error while trying to update provider details setting. Error:', Exception);
              throw Exception;
            }
          },
          /**
           * Whether hovering a transport stop on the map opens its departure board.
           *
           * @param {boolean} enabled
           * @returns {Promise<void>}
           */
          async setTransitHoverPopups(enabled) {
            try {
              await xhrPost('/api/user/settings/transit-hover-popups', { transit_hover_popups: enabled });
              set((state) => ({
                userSettings: {
                  ...state.userSettings,
                  settings: { ...state.userSettings.settings, transit_hover_popups: enabled },
                },
              }));
            } catch (Exception) {
              console.error('Error while trying to update the transit hover popups setting. Error:', Exception);
              throw Exception;
            }
          },
          async setBlacklistFilterOnProviderDetails(enabled) {
            try {
              await xhrPost('/api/user/settings/blacklist-filter-on-details', {
                blacklist_filter_on_provider_details: enabled,
              });
              set((state) => ({
                userSettings: {
                  ...state.userSettings,
                  settings: {
                    ...state.userSettings.settings,
                    blacklist_filter_on_provider_details: enabled,
                  },
                },
              }));
            } catch (Exception) {
              console.error(
                'Error while trying to update blacklist-filter-on-provider-details setting. Error:',
                Exception,
              );
              throw Exception;
            }
          },
          async setListingsViewMode(listings_view_mode) {
            try {
              await xhrPost('/api/user/settings/listings-view-mode', { listings_view_mode });
              set((state) => ({
                userSettings: {
                  ...state.userSettings,
                  settings: { ...state.userSettings.settings, listings_view_mode },
                },
              }));
            } catch (Exception) {
              console.error('Error while trying to update listings view mode setting. Error:', Exception);
              throw Exception;
            }
          },
          async setJobsViewMode(jobs_view_mode) {
            try {
              await xhrPost('/api/user/settings/jobs-view-mode', { jobs_view_mode });
              set((state) => ({
                userSettings: {
                  ...state.userSettings,
                  settings: { ...state.userSettings.settings, jobs_view_mode },
                },
              }));
            } catch (Exception) {
              console.error('Error while trying to update jobs view mode setting. Error:', Exception);
              throw Exception;
            }
          },
          async setListingDeletionPreference(listing_deletion_preference) {
            try {
              await xhrPost('/api/user/settings/listing-deletion-preference', { listing_deletion_preference });
              set((state) => ({
                userSettings: {
                  ...state.userSettings,
                  settings: { ...state.userSettings.settings, listing_deletion_preference },
                },
              }));
            } catch (Exception) {
              console.error('Error while trying to update listing deletion preference. Error:', Exception);
              throw Exception;
            }
          },
          async setLanguage(language) {
            try {
              await xhrPost('/api/user/settings/language', { language });
              set((state) => ({
                userSettings: {
                  ...state.userSettings,
                  settings: { ...state.userSettings.settings, language },
                },
              }));
            } catch (Exception) {
              console.error('Error while trying to update language setting. Error:', Exception);
              throw Exception;
            }
          },
          /**
           * Store which theme this user wants the interface painted in.
           *
           * The document is repainted by App.jsx reacting to this slice rather than from here, so
           * that a theme arriving from the server on login takes the same path as one picked in
           * the settings form.
           *
           * @param {'dark'|'light'} theme
           * @returns {Promise<void>}
           */
          async setTheme(theme) {
            try {
              await xhrPost('/api/user/settings/theme', { theme });
              set((state) => ({
                userSettings: {
                  ...state.userSettings,
                  settings: { ...state.userSettings.settings, theme },
                },
              }));
            } catch (Exception) {
              console.error('Error while trying to update theme setting. Error:', Exception);
              throw Exception;
            }
          },
        },
      };

      // Initial state
      const initial = {
        dashboard: { data: null },
        finance: { data: null, loading: false, summary: null },
        notificationAdapter: [],
        notificationChannels: { channels: [], loaded: false },
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
        finance: { ...effects.finance },
        notificationAdapter: { ...effects.notificationAdapter },
        notificationChannels: { ...effects.notificationChannels },
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

      // Wrap actions to track loading state.
      //
      // The wrapper tags itself with the action's path, so useIsLoading() can look the flag up
      // directly instead of scanning every slice and every action on every render to reverse-map
      // a function back to its name.
      const wrappedActions = {};
      Object.keys(actions).forEach((slice) => {
        wrappedActions[slice] = {};
        Object.keys(actions[slice]).forEach((actionName) => {
          const originalAction = actions[slice][actionName];
          if (typeof originalAction === 'function') {
            const fullActionName = `${slice}.${actionName}`;
            const wrapped = async (...args) => {
              set((state) => ({ loading: { ...state.loading, [fullActionName]: true } }));
              try {
                return await originalAction(...args);
              } finally {
                set((state) => ({ loading: { ...state.loading, [fullActionName]: false } }));
              }
            };
            wrapped.actionPath = fullActionName;
            wrappedActions[slice][actionName] = wrapped;
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
 * Selector hook.
 *
 * Wraps the selector in zustand's `useShallow`, so a selector returning a fresh object or array
 * re-renders only when its contents change. zustand v5 removed the second `equalityFn` argument
 * this used to pass; it was accepted and silently ignored, which meant every call site here had
 * reference equality while looking like it had shallow equality.
 *
 * @template T
 * @param {(state: FredyState) => T} selector
 * @returns {T}
 */
export function useSelector(selector) {
  return useFredyState(useShallow(selector));
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
 * Whether a specific action is currently running.
 *
 * Subscribes to that one flag rather than to the whole `loading` object, so an unrelated request
 * finishing no longer re-renders every component that asks about loading state. The action's path
 * is read off the wrapper the store attached to it, instead of being recovered by scanning every
 * slice on every render.
 *
 * @param {Function} action - The action function from useActions()
 * @returns {boolean}
 */
export function useIsLoading(action) {
  const actionPath = action?.actionPath ?? null;
  return useFredyState((state) => (actionPath == null ? false : state.loading[actionPath] === true));
}
