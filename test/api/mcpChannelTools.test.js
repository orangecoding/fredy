/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

/*
 * The adapter catalog is real: it is read from disk exactly as the running server reads it, and
 * what these tests are partly about is what the real adapter definitions make the tools say. Only
 * the storage, the auth layer and the actual send are mocked - `canUseChannel`, `canEditChannel`
 * and the privileged-field guard run for real.
 */
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
vi.mock('../../lib/services/storage/configuredAdapterStorage.js', () => ({
  getAllChannels: vi.fn(() => []),
  getChannel: vi.fn(),
  upsertChannel: vi.fn(() => 'c1'),
  removeChannel: vi.fn(),
  getJobsUsingChannel: vi.fn(() => []),
  getUsageCounts: vi.fn(() => new Map()),
  normaliseVisibility: (value) => (['private', 'admin', 'everyone'].includes(value) ? value : 'private'),
  VISIBILITY: Object.freeze({ PRIVATE: 'private', ADMIN: 'admin', EVERYONE: 'everyone' }),
}));
vi.mock('../../lib/notification/testFire.js', () => ({ testFire: vi.fn(async () => {}) }));
vi.mock('../../lib/services/tracking/Tracker.js', () => ({ trackPoi: vi.fn() }));
vi.mock('../../lib/mcp/jobDraftContext.js', () => ({ buildDraftContext: vi.fn() }));
vi.mock('../../lib/mcp/mcpAuthentication.js', () => ({
  authenticateToolCall: vi.fn(() => ({ user: { id: 'u1', isAdmin: false }, error: null })),
  authenticateWriteToolCall: vi.fn(async () => ({ user: { id: 'u1', isAdmin: false }, error: null })),
  checkJobAccess: vi.fn(() => true),
}));

import {
  getAllChannels,
  getChannel,
  upsertChannel,
  removeChannel,
  getJobsUsingChannel,
} from '../../lib/services/storage/configuredAdapterStorage.js';
import { testFire } from '../../lib/notification/testFire.js';
import { trackPoi } from '../../lib/services/tracking/Tracker.js';
import { authenticateToolCall, authenticateWriteToolCall } from '../../lib/mcp/mcpAuthentication.js';
import { TRACKING_POIS } from '../../lib/TRACKING_POIS.js';
import { createMcpServer } from '../../lib/mcp/mcpAdapter.js';

const USER = { id: 'u1', isAdmin: false };
const ADMIN = { id: 'admin-1', isAdmin: true };

