/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * What a job needs before it can be saved, and how to say what is still missing.
 *
 * The form used to compute this as one boolean and hang it on the Save button's `disabled`. A user
 * who had filled in everything but the deal type was left looking at a grey button with nothing
 * anywhere on the page explaining which of the eight sections was the problem - and the two most
 * commonly missing pieces, a provider and a channel, live in sections that look complete because
 * their "Add" button is right there.
 *
 * A list rather than a boolean, so the form can name the gaps.
 */

/**
 * @typedef {Object} JobRequirement
 * @property {string} key Stable identifier, used in tests and as a React key.
 * @property {string} labelKey Translation key naming what is missing.
 * @property {(job: Object) => boolean} isMet
 */

/**
 * Everything a job must have, in the order the sections appear in the form - so the list reads as
 * a route down the page rather than as an unordered set of complaints.
 *
 * @type {JobRequirement[]}
 */
export const JOB_REQUIREMENTS = [
  {
    key: 'name',
    labelKey: 'jobs.mutation.requirementName',
    // Trimmed: a name of three spaces used to satisfy this and be saved as a job with no visible
    // name at all.
    isMet: (job) => typeof job?.name === 'string' && job.name.trim().length > 0,
  },
  {
    key: 'dealType',
    labelKey: 'jobs.mutation.requirementDealType',
    isMet: (job) => job?.dealType === 'rent' || job?.dealType === 'buy',
  },
  {
    key: 'provider',
    labelKey: 'jobs.mutation.requirementProvider',
    isMet: (job) => (job?.providerData?.length ?? 0) > 0,
  },
  {
    key: 'channel',
    labelKey: 'jobs.mutation.requirementChannel',
    isMet: (job) => (job?.selectedChannels?.length ?? 0) > 0,
  },
];

/**
 * What is still missing from a job.
 *
 * @param {Object} job
 * @returns {JobRequirement[]} Empty when the job is ready to save.
 */
export function missingRequirements(job) {
  return JOB_REQUIREMENTS.filter((requirement) => !requirement.isMet(job));
}

/**
 * Whether a job can be saved.
 *
 * @param {Object} job
 * @returns {boolean}
 */
export function canSaveJob(job) {
  return missingRequirements(job).length === 0;
}
