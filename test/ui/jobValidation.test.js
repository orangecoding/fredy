/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { JOB_REQUIREMENTS, missingRequirements, canSaveJob } from '../../ui/src/services/jobs/jobValidation.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const english = JSON.parse(fs.readFileSync(path.join(here, '../../ui/src/locales/en.json'), 'utf-8'));

/** A job with everything filled in. @returns {Object} */
const completeJob = () => ({
  name: 'Cologne 3-room',
  dealType: 'rent',
  providerData: [{ id: 'immoscout', url: 'https://www.immobilienscout24.de/Suche/de/koeln/wohnung-mieten' }],
  selectedChannels: [{ id: 'channel-1' }],
});

describe('jobValidation', () => {
  it('lets a complete job through', () => {
    expect(missingRequirements(completeJob())).toEqual([]);
    expect(canSaveJob(completeJob())).toBe(true);
  });

  it.each(['name', 'dealType', 'provider', 'channel'])('reports a missing %s by name', (key) => {
    const field = { name: 'name', dealType: 'dealType', provider: 'providerData', channel: 'selectedChannels' }[key];
    const job = { ...completeJob(), [field]: undefined };

    expect(canSaveJob(job)).toBe(false);
    expect(missingRequirements(job).map((requirement) => requirement.key)).toEqual([key]);
  });

  it('reports every gap at once rather than one at a time', () => {
    expect(missingRequirements({}).map((requirement) => requirement.key)).toEqual([
      'name',
      'dealType',
      'provider',
      'channel',
    ]);
  });

  it('does not accept a name made of whitespace', () => {
    // This used to enable Save and produce a job with no visible name.
    const job = { ...completeJob(), name: '   ' };
    expect(canSaveJob(job)).toBe(false);
    expect(missingRequirements(job)[0].key).toBe('name');
  });

  it.each(['sell', '', null, 'RENT '])('does not accept %s as a deal type', (dealType) => {
    expect(canSaveJob({ ...completeJob(), dealType })).toBe(false);
  });

  it('survives being handed nothing', () => {
    expect(canSaveJob(null)).toBe(false);
    expect(canSaveJob(undefined)).toBe(false);
  });

  it('translates every requirement it can name', () => {
    for (const requirement of JOB_REQUIREMENTS) {
      expect(Object.keys(english)).toContain(requirement.labelKey);
    }
  });
});
