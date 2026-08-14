/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * What the jobs page is filtered by, and how to say it out loud.
 *
 * The same shape as the listings page's filters, deliberately: the two pages sit next to each other
 * in the sidebar, and having one hide its filters behind a button while the other spreads them
 * across the top means learning the same idea twice.
 *
 * There is only one filter here today. It still goes through the same functions, because the value
 * of the pattern is that it holds when a second one is added.
 */

/**
 * The value of each filter that means "do not filter by this".
 * @type {Record<string, unknown>}
 */
export const NEUTRAL = {
  active: null,
};

/** The filters, in the order they are shown. @type {string[]} */
export const FILTER_KEYS = ['active'];

/**
 * Whether a filter is doing something.
 *
 * @param {string} key
 * @param {Object} values
 * @returns {boolean}
 */
export function isActiveFilter(key, values) {
  return values[key] !== NEUTRAL[key];
}

/**
 * How many filters are on.
 *
 * @param {Object} values
 * @returns {number}
 */
export function countActiveFilters(values) {
  return FILTER_KEYS.filter((key) => isActiveFilter(key, values)).length;
}

/**
 * The URL patch for switching one filter off.
 *
 * @param {string} key
 * @returns {Object}
 */
export function clearFilter(key) {
  return { [key]: NEUTRAL[key], page: 1 };
}

/**
 * The patch for switching every filter off. Leaves the search box and the sort alone: those are not
 * filters, and clearing them is not what the button says.
 *
 * @returns {Object}
 */
export function clearAllFilters() {
  return { ...NEUTRAL, page: 1 };
}

/**
 * A named list of the filters currently on, ready to render as chips.
 *
 * @param {Object} values
 * @param {Object} context
 * @param {(key: string, vars?: Object) => string} context.t
 * @returns {{key: string, label: string}[]}
 */
export function describeActiveFilters(values, { t }) {
  const labels = {
    active: () => (values.active === true ? t('jobs.filterActive') : t('jobs.filterInactive')),
  };

  return FILTER_KEYS.filter((key) => isActiveFilter(key, values)).map((key) => ({
    key,
    label: labels[key](),
  }));
}
