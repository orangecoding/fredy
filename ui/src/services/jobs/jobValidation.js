/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * What a job needs before it can be saved.
 *
 * A list of named rules rather than one boolean expression: each rule stands on its own, is tested
 * on its own, and reads in the order the sections appear in the form. The form itself only asks
 * whether the list is empty - the Save button is disabled until it is, and says nothing about why.
 */

/**
 * @typedef {Object} JobRequirement
 * @property {string} key Stable identifier, used in tests.
 * @property {(job: Object) => boolean} isMet
 */

/**
 * Everything a job must have, in the order the sections appear in the form.
 *
 * @type {JobRequirement[]}
 */
export const JOB_REQUIREMENTS = [
  {
    key: 'name',
    // Trimmed: a name of three spaces used to satisfy this and be saved as a job with no visible
    // name at all.
    isMet: (job) => typeof job?.name === 'string' && job.name.trim().length > 0,
  },
  {
    key: 'dealType',
    isMet: (job) => job?.dealType === 'rent' || job?.dealType === 'buy',
  },
  {
    key: 'provider',
    isMet: (job) => (job?.providerData?.length ?? 0) > 0,
  },
  {
    key: 'channel',
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
