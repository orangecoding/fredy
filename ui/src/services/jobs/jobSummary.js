/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * What a job's filters add up to, in a line.
 *
 * The five of them - price and size criteria, blacklist, drawn area, commute limits - are folded
 * into a collapsed section, and a collapsed section has to answer "is there anything in here"
 * without being opened. Otherwise the fold does not save the user anything: they open it every
 * time to check.
 *
 * Sharing and activation used to be counted here too, back when they sat inside the same fold.
 * They are sections of their own now, in plain sight below it, so a line describing what is behind
 * the fold no longer has anything to say about them.
 */

import { countCommuteLimits } from './commuteFilter.js';

/**
 * Describe the refinements a job carries.
 *
 * @param {Object} job
 * @param {string[]} [job.blacklist]
 * @param {{maxPrice?: number, minSize?: number, minRooms?: number}|null} [job.specFilter]
 * @param {Object|null} [job.spatialFilter]
 * @param {{action?: string, limits?: Record<string, number>}|null} [job.commuteFilter]
 * @param {Object} context
 * @param {(key: string, vars?: Object) => string} context.t
 * @param {(value: number) => string} context.formatPrice
 * @returns {string[]} Empty when nothing has been refined.
 */
export function describeJobRefinements(job, { t, formatPrice }) {
  const parts = [];
  const spec = job?.specFilter ?? {};

  // Ordered as the controls are: what it must cost and be, what to leave out, where, and how far
  // it may be from the addresses that matter.
  if (spec.maxPrice != null) {
    parts.push(t('jobs.mutation.summaryMaxPrice', { value: formatPrice(spec.maxPrice) }));
  }
  if (spec.minSize != null) {
    parts.push(t('jobs.mutation.summaryMinSize', { value: spec.minSize }));
  }
  if (spec.minRooms != null) {
    parts.push(t('jobs.mutation.summaryMinRooms', { value: spec.minRooms }));
  }
  if ((job?.blacklist?.length ?? 0) > 0) {
    parts.push(t('jobs.mutation.summaryBlacklist', { count: job.blacklist.length }));
  }
  if (job?.spatialFilter != null) {
    parts.push(t('jobs.mutation.summaryArea'));
  }
  // The shortest true thing about it. Naming every address and its limit would be longer than the
  // rest of the line put together, and the section is one click away for the detail.
  const commuteLimits = countCommuteLimits(job?.commuteFilter);
  if (commuteLimits > 0) {
    parts.push(t('jobs.mutation.summaryCommute', { count: commuteLimits }));
  }
  return parts;
}

/**
 * The same, as one line ready to sit in a section header.
 *
 * @param {Object} job
 * @param {Object} context See {@link describeJobRefinements}.
 * @returns {string}
 */
export function summariseJobRefinements(job, context) {
  const parts = describeJobRefinements(job, context);
  return parts.length === 0 ? context.t('jobs.mutation.refineEmpty') : parts.join(' · ');
}
