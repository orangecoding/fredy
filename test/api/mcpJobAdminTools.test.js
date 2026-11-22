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
  setListingStatus: vi.fn(() => 1),
  deleteListingsById: vi.fn(),
}));
vi.mock('../../lib/services/storage/watchListStorage.js', () => ({
  ensureWatch: vi.fn(() => ({ watched: true })),
  deleteWatch: vi.fn(() => ({ deleted: true })),
}));
vi.mock('../../lib/services/storage/jobStorage.js', () => ({
  queryJobs: vi.fn(() => ({ totalNumber: 0, page: 1, result: [] })),
  getJob: vi.fn(),
  upsertJob: vi.fn(),
  setJobStatus: vi.fn(),
  removeJob: vi.fn(),
}));
vi.mock('../../lib/services/tracking/Tracker.js', () => ({ trackPoi: vi.fn() }));
// The save behind every job tool is the web form's (`jobService.saveJob`), which checks the
// channels and the portals again on its own. Both stand in here for the storage and the provider
// modules, which would pull in the browser stack.
vi.mock('../../lib/services/storage/configuredAdapterStorage.js', () => ({
  getChannel: vi.fn((id) =>
    id === 'c1' ? { id: 'c1', userId: 'u1', adapterId: 'telegram', visibility: 'private' } : null,
  ),
}));
vi.mock('../../lib/utils.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getProviders: async () => [
    { metaInformation: { id: 'immoscout', name: 'Immoscout', baseUrl: 'https://www.immobilienscout24.de/' } },
  ],
}));
vi.mock('../../lib/mcp/jobDraftContext.js', () => ({ buildDraftContext: vi.fn() }));
// Inlined rather than referenced: `vi.mock` is hoisted above every `const` in this file.
vi.mock('../../lib/mcp/mcpAuthentication.js', () => ({
  authenticateToolCall: vi.fn(() => ({ user: { id: 'u1', isAdmin: false }, error: null })),
  authenticateWriteToolCall: vi.fn(async () => ({ user: { id: 'u1', isAdmin: false }, error: null })),
  checkJobAccess: vi.fn(() => true),
}));

import { getJob, upsertJob, setJobStatus, removeJob } from '../../lib/services/storage/jobStorage.js';
import { trackPoi } from '../../lib/services/tracking/Tracker.js';
import { buildDraftContext } from '../../lib/mcp/jobDraftContext.js';
import { authenticateWriteToolCall } from '../../lib/mcp/mcpAuthentication.js';
import { bus } from '../../lib/services/events/event-bus.js';
import { markFinished, markRunning } from '../../lib/services/jobs/run-state.js';
import { TRACKING_POIS } from '../../lib/TRACKING_POIS.js';
import { createMcpServer } from '../../lib/mcp/mcpAdapter.js';

const USER = { id: 'u1', isAdmin: false };
const RENT_URL = 'https://www.immobilienscout24.de/Suche/de/nordrhein-westfalen/koeln/wohnung-mieten';

/** The context an edit validates against: one portal, one channel the user may use. */
const context = (overrides = {}) => ({
  providers: [{ id: 'immoscout', name: 'Immoscout', baseUrl: 'https://www.immobilienscout24.de/' }],
  channels: [{ id: 'c1', name: 'Family', adapterId: 'telegram' }],
  addresses: [],
  shareableUsers: [],
  ...overrides,
});