/** A stored telegram channel, carrying a secret the tools must never echo. */
const channel = (overrides = {}) => ({
  id: 'c1',
  userId: 'u1',
  adapterId: 'telegram',
  name: 'Family',
  fields: { token: 'bot-token-value', chatId: '12345' },
  visibility: 'private',
  createdAt: 0,
  updatedAt: 0,
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

beforeEach(() => {
  vi.clearAllMocks();
  authenticateToolCall.mockImplementation(() => ({ user: USER, error: null }));
  authenticateWriteToolCall.mockImplementation(async () => ({ user: USER, error: null }));
  // Re-established every time, because `clearAllMocks` only forgets calls: a `mockReturnValue` set
  // by one test would otherwise decide what the next one reads.
  getAllChannels.mockReturnValue([]);
  getChannel.mockReturnValue(channel());
  upsertChannel.mockReturnValue('c1');
  getJobsUsingChannel.mockReturnValue([]);
  testFire.mockImplementation(async () => {});
});

describe('list_channels', () => {
  it('shows the channels the user may use, and never a secret value', async () => {
    getAllChannels.mockReturnValue([
      channel(),
      channel({ id: 'c2', userId: 'other', name: 'Shared', visibility: 'everyone' }),
      channel({ id: 'c3', userId: 'other', name: 'Their own', visibility: 'private' }),
    ]);

    const result = await callTool('list_channels', {});
    const text = textOf(result);

    expect(text).toContain('Family');
    expect(text).toContain('Shared');
    expect(text).not.toContain('Their own');
    // The destination is the target field, never the token, and the field values are not serialised
    // at all - a token that never reaches the transcript is one that cannot leak from it.
    expect(text).toContain('12345');
    expect(text).not.toContain('bot-token-value');
  });

  it('says where to create one when the user has none', async () => {
    getAllChannels.mockReturnValue([]);

    const text = textOf(await callTool('list_channels', {}));

    expect(text).toContain('create_channel');
  });
});

describe('list_adapters', () => {
  it('lists the installed adapters with their field definitions', async () => {
    const text = textOf(await callTool('list_adapters', {}));

    expect(text).toContain('telegram');
    expect(text).toContain('chatId');
    expect(text).toContain('secret');
    expect(text).toContain('destination');
  });
});

describe('create_channel', () => {
  it('stores a telegram channel with the fields the catalog asks for', async () => {
    const result = await callTool('create_channel', {
      adapterId: 'telegram',
      name: 'Family',
      fields: { token: 'new-token', chatId: '12345' },
    });

    expect(upsertChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        adapterId: 'telegram',
        name: 'Family',
        fields: { token: 'new-token', chatId: '12345' },
      }),
    );
    expect(result.isError).toBeUndefined();
    expect(textOf(result)).not.toContain('new-token');
    expect(trackPoi).toHaveBeenCalledWith(TRACKING_POIS.MCP_CHANNEL_SAVED);
  });

  it('creates the feed url itself and never takes one from the caller', async () => {
    const result = await callTool('create_channel', {
      adapterId: 'rss',
      name: 'My feed',
      fields: { token: 'a-token-the-user-picked' },
    });

    const stored = upsertChannel.mock.calls[0][0].fields;
    // The rss token is the feed's only credential: a generated one, not the one somebody sent.
    expect(stored.token).toBeTruthy();
    expect(stored.token).not.toBe('a-token-the-user-picked');
    expect(result.isError).toBeUndefined();
    expect(textOf(result)).not.toContain(stored.token);
  });

  it('refuses a channel without a field it cannot work without, as the web form does', async () => {
    const result = await callTool('create_channel', {
      adapterId: 'telegram',
      name: 'Family',
      fields: { chatId: '12345' },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('"token"');
    expect(upsertChannel).not.toHaveBeenCalled();
  });

  it('refuses an adapter id no installed adapter has', async () => {
    const result = await callTool('create_channel', { adapterId: 'nope', name: 'X' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('list_adapters');
    expect(upsertChannel).not.toHaveBeenCalled();
  });

  it('keeps a non-admin channel private, whatever the call asks for', async () => {
    await callTool('create_channel', {
      adapterId: 'telegram',
      name: 'Family',
      fields: { token: 't', chatId: '1' },
      visibility: 'everyone',
    });

    expect(upsertChannel.mock.calls[0][0].visibility).toBe('private');
  });

  it('lets an admin decide who may use the channel', async () => {
    authenticateWriteToolCall.mockImplementation(async () => ({ user: ADMIN, error: null }));

    await callTool('create_channel', {
      adapterId: 'telegram',
      name: 'Family',
      fields: { token: 't', chatId: '1' },
      visibility: 'everyone',
    });

    expect(upsertChannel.mock.calls[0][0].visibility).toBe('everyone');
  });

  it('refuses a privileged field from a non-admin, as the web route does', async () => {
    const result = await callTool('create_channel', {
      adapterId: 'sqlite',
      name: 'Writer',
      fields: { dbPath: '/tmp/wherever.db' },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('not allowed to set');
    expect(upsertChannel).not.toHaveBeenCalled();
  });
});

describe('update_channel', () => {
  it('renames without touching the stored fields', async () => {
    const result = await callTool('update_channel', { channelId: 'c1', name: 'Family flat' });

    expect(upsertChannel).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c1', name: 'Family flat', fields: { token: 'bot-token-value', chatId: '12345' } }),
    );
    expect(result.isError).toBeUndefined();
  });

  it('keeps the stored name when the call only reconfigures the fields', async () => {
    await callTool('update_channel', { channelId: 'c1', fields: { token: 'rotated', chatId: '999' } });

    expect(upsertChannel.mock.calls[0][0].name).toBe('Family');
    expect(upsertChannel.mock.calls[0][0].fields).toEqual({ token: 'rotated', chatId: '999' });
  });

  it('changes only the field the call sends, keeping the token the model never saw', async () => {
    const result = await callTool('update_channel', { channelId: 'c1', fields: { chatId: '999' } });

    expect(result.isError).toBeUndefined();
    expect(upsertChannel.mock.calls[0][0].fields).toEqual({ token: 'bot-token-value', chatId: '999' });
  });

  it('removes an optional field sent as null', async () => {
    getChannel.mockReturnValue(
      channel({ fields: { token: 'bot-token-value', chatId: '12345', messageThreadId: '7' } }),
    );

    await callTool('update_channel', { channelId: 'c1', fields: { messageThreadId: null } });

    expect(upsertChannel.mock.calls[0][0].fields).toEqual({ token: 'bot-token-value', chatId: '12345' });
  });

  it('refuses to remove a field the channel cannot work without', async () => {
    const result = await callTool('update_channel', { channelId: 'c1', fields: { token: null } });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('"token"');
    expect(upsertChannel).not.toHaveBeenCalled();
  });

  it('refuses a field name the adapter does not have, rather than storing it beside the real one', async () => {
    const result = await callTool('update_channel', { channelId: 'c1', fields: { chatID: '999' } });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('"chatID"');
    expect(textOf(result)).toContain('chatId');
    expect(upsertChannel).not.toHaveBeenCalled();
  });

  it('still renames an older channel that is missing a field, when the call sends no fields', async () => {
    getChannel.mockReturnValue(channel({ fields: { chatId: '12345' } }));

    const result = await callTool('update_channel', { channelId: 'c1', name: 'Renamed' });

    expect(result.isError).toBeUndefined();
    expect(upsertChannel.mock.calls[0][0].fields).toEqual({ chatId: '12345' });
  });

  it('keeps the stored visibility when the call does not mention it', async () => {
    getChannel.mockReturnValue(channel({ visibility: 'everyone', userId: 'other' }));
    authenticateWriteToolCall.mockImplementation(async () => ({ user: ADMIN, error: null }));

    await callTool('update_channel', { channelId: 'c1', name: 'Renamed' });

    expect(upsertChannel.mock.calls[0][0].visibility).toBe('everyone');
  });

  it('refuses a channel the user may not edit', async () => {
    getChannel.mockReturnValue(channel({ userId: 'other' }));

    const result = await callTool('update_channel', { channelId: 'c1', name: 'Not mine' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('not allowed to change');
    expect(upsertChannel).not.toHaveBeenCalled();
  });

  it('refuses a channel that is not there', async () => {
    getChannel.mockReturnValue(null);

    const result = await callTool('update_channel', { channelId: 'gone', name: 'X' });

    expect(result.isError).toBe(true);
    expect(upsertChannel).not.toHaveBeenCalled();
  });
});

describe('delete_channel', () => {
  it('refuses without confirmation', async () => {
    const result = await callTool('delete_channel', { channelId: 'c1', confirmed: false });

    expect(result.isError).toBe(true);
    expect(removeChannel).not.toHaveBeenCalled();
  });

  it('names the jobs that still use the channel', async () => {
    getJobsUsingChannel.mockReturnValue([{ id: 'job-1', name: 'Köln rent' }]);

    const result = await callTool('delete_channel', { channelId: 'c1', confirmed: true });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Köln rent');
    expect(textOf(result)).toContain('update_job');
    expect(removeChannel).not.toHaveBeenCalled();
  });

  it('removes an unused channel once confirmed', async () => {
    const result = await callTool('delete_channel', { channelId: 'c1', confirmed: true });

    expect(removeChannel).toHaveBeenCalledWith('c1');
    expect(result.isError).toBeUndefined();
    expect(trackPoi).toHaveBeenCalledWith(TRACKING_POIS.MCP_CHANNEL_DELETED);
  });

  it('refuses a channel the user may not edit', async () => {
    getChannel.mockReturnValue(channel({ userId: 'other' }));

    const result = await callTool('delete_channel', { channelId: 'c1', confirmed: true });

    expect(result.isError).toBe(true);
    expect(removeChannel).not.toHaveBeenCalled();
  });
});

describe('test_channel', () => {
  it('fires the adapter with the stored values, not caller-supplied ones', async () => {
    const result = await callTool('test_channel', { channelId: 'c1' });

    expect(testFire).toHaveBeenCalledTimes(1);
    const [adapter, fields, options] = testFire.mock.calls[0];
    expect(adapter.config.id).toBe('telegram');
    expect(fields).toEqual({ token: 'bot-token-value', chatId: '12345' });
    expect(options).toEqual({ userId: 'u1' });
    expect(result.isError).toBeUndefined();
    expect(trackPoi).toHaveBeenCalledWith(TRACKING_POIS.MCP_CHANNEL_TESTED);
  });

  it('reports a failed send rather than answering OK', async () => {
    testFire.mockRejectedValue(new Error('chat not found'));

    const result = await callTool('test_channel', { channelId: 'c1' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('chat not found');
  });

  it('refuses a channel the user may not use', async () => {
    getChannel.mockReturnValue(channel({ userId: 'other', visibility: 'private' }));

    const result = await callTool('test_channel', { channelId: 'c1' });

    expect(result.isError).toBe(true);
    expect(testFire).not.toHaveBeenCalled();
  });
});
