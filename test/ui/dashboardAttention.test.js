/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  ATTENTION_REASONS,
  ATTENTION_LIMIT,
  findJobsNeedingAttention,
  allJobsNeedingAttention,
  countJobsNeedingAttention,
} from '../../ui/src/services/dashboard/attention.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const english = JSON.parse(fs.readFileSync(path.join(here, '../../ui/src/locales/en.json'), 'utf-8'));

const LAST_RUN = { lastRun: 1_700_000_000_000 };

/** A job that is working exactly as intended. @returns {Object} */
const healthyJob = (overrides = {}) => ({
  id: 'job-1',
  name: 'Cologne 3-room',
  enabled: true,
  notificationAdapter: [{ configuredAdapterId: 'channel-1' }],
  numberOfFoundListings: 12,
  ...overrides,
});

describe('dashboard attention', () => {
  it('says nothing about jobs that are working', () => {
    expect(findJobsNeedingAttention([healthyJob()], LAST_RUN)).toEqual([]);
  });

  it('flags a job that notifies nobody', () => {
    const jobs = [healthyJob({ notificationAdapter: [] })];
    expect(findJobsNeedingAttention(jobs, LAST_RUN)).toEqual([
      { id: 'job-1', name: 'Cologne 3-room', reason: ATTENTION_REASONS.NO_CHANNEL },
    ]);
  });

  it('flags a job that has been switched off', () => {
    const jobs = [healthyJob({ enabled: false })];
    expect(findJobsNeedingAttention(jobs, LAST_RUN)[0].reason).toBe(ATTENTION_REASONS.PAUSED);
  });

  it('flags a running job that has never found anything', () => {
    const jobs = [healthyJob({ numberOfFoundListings: 0 })];
    expect(findJobsNeedingAttention(jobs, LAST_RUN)[0].reason).toBe(ATTENTION_REASONS.NOTHING_FOUND);
  });

  it('does not complain that a job found nothing before anything has run', () => {
    // A brand-new instance. Saying "found nothing yet" here is a complaint about the clock.
    const jobs = [healthyJob({ numberOfFoundListings: 0 })];
    expect(findJobsNeedingAttention(jobs, { lastRun: null })).toEqual([]);
    expect(findJobsNeedingAttention(jobs, { lastRun: 0 })).toEqual([]);
    expect(findJobsNeedingAttention(jobs)).toEqual([]);
  });

  it('gives one reason per job, the most severe', () => {
    // Paused *and* empty *and* channel-less. One line, not three.
    const jobs = [healthyJob({ enabled: false, numberOfFoundListings: 0, notificationAdapter: [] })];
    const found = findJobsNeedingAttention(jobs, LAST_RUN);
    expect(found).toHaveLength(1);
    expect(found[0].reason).toBe(ATTENTION_REASONS.NO_CHANNEL);
  });

  it('explains an empty paused job by the pause rather than by the emptiness', () => {
    const jobs = [healthyJob({ enabled: false, numberOfFoundListings: 0 })];
    expect(findJobsNeedingAttention(jobs, LAST_RUN)[0].reason).toBe(ATTENTION_REASONS.PAUSED);
  });

  it('puts the worst first', () => {
    const jobs = [
      healthyJob({ id: 'a', numberOfFoundListings: 0 }),
      healthyJob({ id: 'b', enabled: false }),
      healthyJob({ id: 'c', notificationAdapter: [] }),
    ];
    expect(allJobsNeedingAttention(jobs, LAST_RUN).map((entry) => entry.id)).toEqual(['c', 'b', 'a']);
  });

  it('names only a handful, but counts them all', () => {
    const jobs = Array.from({ length: ATTENTION_LIMIT + 3 }, (_, index) =>
      healthyJob({ id: `job-${index}`, enabled: false }),
    );
    expect(findJobsNeedingAttention(jobs, LAST_RUN)).toHaveLength(ATTENTION_LIMIT);
    expect(countJobsNeedingAttention(jobs, LAST_RUN)).toBe(ATTENTION_LIMIT + 3);
  });

  it('skips a job with no id rather than rendering a row that goes nowhere', () => {
    expect(findJobsNeedingAttention([{ name: 'orphan', enabled: false }], LAST_RUN)).toEqual([]);
  });

  it.each([[null], [undefined], ['nope'], [{}]])('survives being handed %s', (jobs) => {
    expect(findJobsNeedingAttention(jobs, LAST_RUN)).toEqual([]);
    expect(countJobsNeedingAttention(jobs, LAST_RUN)).toBe(0);
  });

  it('translates every reason it can give', () => {
    for (const reason of Object.values(ATTENTION_REASONS)) {
      expect(Object.keys(english)).toContain(`dashboard.attention.${reason}`);
    }
  });
});
