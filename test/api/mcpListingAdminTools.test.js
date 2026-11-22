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
  // The access check the shared listing actions run before every write. Who may touch which
  // listing is tested against real rows in listingAccessControl.test.js; here it lets the call through.
  userCanAccessListing: vi.fn(() => true),
  filterListingIdsForUser: vi.fn((ids) => ids),
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
vi.mock('../../lib/services/storage/configuredAdapterStorage.js', () => ({
  getAllChannels: vi.fn(() => []),
  getChannel: vi.fn(),
  upsertChannel: vi.fn(),
  removeChannel: vi.fn(),
  getJobsUsingChannel: vi.fn(() => []),
  getUsageCounts: vi.fn(() => new Map()),
  normaliseVisibility: (value) => (['private', 'admin', 'everyone'].includes(value) ? value : 'private'),
  VISIBILITY: Object.freeze({ PRIVATE: 'private', ADMIN: 'admin', EVERYONE: 'everyone' }),
}));
// The service is imported dynamically, by the tool, only when a listing is being added - and the
// mock covers that import the same way it covers every static one.
vi.mock('../../lib/services/listings/manualListingService.js', () => ({
  addListingByUrl: vi.fn(async () => ({ status: 'created', listingId: 'l9', provider: 'immoscout' })),
}));
vi.mock('../../lib/services/tracking/Tracker.js', () => ({ trackPoi: vi.fn() }));
// A removal asks whether the instance is in demo mode; it is not.
vi.mock('../../lib/services/storage/settingsStorage.js', () => ({
  getSettings: vi.fn(async () => ({ demoMode: false })),
  getUserSettings: vi.fn(() => ({})),
  upsertSettings: vi.fn(),
}));
vi.mock('../../lib/mcp/jobDraftContext.js', () => ({ buildDraftContext: vi.fn() }));
vi.mock('../../lib/mcp/mcpAuthentication.js', () => ({
  authenticateToolCall: vi.fn(() => ({ user: { id: 'u1', isAdmin: false }, error: null })),
  authenticateWriteToolCall: vi.fn(async () => ({ user: { id: 'u1', isAdmin: false }, error: null })),
  checkJobAccess: vi.fn(() => true),
}));

import { getListingById, setListingStatus, deleteListingsById } from '../../lib/services/storage/listingsStorage.js';
import { ensureWatch } from '../../lib/services/storage/watchListStorage.js';
import { addListingByUrl } from '../../lib/services/listings/manualListingService.js';
import { trackPoi } from '../../lib/services/tracking/Tracker.js';
import { authenticateWriteToolCall } from '../../lib/mcp/mcpAuthentication.js';
import { TRACKING_POIS } from '../../lib/TRACKING_POIS.js';
import { createMcpServer } from '../../lib/mcp/mcpAdapter.js';

const USER = { id: 'u1', isAdmin: false };

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

/** A listing the mocked storage hands back for `l1`. */
const listing = (overrides = {}) => ({ id: 'l1', title: 'Nice flat', notes: null, isWatched: 0, ...overrides });

beforeEach(() => {
  vi.clearAllMocks();
  authenticateWriteToolCall.mockImplementation(async () => ({ user: USER, error: null }));
  getListingById.mockReturnValue(listing());
  setListingStatus.mockReturnValue(1);
  addListingByUrl.mockResolvedValue({ status: 'created', listingId: 'l9', provider: 'immoscout' });
});

describe('set_listing_status', () => {
  it('records the status the user decided on', async () => {
    const result = await callTool('set_listing_status', { listingId: 'l1', status: 'applied' });

    expect(setListingStatus).toHaveBeenCalledWith('l1', 'applied');
    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toContain('applied');
    expect(trackPoi).toHaveBeenCalledWith(TRACKING_POIS.MCP_LISTING_STATUS_SET);
  });

  it('puts a listing with a status on the watchlist, as the web route does', async () => {
    const result = await callTool('set_listing_status', { listingId: 'l1', status: 'rejected' });

    expect(ensureWatch).toHaveBeenCalledWith('l1', 'u1');
    expect(textOf(result)).toContain('watchlist');
  });

  it('clears the status when asked for none, and leaves the watchlist alone', async () => {
    await callTool('set_listing_status', { listingId: 'l1', status: 'none' });

    expect(setListingStatus).toHaveBeenCalledWith('l1', null);
    expect(ensureWatch).not.toHaveBeenCalled();
  });

  it('refuses a listing the user cannot see, and writes nothing', async () => {
    getListingById.mockReturnValue(null);

    const result = await callTool('set_listing_status', { listingId: 'l1', status: 'applied' });

    expect(result.isError).toBe(true);
    expect(setListingStatus).not.toHaveBeenCalled();
  });

  it('reports a listing that vanished between the read and the write', async () => {
    setListingStatus.mockReturnValue(0);

    const result = await callTool('set_listing_status', { listingId: 'l1', status: 'applied' });

    expect(result.isError).toBe(true);
    expect(trackPoi).not.toHaveBeenCalled();
  });
});

