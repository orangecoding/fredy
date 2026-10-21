/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';

import { resolveJobFormSource } from '../../ui/src/services/jobs/jobFormSource.js';

const jobs = [
  { id: 'job-1', name: 'Berlin' },
  { id: 'job-2', name: 'Hamburg' },
];

describe('resolveJobFormSource', () => {
  it('edits the job the route names', () => {
    expect(resolveJobFormSource({ jobs, jobId: 'job-2' })).toEqual({
      mode: 'edit',
      job: jobs[1],
      draftId: 'job-2',
      missing: false,
    });
  });

  it('reports a job it does not know as missing rather than offering to create one', () => {
    // Created over MCP or in another tab after the list was loaded: falling back to "create" here
    // saved a duplicate of the job the user meant to edit.
    const source = resolveJobFormSource({ jobs, jobId: 'job-3' });
    expect(source.missing).toBe(true);
    expect(source.mode).toBe('edit');
    expect(source.job).toBeNull();
  });

  it('clones under a draft key of its own', () => {
    expect(resolveJobFormSource({ jobs, cloneFrom: 'job-1' })).toEqual({
      mode: 'clone',
      job: jobs[0],
      draftId: 'clone:job-1',
      missing: false,
    });
  });

  it('reports a clone of a job it does not know as missing', () => {
    expect(resolveJobFormSource({ jobs, cloneFrom: 'job-3' }).missing).toBe(true);
  });

  it('starts a new job when it is asked for none', () => {
    expect(resolveJobFormSource({ jobs, jobId: null, cloneFrom: null })).toEqual({
      mode: 'new',
      job: null,
      draftId: null,
      missing: false,
    });
  });
});
