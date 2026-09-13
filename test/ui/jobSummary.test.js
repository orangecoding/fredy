/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { describeJobRefinements, summariseJobRefinements } from '../../ui/src/services/jobs/jobSummary.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const english = JSON.parse(fs.readFileSync(path.join(here, '../../ui/src/locales/en.json'), 'utf-8'));

/** A `t` that returns the key, so an assertion names the key rather than the English. */
const t = (key) => key;
const formatPrice = (value) => `EUR${value}`;
const context = { t, formatPrice };

describe('jobSummary', () => {
  it('says nothing about a job that has been refined in no way', () => {
    expect(describeJobRefinements({ enabled: true }, context)).toEqual([]);
    expect(describeJobRefinements({}, context)).toEqual([]);
    expect(describeJobRefinements(null, context)).toEqual([]);
  });

  it('offers a stand-in line so an empty section still reads as empty', () => {
    expect(summariseJobRefinements({ enabled: true }, context)).toBe('jobs.mutation.refineEmpty');
  });

  it.each([
    ['a price ceiling', { specFilter: { maxPrice: 1200 } }, 'jobs.mutation.summaryMaxPrice'],
    ['a size floor', { specFilter: { minSize: 60 } }, 'jobs.mutation.summaryMinSize'],
    ['a room count', { specFilter: { minRooms: 3 } }, 'jobs.mutation.summaryMinRooms'],
    ['blocked words', { blacklist: ['Tausch'] }, 'jobs.mutation.summaryBlacklist'],
    ['a drawn area', { spatialFilter: { type: 'Polygon' } }, 'jobs.mutation.summaryArea'],
  ])('mentions %s', (_what, job, expected) => {
    expect(describeJobRefinements(job, context)).toContain(expected);
  });

  // Both moved out of the fold and into sections of their own, so a line about what is behind the
  // fold must not claim them.
  it('says nothing about sharing or activation, which are not filters', () => {
    expect(describeJobRefinements({ shareWithUsers: ['user-1'], enabled: false }, context)).toEqual([]);
  });

  it('ignores a spec filter whose values were cleared back to null', () => {
    // The form writes null rather than deleting the key when a number input is emptied.
    expect(describeJobRefinements({ specFilter: { maxPrice: null, minSize: null, minRooms: null } }, context)).toEqual(
      [],
    );
  });

  it('keeps a zero, which is a real ceiling and not an absent one', () => {
    expect(describeJobRefinements({ specFilter: { minRooms: 0 } }, context)).toHaveLength(1);
  });

  it('lists everything at once, in the order the controls appear', () => {
    const job = {
      specFilter: { maxPrice: 1200, minSize: 60, minRooms: 3 },
      blacklist: ['Tausch', 'WG'],
      spatialFilter: { type: 'Polygon' },
      commuteFilter: { action: 'mark', limits: { 'home-1': 30 } },
    };
    expect(describeJobRefinements(job, context)).toEqual([
      'jobs.mutation.summaryMaxPrice',
      'jobs.mutation.summaryMinSize',
      'jobs.mutation.summaryMinRooms',
      'jobs.mutation.summaryBlacklist',
      'jobs.mutation.summaryArea',
      'jobs.mutation.summaryCommute',
    ]);
  });

  it('joins them into one readable line', () => {
    const job = { specFilter: { maxPrice: 1200 }, spatialFilter: {} };
    expect(summariseJobRefinements(job, context)).toBe('jobs.mutation.summaryMaxPrice · jobs.mutation.summaryArea');
  });

  it('formats the price through the caller rather than printing a raw number', () => {
    const seen = [];
    describeJobRefinements(
      { specFilter: { maxPrice: 1200 } },
      { t: (key, vars) => `${key}:${vars?.value}`, formatPrice: (value) => seen.push(value) && `EUR${value}` },
    );
    expect(seen).toEqual([1200]);
  });

  it('translates every line it can produce', () => {
    for (const key of [
      'jobs.mutation.refineEmpty',
      'jobs.mutation.summaryMaxPrice',
      'jobs.mutation.summaryMinSize',
      'jobs.mutation.summaryMinRooms',
      'jobs.mutation.summaryBlacklist',
      'jobs.mutation.summaryArea',
      'jobs.mutation.summaryCommute',
    ]) {
      expect(Object.keys(english)).toContain(key);
    }

    // The header now says what the fold is for, not only what is in it.
    expect(Object.keys(english)).toContain('jobs.mutation.refineHint');
  });
});
