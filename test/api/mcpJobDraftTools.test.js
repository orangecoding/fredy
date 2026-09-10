/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

vi.mock('../../lib/services/storage/listingsStorage.js', () => ({
  queryListings: vi.fn(() => ({ totalNumber: 0, page: 1, result: [] })),
  getListingById: vi.fn(),
  setListingNotes: vi.fn(() => 1),
}));
vi.mock('../../lib/services/storage/watchListStorage.js', () => ({
  ensureWatch: vi.fn(() => ({ watched: true })),
  deleteWatch: vi.fn(() => ({ deleted: true })),
}));
vi.mock('../../lib/services/storage/jobStorage.js', () => ({
  queryJobs: vi.fn(() => ({ totalNumber: 0, page: 1, result: [] })),
  getJob: vi.fn(),
  upsertJob: vi.fn(),
}));
vi.mock('../../lib/services/tracking/Tracker.js', () => ({ trackPoi: vi.fn() }));
vi.mock('../../lib/mcp/jobDraftContext.js', () => ({ buildDraftContext: vi.fn() }));
// Inlined rather than referenced: `vi.mock` is hoisted above every `const` in this file.
vi.mock('../../lib/mcp/mcpAuthentication.js', () => ({
  authenticateToolCall: vi.fn(() => ({ user: { id: 'u1', isAdmin: false }, error: null })),
  authenticateWriteToolCall: vi.fn(async () => ({ user: { id: 'u1', isAdmin: false }, error: null })),
  checkJobAccess: vi.fn(() => true),
}));

import { getJob, upsertJob } from '../../lib/services/storage/jobStorage.js';
import { trackPoi } from '../../lib/services/tracking/Tracker.js';
import { buildDraftContext } from '../../lib/mcp/jobDraftContext.js';
import { authenticateWriteToolCall } from '../../lib/mcp/mcpAuthentication.js';
import { _resetDraftsForTests } from '../../lib/mcp/jobDraftStore.js';
import { TRACKING_POIS } from '../../lib/TRACKING_POIS.js';
import { createMcpServer } from '../../lib/mcp/mcpAdapter.js';

const USER = { id: 'u1', isAdmin: false };
const RENT_URL = 'https://www.immobilienscout24.de/Suche/de/nordrhein-westfalen/koeln/wohnung-mieten';

/** A context whose channel still carries a secret, so a leak would show up in the output. */
const context = (overrides = {}) => ({
  providers: [{ id: 'immoscout', name: 'Immoscout', baseUrl: 'https://www.immobilienscout24.de/' }],
  channels: [{ id: 'c1', name: 'Family', adapterId: 'telegram' }],
  addresses: ['Work'],
  shareableUsers: [{ id: 'u2', name: 'bob' }],
  ...overrides,
});

async function callTool(name, args) {
  const server = createMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const result = await client.callTool({ name, arguments: args });
  await client.close();
  return result;
}

const textOf = (result) => result.content.map((part) => part.text).join('\n');

