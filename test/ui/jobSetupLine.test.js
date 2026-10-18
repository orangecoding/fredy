/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';

import { jobSetupLine, providerNameMap } from '../../ui/src/services/jobs/jobSetupLine.js';

describe('providerNameMap', () => {
  it('maps every provider id to the name its portal goes by', () => {
    expect(
      providerNameMap([
        { id: 'immoscout', name: 'ImmoScout24' },
        { id: 'immowelt', name: 'Immowelt' },
      ]),
    ).toEqual({ immoscout: 'ImmoScout24', immowelt: 'Immowelt' });
  });

  it('answers with an empty map before the providers are loaded', () => {
    expect(providerNameMap(undefined)).toEqual({});
    expect(providerNameMap(null)).toEqual({});
  });
});

describe('jobSetupLine', () => {
  const names = { immoscout: 'ImmoScout24', kleinanzeigen: 'Kleinanzeigen' };

  it('names the portals, then the channels', () => {
    const job = {
      provider: [{ id: 'immoscout' }, { id: 'kleinanzeigen' }],
      notificationAdapter: [{ name: 'Telegram Wohnungssuche' }],
    };
    expect(jobSetupLine(job, names)).toBe('ImmoScout24, Kleinanzeigen · Telegram Wohnungssuche');
  });

  it("falls back to the job's own provider name, then to the id", () => {
    const job = { provider: [{ id: 'ohneMakler', name: 'OhneMakler' }, { id: 'unknown' }] };
    expect(jobSetupLine(job, names)).toBe('OhneMakler, unknown');
  });

  it('leaves out a half that is empty rather than printing a stray separator', () => {
    expect(jobSetupLine({ provider: [{ id: 'immoscout' }] }, names)).toBe('ImmoScout24');
    expect(jobSetupLine({ notificationAdapter: [{ name: 'Mail' }] }, names)).toBe('Mail');
    expect(jobSetupLine({}, names)).toBe('');
  });
});
