/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * @typedef {Object} JobFormSource
 * @property {'new'|'edit'|'clone'} mode What the form is doing.
 * @property {Object|null} job The job it starts from, null for a new one or one that is missing.
 * @property {string|null} draftId The key its draft is kept under (see `jobDraft.js`).
 * @property {boolean} missing Whether the form was asked for a job the list does not have.
 */

/**
 * Which job the job form starts from, and under which draft key.
 *
 * A job that is asked for but not found is `missing`, never a new job: the form used to fall back
 * to "create" for an id it did not know, and saving that sent `jobId: null`, which stored a
 * duplicate of the job the user meant to edit.
 *
 * A clone keeps its draft apart from a new job's: sharing the "new" key, cloning one job brought
 * back the half-typed new job, and an abandoned clone came back at the next "new job".
 *
 * @param {{jobs: Array<{id: string}>, jobId?: string|null, cloneFrom?: string|null}} params
 * @returns {JobFormSource}
 */
export function resolveJobFormSource({ jobs, jobId, cloneFrom }) {
  if (jobId != null) {
    const job = jobs.find((candidate) => candidate.id === jobId) ?? null;
    return { mode: 'edit', job, draftId: jobId, missing: job == null };
  }
  if (cloneFrom != null) {
    const job = jobs.find((candidate) => candidate.id === cloneFrom) ?? null;
    return { mode: 'clone', job, draftId: `clone:${cloneFrom}`, missing: job == null };
  }
  return { mode: 'new', job: null, draftId: null, missing: false };
}
