/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';

import { providerListProblem } from '../../../lib/services/jobs/providerUrl.js';

const meta = new Map([
  ['immoscout', { id: 'immoscout', name: 'Immoscout', baseUrl: 'https://www.immobilienscout24.de/' }],
]);
const search = 'https://www.immobilienscout24.de/Suche/de/nordrhein-westfalen/duesseldorf/wohnung-mieten';

describe('providerListProblem', () => {
  it('accepts a known provider with a search on its own host, and an empty list', () => {
    expect(providerListProblem([{ id: 'immoscout', url: search }], meta)).toBeNull();
    expect(providerListProblem([], meta)).toBeNull();
  });

  // A string here was stored as is and crashed the scheduler the next time it ran the job.
  it('refuses anything that is not an array', () => {
    expect(providerListProblem('x', meta)).toMatch(/array/);
    expect(providerListProblem({ id: 'immoscout' }, meta)).toMatch(/array/);
    expect(providerListProblem(null, meta)).toMatch(/array/);
  });

  it('refuses a provider id Fredy does not have', () => {
    expect(providerListProblem([{ id: 'nope', url: search }], meta)).toMatch(/Unknown provider/);
    expect(providerListProblem(['immoscout'], meta)).toMatch(/Unknown provider/);
  });

  // The pipeline opens these URLs in a real browser on the server, so a URL on another host is a
  // request into whatever network the server stands in.
  it('refuses a URL on any other host, the local network included', () => {
    for (const url of ['http://192.168.1.1/admin', 'http://localhost:9998/api', 'https://evil.example/']) {
      expect(providerListProblem([{ id: 'immoscout', url }], meta), url).toMatch(/does not point to Immoscout/);
    }
    expect(providerListProblem([{ id: 'immoscout' }], meta)).toMatch(/empty/);
  });

  it('leaves a bare homepage to the form, so an older job that carries one can still be saved', () => {
    expect(providerListProblem([{ id: 'immoscout', url: 'https://www.immobilienscout24.de/' }], meta)).toBeNull();
  });
});