describe('add_listing_by_url', () => {
  it('hands the paste to the same service the web route uses', async () => {
    const result = await callTool('add_listing_by_url', {
      url: 'https://www.immobilienscout24.de/expose/123',
      jobId: 'job-1',
      watch: true,
    });

    expect(addListingByUrl).toHaveBeenCalledWith({
      user: USER,
      url: 'https://www.immobilienscout24.de/expose/123',
      jobId: 'job-1',
      watch: true,
    });
    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toContain('l9');
    expect(trackPoi).toHaveBeenCalledWith(TRACKING_POIS.MCP_LISTING_ADDED_BY_URL);
  });

  it('answers a duplicate with the listing the user already has', async () => {
    addListingByUrl.mockResolvedValue({
      status: 'duplicate',
      listingId: 'l1',
      jobName: 'Köln rent',
      provider: 'immoscout',
    });

    const result = await callTool('add_listing_by_url', { url: 'https://example.test/expose/1', jobId: 'job-1' });

    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toContain('already have this advert');
    expect(textOf(result)).toContain('l1');
    expect(trackPoi).not.toHaveBeenCalled();
  });

  it.each([
    ['invalidUrl', 'not a URL Fredy may open'],
    ['forbidden', 'not one you may add listings to'],
    ['unknownPortal', 'No supported portal'],
    ['unsupported', 'cannot read a single advert'],
    ['unreadable', 'no single advert'],
    ['project', 'new-build project'],
    ['busy', 'still running'],
    ['failed', 'failed'],
  ])('answers a %s as an error the model can act on', async (status, expected) => {
    addListingByUrl.mockResolvedValue({ status, provider: 'immoscout' });

    const result = await callTool('add_listing_by_url', { url: 'https://example.test/x', jobId: 'job-1' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain(expected);
  });
});

describe('delete_listing', () => {
  it('refuses without confirmation, and says what is at stake, worded by hard', async () => {
    const soft = await callTool('delete_listing', { listingId: 'l1', confirmed: false });

    expect(soft.isError).toBe(true);
    // The default is a hide the web UI can undo, so the model must not warn about something
    // irreversible a call without `hard` would not do.
    expect(textOf(soft)).toContain('only be hidden');
    expect(textOf(soft)).toContain('can undo');
    expect(deleteListingsById).not.toHaveBeenCalled();

    const hard = await callTool('delete_listing', { listingId: 'l1', hard: true, confirmed: false });

    expect(hard.isError).toBe(true);
    expect(textOf(hard)).toContain('permanently');
    expect(textOf(hard)).toContain('cannot be undone');
    expect(deleteListingsById).not.toHaveBeenCalled();
  });

  it('hides the listing by default and says where to get it back', async () => {
    const result = await callTool('delete_listing', { listingId: 'l1', confirmed: true });

    expect(deleteListingsById).toHaveBeenCalledWith(['l1'], false);
    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toContain('restore');
    expect(trackPoi).toHaveBeenCalledWith(TRACKING_POIS.MCP_LISTING_DELETED);
  });

  it('removes the row permanently when the user asked for hard', async () => {
    const result = await callTool('delete_listing', { listingId: 'l1', hard: true, confirmed: true });

    expect(deleteListingsById).toHaveBeenCalledWith(['l1'], true);
    expect(textOf(result)).toContain('permanently');
  });

  it('looks the listing up with hidden ones included, so a hidden listing can be removed for good', async () => {
    getListingById.mockReturnValue(listing({ manually_deleted: 1 }));

    const result = await callTool('delete_listing', { listingId: 'l1', hard: true, confirmed: true });

    expect(getListingById).toHaveBeenCalledWith('l1', 'u1', false, { includeGeometry: false, includeHidden: true });
    expect(result.isError).toBeUndefined();
    expect(deleteListingsById).toHaveBeenCalledWith(['l1'], true);
  });

  it('answers a soft delete of a listing already hidden without writing or counting it', async () => {
    getListingById.mockReturnValue(listing({ manually_deleted: 1 }));

    const result = await callTool('delete_listing', { listingId: 'l1', confirmed: true });

    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toContain('already hidden');
    expect(deleteListingsById).not.toHaveBeenCalled();
    expect(trackPoi).not.toHaveBeenCalled();
  });

  it('refuses a listing the user cannot see', async () => {
    getListingById.mockReturnValue(null);

    const result = await callTool('delete_listing', { listingId: 'l1', confirmed: true });

    expect(result.isError).toBe(true);
    expect(deleteListingsById).not.toHaveBeenCalled();
  });
});
