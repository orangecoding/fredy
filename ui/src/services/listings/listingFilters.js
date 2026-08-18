/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { parseCommuteFilter } from '../../components/transit/travelTimeFormat.js';

/**
 * What the listings overview is filtered by, and how to say it out loud.
 *
 * The controls used to be eleven widgets in one wrapping row, all of them visible whether or not
 * they were doing anything. They live behind one button now, which only works if the page can still
 * answer "what am I actually looking at" - so the answer is computed here, as chips, and the button
 * carries the count.
 *
 * Kept apart from the component because it is the part worth asserting on: which values count as
 * filtering, what each one reads as, and that clearing one leaves the others alone.
 */

/**
 * The value of each filter that means "do not filter by this".
 *
 * Note that `active` is neutral at `null`, not at its URL default of `true`. The page opens showing
 * active listings only, which is a filter - a real one, hiding real rows - and pretending otherwise
 * would leave the user with no way to see that it is on.
 *
 * @type {Record<string, unknown>}
 */
export const NEUTRAL = {
  watch: null,
  job: null,
  active: null,
  provider: null,
  status: null,
  afford: null,
  commute: null,
  hidden: false,
};

/**
 * The filters, in the order they are shown.
 *
 * Written out rather than derived from `NEUTRAL`, because this is the reading order of the chip row
 * and the drawer - what the page is showing, then what has been done about it, then how well it
 * fits, then where it came from - and that should not be a side effect of how an object literal
 * happens to be typed.
 *
 * @type {string[]}
 */
export const FILTER_KEYS = ['hidden', 'active', 'watch', 'status', 'afford', 'commute', 'provider', 'job'];

/**
 * Whether a filter is doing something.
 *
 * @param {string} key
 * @param {Object} values The full URL state.
 * @returns {boolean}
 */
export function isActiveFilter(key, values) {
  // Activity and the hidden view are one control wearing two keys: while hidden listings are shown,
  // `active` is forced to null and must not be counted as a second filter.
  if (key === 'active' && values.hidden === true) {
    return false;
  }
  return values[key] !== NEUTRAL[key];
}

/**
 * How many filters are on.
 *
 * @param {Object} values The full URL state.
 * @returns {number}
 */
export function countActiveFilters(values) {
  return FILTER_KEYS.filter((key) => isActiveFilter(key, values)).length;
}

/**
 * Which option the four-way activity control is on.
 *
 * @param {Object} values
 * @returns {'all'|'true'|'false'|'hidden'}
 */
export function showValueOf(values) {
  if (values.hidden === true) {
    return 'hidden';
  }
  return values.active === null ? 'all' : String(values.active);
}

/**
 * The URL patch for picking one of those four options.
 *
 * Both keys always travel together. Writing one without the other is how the page ends up showing
 * hidden listings that are also filtered to active, which matches nothing.
 *
 * @param {'all'|'true'|'false'|'hidden'} value
 * @returns {Object}
 */
export function showPatch(value) {
  if (value === 'hidden') {
    return { hidden: true, active: null, page: 1 };
  }
  return { hidden: false, active: value === 'all' ? null : value === 'true', page: 1 };
}

/**
 * The URL patch for switching one filter off.
 *
 * @param {string} key
 * @returns {Object}
 */
export function clearFilter(key) {
  if (key === 'active' || key === 'hidden') {
    return showPatch('all');
  }
  return { [key]: NEUTRAL[key], page: 1 };
}

/**
 * The URL patch for switching every filter off. Leaves the search box, the sort and the page size
 * alone: those are not filters, and clearing them is not what the button says.
 *
 * @returns {Object}
 */
export function clearAllFilters() {
  return { ...NEUTRAL, page: 1 };
}

/**
 * A named list of the filters currently on, ready to render as chips.
 *
 * @param {Object} values The full URL state.
 * @param {Object} context
 * @param {(key: string, vars?: Object) => string} context.t
 * @param {{id: string, name: string}[]} [context.jobs]
 * @param {{id: string, name: string}[]} [context.providers]
 * @returns {{key: string, label: string}[]}
 */
