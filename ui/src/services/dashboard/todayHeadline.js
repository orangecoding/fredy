/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The dashboard's heading, which says what came in today rather than naming the page.
 *
 * The count is the last of the fourteen days the trend already carries, so it costs nothing extra
 * and can never disagree with the chart further down. Before the trend has arrived the heading is
 * the page's name.
 *
 * @param {{perDay?: Array<{count: number}>}|undefined|null} trend
 * @param {(key: string, params?: Object) => string} t
 * @returns {string}
 */
export function todayHeadline(trend, t) {
  const days = Array.isArray(trend?.perDay) ? trend.perDay : [];
  if (days.length === 0) {
    return t('dashboard.title');
  }
  const today = Number(days[days.length - 1]?.count) || 0;
  if (today === 0) {
    return t('dashboard.todayNone');
  }
  return today === 1 ? t('dashboard.todayOne') : t('dashboard.todayMany', { count: String(today) });
}