/** A stored job the user owns, with every field an edit starts from. */
const job = (overrides = {}) => ({
  id: 'job-1',
  userId: 'u1',
  enabled: true,
  name: 'Köln rent',
  dealType: 'rent',
  provider: [{ id: 'immoscout', name: 'Immoscout', url: RENT_URL, enabled: true }],
  notificationAdapter: [{ id: 'telegram', name: 'Family', fields: {}, configuredAdapterId: 'c1' }],
  shared_with_user: [],
  blacklist: [],
  excludedLocations: [],
  specFilter: null,
  commuteFilter: null,
  marketFilter: null,
  priceChangeThreshold: null,
  spatialFilter: null,
  lastRunAt: null,
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

/**
 * Register the listener the execution service would have, so the tool sees a running Fredy.
 *
 * @returns {ReturnType<typeof vi.fn>}
 */
function pretendServerIsRunning() {
  const listener = vi.fn();
  bus.on('jobs:runOne', listener);
  bus.on('jobs:runAll', listener);
  return listener;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Nothing listens by default: the first thing each run tool has to get right is refusing when
  // the Fredy server is not there to carry the run out.
  bus.removeAllListeners();
  authenticateWriteToolCall.mockImplementation(async () => ({ user: USER, error: null }));
  buildDraftContext.mockResolvedValue(context());
  getJob.mockReturnValue(job());
});

describe('the job administration tools share one ownership gate', () => {
  it.each(['run_job', 'set_job_enabled', 'update_job', 'delete_job'])(
    '%s refuses a job the user cannot change',
    async (tool) => {
      getJob.mockReturnValue(job({ userId: 'someone-else' }));

      const result = await callTool(tool, { jobId: 'job-1', enabled: true, name: 'x', confirmed: true });

      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain('not yours to change');
      expect(upsertJob).not.toHaveBeenCalled();
      expect(setJobStatus).not.toHaveBeenCalled();
      expect(removeJob).not.toHaveBeenCalled();
    },
  );

  it.each(['run_job', 'set_job_enabled', 'update_job', 'delete_job'])(
    '%s refuses an unauthenticated caller before touching storage',
    async (tool) => {
      authenticateWriteToolCall.mockImplementation(async () => ({ user: null, error: 'Authentication required.' }));

      const result = await callTool(tool, { jobId: 'job-1', enabled: true, name: 'x', confirmed: true });

      expect(result.isError).toBe(true);
      expect(getJob).not.toHaveBeenCalled();
    },
  );
});

describe('run_job', () => {
  it('refuses when no Fredy server is running to carry the run out', async () => {
    const result = await callTool('run_job', { jobId: 'job-1' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('standalone MCP server');
    expect(trackPoi).not.toHaveBeenCalled();
  });

  it('queues the run on the event bus and answers accepted', async () => {
    const listener = pretendServerIsRunning();

    const result = await callTool('run_job', { jobId: 'job-1' });

    expect(listener).toHaveBeenCalledWith({ jobId: 'job-1' });
    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toContain('background');
    expect(trackPoi).toHaveBeenCalledWith(TRACKING_POIS.MCP_JOB_RUN);
  });

  it('refuses the tour example job, which does not search', async () => {
    pretendServerIsRunning();
    getJob.mockReturnValue(job({ id: 'tour-1' }));

    const result = await callTool('run_job', { jobId: 'tour-1' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('tour');
    expect(bus.listenerCount('jobs:runOne')).toBe(1);
  });

  it('refuses a job that is already running', async () => {
    pretendServerIsRunning();
    markRunning('job-1');
    try {
      const result = await callTool('run_job', { jobId: 'job-1' });

      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain('already running');
    } finally {
      markFinished('job-1');
    }
  });
});

describe('run_all_jobs', () => {
  it('queues a run-all scoped to the calling user', async () => {
    const listener = pretendServerIsRunning();

    const result = await callTool('run_all_jobs', {});

    expect(listener).toHaveBeenCalledWith({ userId: 'u1' });
    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toContain('every job');
  });

  it('refuses when the Fredy server is not running', async () => {
    const result = await callTool('run_all_jobs', {});

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('standalone MCP server');
  });
});

describe('set_job_enabled', () => {
  it('switches a job off and reports the change', async () => {
    const result = await callTool('set_job_enabled', { jobId: 'job-1', enabled: false });

    expect(setJobStatus).toHaveBeenCalledWith({ jobId: 'job-1', status: false });
    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toContain('now disabled');
    expect(trackPoi).toHaveBeenCalledWith(TRACKING_POIS.MCP_JOB_STATUS_CHANGED);
  });

  it('treats a repeat call as a success without counting a change', async () => {
    const result = await callTool('set_job_enabled', { jobId: 'job-1', enabled: true });

    expect(setJobStatus).not.toHaveBeenCalled();
    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toContain('already enabled');
    expect(trackPoi).not.toHaveBeenCalled();
  });
});

describe('update_job', () => {
  it('renames a job and stores the rest of it unchanged', async () => {
    const result = await callTool('update_job', { jobId: 'job-1', name: 'Köln rent 2' });

    expect(upsertJob).toHaveBeenCalledTimes(1);
    const payload = upsertJob.mock.calls[0][0];
    expect(payload.jobId).toBe('job-1');
    expect(payload.userId).toBe('u1');
    expect(payload.name).toBe('Köln rent 2');
    expect(payload.provider).toEqual([{ id: 'immoscout', name: 'Immoscout', url: RENT_URL, enabled: true }]);
    expect(payload.notificationAdapter).toEqual([{ configuredAdapterId: 'c1' }]);
    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toContain('Job updated');
    expect(trackPoi).toHaveBeenCalledWith(TRACKING_POIS.MCP_JOB_UPDATED);
  });

  it('keeps the area filter the user drew on the map', async () => {
    const drawn = {
      type: 'Polygon',
      coordinates: [
        [
          [6.8, 50.9],
          [6.9, 50.9],
          [6.9, 51.0],
          [6.8, 50.9],
        ],
      ],
    };
    getJob.mockReturnValue(job({ spatialFilter: drawn }));

    await callTool('update_job', { jobId: 'job-1', name: 'Köln rent 2' });

    expect(upsertJob.mock.calls[0][0].spatialFilter).toEqual(drawn);
  });

  it('refuses an unknown portal and stores nothing', async () => {
    const result = await callTool('update_job', { jobId: 'job-1', providerUrls: ['https://example.com/search'] });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('unknown portal host');
    expect(textOf(result)).toContain('nothing was changed');
    expect(upsertJob).not.toHaveBeenCalled();
  });

  it('refuses an edit that would strip the job of its searches', async () => {
    const result = await callTool('update_job', { jobId: 'job-1', providerUrls: [] });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('providerUrls');
    expect(upsertJob).not.toHaveBeenCalled();
  });

  it('refuses an edit that would leave the job without a channel', async () => {
    const result = await callTool('update_job', { jobId: 'job-1', channelIds: [] });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('channelIds');
    expect(upsertJob).not.toHaveBeenCalled();
  });

  it('refuses a channel the user may not use, and names theirs', async () => {
    const result = await callTool('update_job', { jobId: 'job-1', channelIds: ['c-other'] });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('c-other');
    expect(textOf(result)).toContain('Family');
    expect(upsertJob).not.toHaveBeenCalled();
  });

  it('replaces the blacklist whole rather than merging into it', async () => {
    getJob.mockReturnValue(job({ blacklist: ['Old'] }));

    const result = await callTool('update_job', { jobId: 'job-1', blacklist: ['Ground floor'] });

    expect(upsertJob.mock.calls[0][0].blacklist).toEqual(['Ground floor']);
    expect(result.isError).toBeUndefined();
  });
});

describe('delete_job', () => {
  it('refuses to delete without the user confirming first', async () => {
    const result = await callTool('delete_job', { jobId: 'job-1', confirmed: false });

    expect(result.isError).toBe(true);
    expect(removeJob).not.toHaveBeenCalled();
  });

  it('removes the job once confirmed, and says the listings went with it', async () => {
    const result = await callTool('delete_job', { jobId: 'job-1', confirmed: true });

    expect(removeJob).toHaveBeenCalledWith('job-1');
    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toContain('all of its listings');
    expect(trackPoi).toHaveBeenCalledWith(TRACKING_POIS.MCP_JOB_DELETED);
  });
});