export function describeActiveFilters(values, { t, jobs = [], providers = [] }) {
  const named = (list, id) => list.find((entry) => entry.id === id)?.name ?? id;

  const labels = {
    hidden: () => t('listings.filterHidden'),
    active: () => (values.active === true ? t('listings.filterActive') : t('listings.filterInactive')),
    watch: () => (values.watch === true ? t('listings.filterWatched') : t('listings.filterUnwatched')),
    status: () =>
      ({
        applied: t('listings.filterStatusApplied'),
        rejected: t('listings.filterStatusRejected'),
        accepted: t('listings.filterStatusAccepted'),
        none: t('listings.filterStatusNone'),
      })[values.status] ?? values.status,
    afford: () =>
      ({
        affordable: t('listings.filterAffordabilityYes'),
        stretch: t('listings.filterAffordabilityStretch'),
        unaffordable: t('listings.filterAffordabilityNo'),
      })[values.afford] ?? values.afford,
    commute: () => {
      const parsed = parseCommuteFilter(values.commute);
      return parsed == null
        ? values.commute
        : t('listings.filterCommuteOption', {
            mode: t(`travelTime.mode.${parsed.mode}`),
            minutes: parsed.maxMinutes,
          });
    },
    provider: () => named(providers, values.provider),
    job: () => named(jobs, values.job),
  };

  return FILTER_KEYS.filter((key) => isActiveFilter(key, values)).map((key) => ({
    key,
    label: labels[key](),
  }));
}
/**
 * Restricts the available providers to those for which results exist (or are configured
 * in the user's jobs), so the filter dropdown only contains relevant providers.
 *
 * If `availableProviders` (from listing search results) is provided and non-empty,
 * it narrows to providers present in those results. Otherwise, it falls back to
 * providers configured across the user's jobs (or the selected job).
 *
 * When no jobs are configured yet or no providers can be derived, all providers are
 * preserved as a fallback. A currently active provider filter is always preserved.
 *
 * @param {{id: string, name: string}[]} [providers]
 * @param {Array<{id: string, name?: string, provider?: Array<{id?: string, name?: string}>}>} [jobs]
 * @param {string|null} [selectedJobId]
 * @param {string|null} [currentProviderId]
 * @param {string[]|null} [availableProviders] Distinct provider IDs that have results
 * @returns {{id: string, name: string}[]}
 */
export function filterConfiguredProviders(
  providers = [],
  jobs = [],
  selectedJobId = null,
  currentProviderId = null,
  availableProviders = null,
) {
  if (!Array.isArray(providers) || providers.length === 0) {
    return [];
  }

  // 1. If concrete result providers from listings exist, prioritize them
  if (Array.isArray(availableProviders) && availableProviders.length > 0) {
    const resultProviderIds = new Set(availableProviders);
    return providers.filter(
      (provider) => resultProviderIds.has(provider.id) || (currentProviderId && provider.id === currentProviderId),
    );
  }

  // 2. Otherwise fall back to job configurations
  if (!Array.isArray(jobs) || jobs.length === 0) {
    return providers;
  }

  const relevantJobs = selectedJobId
    ? jobs.filter((j) => j?.id === selectedJobId || j?.name === selectedJobId)
    : jobs;

  const targetJobs = relevantJobs.length > 0 ? relevantJobs : jobs;

  const configuredProviderIds = new Set();
  for (const job of targetJobs) {
    if (Array.isArray(job?.provider)) {
      for (const p of job.provider) {
        const id = p?.id || p?.name;
        if (id) {
          configuredProviderIds.add(id);
        }
      }
    }
  }

  if (configuredProviderIds.size === 0) {
    return providers;
  }

  return providers.filter(
    (provider) => configuredProviderIds.has(provider.id) || (currentProviderId && provider.id === currentProviderId),
  );
}
