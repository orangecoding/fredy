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
vi.mock('../../lib/services/tracking/Tracker.js', () => ({ trackPoi: vi.fn() }));
// The user object is inlined rather than referenced: `vi.mock` is hoisted above every `const` in
// this file, so a factory closing over one would read it before it is initialised.
vi.mock('../../lib/mcp/mcpAuthentication.js', () => ({
  authenticateToolCall: vi.fn(() => ({ user: { id: 'u1', isAdmin: false }, error: null })),
  authenticateWriteToolCall: vi.fn(async () => ({ user: { id: 'u1', isAdmin: false }, error: null })),
  checkJobAccess: vi.fn(() => true),
}));

import { getListingById, setListingNotes } from '../../lib/services/storage/listingsStorage.js';
import { ensureWatch, deleteWatch } from '../../lib/services/storage/watchListStorage.js';
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

/** A listing the mocked storage will hand back for `l1`. */
const listing = (overrides = {}) => ({ id: 'l1', title: 'Nice flat', notes: null, isWatched: 0, ...overrides });

beforeEach(() => {
  vi.clearAllMocks();
  authenticateWriteToolCall.mockImplementation(async () => ({ user: USER, error: null }));
  getListingById.mockReturnValue(listing());
  setListingNotes.mockReturnValue(1);
  ensureWatch.mockReturnValue({ watched: true });
  deleteWatch.mockReturnValue({ deleted: true });
});

describe('MCP listing write tools respect access control', () => {
  it.each(['add_listing_note', 'set_listing_notes', 'watch_listing', 'unwatch_listing'])(
    '%s refuses a listing the user cannot see, and writes nothing',
    async (tool) => {
      getListingById.mockReturnValue(null);

      const result = await callTool(tool, { listingId: 'someone-elses', note: 'hi', notes: 'hi' });

      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain('not found or access denied');
      expect(setListingNotes).not.toHaveBeenCalled();
      expect(ensureWatch).not.toHaveBeenCalled();
      expect(deleteWatch).not.toHaveBeenCalled();
    },
  );

  it.each(['add_listing_note', 'set_listing_notes', 'watch_listing', 'unwatch_listing'])(
    '%s refuses an unauthenticated caller before touching storage',
    async (tool) => {
      authenticateWriteToolCall.mockImplementation(async () => ({ user: null, error: 'Authentication required.' }));

      const result = await callTool(tool, { listingId: 'l1', note: 'hi', notes: 'hi' });

      expect(result.isError).toBe(true);
      expect(getListingById).not.toHaveBeenCalled();
      expect(setListingNotes).not.toHaveBeenCalled();
    },
  );

  it('scopes the listing lookup to the calling user', async () => {
    await callTool('add_listing_note', { listingId: 'l1', note: 'hi' });
    expect(getListingById).toHaveBeenCalledWith('l1', 'u1', false);
  });
});

describe('add_listing_note', () => {
  it('appends below the existing notes rather than replacing them', async () => {
    getListingById.mockReturnValue(listing({ notes: 'Viewing on Tuesday' }));

    const result = await callTool('add_listing_note', { listingId: 'l1', note: 'Agent says pets are fine' });

    expect(setListingNotes).toHaveBeenCalledWith('l1', 'Viewing on Tuesday\nAgent says pets are fine');
    expect(textOf(result)).toContain('Viewing on Tuesday\nAgent says pets are fine');
    expect(result.isError).toBeUndefined();
  });

  it('stores the note on its own when the listing has none yet', async () => {
    await callTool('add_listing_note', { listingId: 'l1', note: '  Agent says pets are fine  ' });
    expect(setListingNotes).toHaveBeenCalledWith('l1', 'Agent says pets are fine');
  });

  it('refuses a note that is only whitespace', async () => {
    const result = await callTool('add_listing_note', { listingId: 'l1', note: '   ' });

    expect(result.isError).toBe(true);
    expect(setListingNotes).not.toHaveBeenCalled();
  });

  it('reports a listing that vanished between the read and the write', async () => {
    setListingNotes.mockReturnValue(0);

    const result = await callTool('add_listing_note', { listingId: 'l1', note: 'hi' });

    expect(result.isError).toBe(true);
    expect(trackPoi).not.toHaveBeenCalled();
  });

  it('counts the write', async () => {
    await callTool('add_listing_note', { listingId: 'l1', note: 'hi' });
    expect(trackPoi).toHaveBeenCalledWith(TRACKING_POIS.MCP_LISTING_NOTE_WRITTEN);
  });
});

describe('set_listing_notes', () => {
  it('replaces whatever was there', async () => {
    getListingById.mockReturnValue(listing({ notes: 'Old and wrong' }));

    await callTool('set_listing_notes', { listingId: 'l1', notes: 'Fresh' });

    expect(setListingNotes).toHaveBeenCalledWith('l1', 'Fresh');
  });

  it('clears the notes on an empty string, and says so', async () => {
    getListingById.mockReturnValue(listing({ notes: 'Old and wrong' }));

    const result = await callTool('set_listing_notes', { listingId: 'l1', notes: '' });

    expect(setListingNotes).toHaveBeenCalledWith('l1', '');
    expect(textOf(result)).toContain('Notes cleared.');
  });
});

describe('watch_listing / unwatch_listing are idempotent', () => {
  it('watches a listing that was not watched', async () => {
    const result = await callTool('watch_listing', { listingId: 'l1' });

    expect(ensureWatch).toHaveBeenCalledWith('l1', 'u1');
    expect(textOf(result)).toContain('is now on your watchlist');
    expect(trackPoi).toHaveBeenCalledWith(TRACKING_POIS.MCP_LISTING_WATCH_CHANGED);
  });

  it('says nothing changed when the listing was already watched, and does not count it', async () => {
    getListingById.mockReturnValue(listing({ isWatched: 1 }));

    const result = await callTool('watch_listing', { listingId: 'l1' });

    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toContain('was already on your watchlist');
    expect(trackPoi).not.toHaveBeenCalled();
  });

  it('unwatches a watched listing', async () => {
    getListingById.mockReturnValue(listing({ isWatched: 1 }));

    const result = await callTool('unwatch_listing', { listingId: 'l1' });

    expect(deleteWatch).toHaveBeenCalledWith('l1', 'u1');
    expect(textOf(result)).toContain('removed from your watchlist');
    expect(trackPoi).toHaveBeenCalledWith(TRACKING_POIS.MCP_LISTING_WATCH_CHANGED);
  });

  it('says nothing changed when the listing was not watched, and does not count it', async () => {
    deleteWatch.mockReturnValue({ deleted: false });

    const result = await callTool('unwatch_listing', { listingId: 'l1' });

    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toContain('was not on your watchlist');
    expect(trackPoi).not.toHaveBeenCalled();
  });
});