/** Run the interview to the point where the job can be created. */
async function interview() {
  await callTool('start_job_draft', {});
  await callTool('update_job_draft', { name: 'Köln' });
  await callTool('update_job_draft', { providerUrls: [RENT_URL] });
  await callTool('update_job_draft', { dealType: 'rent' });
  await callTool('update_job_draft', { channelIds: ['c1'] });
  return callTool('update_job_draft', { skipRefinements: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  _resetDraftsForTests();
  authenticateWriteToolCall.mockImplementation(async () => ({ user: USER, error: null }));
  buildDraftContext.mockResolvedValue(context());
  getJob.mockReturnValue({
    id: 'job-1',
    name: 'Köln',
    enabled: true,
    dealType: 'rent',
    provider: [{ id: 'immoscout', name: 'Immoscout', url: RENT_URL }],
    blacklist: [],
  });
});

describe('start_job_draft', () => {
  it('hands over the portals, the channels and the first question', async () => {
    const text = textOf(await callTool('start_job_draft', {}));

    expect(text).toContain('immobilienscout24.de');
    expect(text).toContain('c1');
    expect(text).toContain('Family');
    expect(text).toContain('Work');
    expect(text).toContain('What should this search be called?');
  });

  it('never echoes a channel secret', async () => {
    // The adapter is handed the already-stripped context, and this is what keeps it that way: a
    // channel that still carried `fields` would print its token straight into the LLM transcript.
    buildDraftContext.mockResolvedValue(
      context({ channels: [{ id: 'c1', name: 'Family', adapterId: 'telegram', fields: { token: 'sekrit-tok' } }] }),
    );

    const text = textOf(await callTool('start_job_draft', {}));

    expect(text).not.toContain('sekrit-tok');
    expect(text).not.toContain('token');
  });

  it('resumes an interview already in progress', async () => {
    await callTool('start_job_draft', {});
    await callTool('update_job_draft', { name: 'Köln' });

    expect(textOf(await callTool('start_job_draft', {}))).toContain('**Name:** Köln');
  });

  it('starts over when asked to', async () => {
    await callTool('start_job_draft', {});
    await callTool('update_job_draft', { name: 'Köln' });

    expect(textOf(await callTool('start_job_draft', { replace: true }))).not.toContain('**Name:** Köln');
  });
});

describe('update_job_draft', () => {
  it('refuses to run without an interview', async () => {
    const result = await callTool('update_job_draft', { name: 'Köln' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('start_job_draft first');
  });

  it('reports a problem without losing what was already answered', async () => {
    await callTool('start_job_draft', {});
    await callTool('update_job_draft', { name: 'Köln' });

    const result = await callTool('update_job_draft', { providerUrls: ['https://www.example.com/suche'] });
    const text = textOf(result);

    expect(text).toContain('Problems');
    expect(text).toContain('unknown portal host');
    expect(text).toContain('**Name:** Köln');
  });
});

describe('create_job_from_draft', () => {
  it('creates the job once the user has confirmed', async () => {
    expect(textOf(await interview())).toContain('Ready to create');

    const result = await callTool('create_job_from_draft', { confirmed: true });

    expect(upsertJob).toHaveBeenCalledTimes(1);
    const payload = upsertJob.mock.calls[0][0];
    expect(payload.userId).toBe('u1');
    expect(payload.jobId).toEqual(expect.any(String));
    expect(payload.jobId.length).toBeGreaterThan(0);
    expect(payload.spatialFilter).toBeNull();
    expect(payload.enabled).toBe(true);
    expect(payload.notificationAdapter).toEqual([{ configuredAdapterId: 'c1' }]);
    expect(trackPoi).toHaveBeenCalledWith(TRACKING_POIS.MCP_JOB_CREATED);

    const text = textOf(result);
    expect(text).toContain('Job created');
    expect(text).toContain('Area filter');
  });

  it('refuses until the user has confirmed', async () => {
    await interview();

    const result = await callTool('create_job_from_draft', { confirmed: false });

    expect(result.isError).toBe(true);
    expect(upsertJob).not.toHaveBeenCalled();
  });

  it('refuses an unfinished interview and says what is missing', async () => {
    await callTool('start_job_draft', {});
    await callTool('update_job_draft', { name: 'Köln' });

    const result = await callTool('create_job_from_draft', { confirmed: true });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('providerUrls');
    expect(upsertJob).not.toHaveBeenCalled();
  });

  it('re-checks the answers against the world as it is now, not as it was', async () => {
    await interview();
    // The channel was demoted, deleted or made private while the interview was running.
    buildDraftContext.mockResolvedValue(context({ channels: [] }));

    const result = await callTool('create_job_from_draft', { confirmed: true });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('no longer valid');
    expect(upsertJob).not.toHaveBeenCalled();

    // The draft survives, so the user can pick a different channel rather than start again.
    buildDraftContext.mockResolvedValue(context());
    expect(textOf(await callTool('start_job_draft', {}))).toContain('**Name:** Köln');
  });

  it('consumes the draft, so a repeated call does not create a second job', async () => {
    await interview();
    await callTool('create_job_from_draft', { confirmed: true });

    const again = await callTool('create_job_from_draft', { confirmed: true });

    expect(again.isError).toBe(true);
    expect(textOf(again)).toContain('No job draft in progress');
    expect(upsertJob).toHaveBeenCalledTimes(1);
  });
});

describe('discard_job_draft', () => {
  it('throws the interview away', async () => {
    await interview();

    expect(textOf(await callTool('discard_job_draft', {}))).toContain('Draft discarded');

    const result = await callTool('create_job_from_draft', { confirmed: true });
    expect(result.isError).toBe(true);
    expect(upsertJob).not.toHaveBeenCalled();
  });

  it('is not an error when there is nothing to discard', async () => {
    const result = await callTool('discard_job_draft', {});

    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toContain('no draft to discard');
  });
});

describe('every draft tool is gated', () => {
  it.each(['start_job_draft', 'update_job_draft', 'create_job_from_draft', 'discard_job_draft'])(
    '%s refuses a caller the write gate turned away',
    async (tool) => {
      authenticateWriteToolCall.mockImplementation(async () => ({
        user: null,
        error: 'This is a read-only demo of Fredy.',
      }));

      const result = await callTool(tool, { confirmed: true });

      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain('read-only demo');
      expect(upsertJob).not.toHaveBeenCalled();
      expect(buildDraftContext).not.toHaveBeenCalled();
    },
  );
});
