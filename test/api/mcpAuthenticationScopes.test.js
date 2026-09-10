/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../lib/services/storage/userStorage.js', () => ({
  getUser: vi.fn(() => ({ id: 'u1', isAdmin: false })),
  validateMcpToken: vi.fn(() => ({ userId: 'u1' })),
}));
vi.mock('../../lib/mcp/mcpOAuthStorage.js', () => ({
  validateAccessToken: vi.fn(() => ({ userId: 'u1', scopes: ['mcp:read'] })),
}));
vi.mock('../../lib/services/storage/settingsStorage.js', () => ({
  getSettings: vi.fn(async () => ({ demoMode: false })),
}));

import { getUser } from '../../lib/services/storage/userStorage.js';
import { getSettings } from '../../lib/services/storage/settingsStorage.js';
import {
  authenticateRequest,
  authenticateToolCall,
  authenticateWriteToolCall,
} from '../../lib/mcp/mcpAuthentication.js';

const extra = (authInfo) => ({ authInfo });

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockReturnValue({ id: 'u1', isAdmin: false });
  getSettings.mockResolvedValue({ demoMode: false });
});

describe('the write gate honours the scope the connection was approved for', () => {
  it('lets a connection through that was granted write access', async () => {
    const { user, error } = await authenticateWriteToolCall(
      extra({ userId: 'u1', scopes: ['mcp:read', 'mcp:write'] }),
      'add_listing_note',
    );

    expect(error).toBeNull();
    expect(user.id).toBe('u1');
  });

  it('turns away a read-only connection, and says how to fix it', async () => {
    const { user, error } = await authenticateWriteToolCall(
      extra({ userId: 'u1', scopes: ['mcp:read'] }),
      'watch_listing',
    );

    expect(user).toBeNull();
    expect(error).toContain('read access only');
    expect(error).toContain('reconnect');
  });

  it('lets a token that carries no scopes at all through', async () => {
    // A manually issued `fredy_` token, and every stdio connection. There was no consent page to
    // promise less than full access, and there is no way to ask for more.
    const { error } = await authenticateWriteToolCall(extra({ userId: 'u1' }), 'watch_listing');
    expect(error).toBeNull();
  });

  it('still refuses an unauthenticated caller', async () => {
    const { user, error } = await authenticateWriteToolCall(extra({}), 'watch_listing');

    expect(user).toBeNull();
    expect(error).toContain('Authentication required');
  });

  it('refuses a user id that no longer resolves', async () => {
    getUser.mockReturnValue(null);
    const { error } = await authenticateWriteToolCall(
      extra({ userId: 'gone', scopes: ['mcp:write'] }),
      'watch_listing',
    );
    expect(error).toContain('Authentication required');
  });

  it('leaves the read tools alone - scopes do not narrow reading', () => {
    const { user, error } = authenticateToolCall(extra({ userId: 'u1', scopes: ['mcp:read'] }), 'list_jobs');

    expect(error).toBeNull();
    expect(user.id).toBe('u1');
  });
});

describe('the demo is read-only over MCP', () => {
  it('refuses a non-admin while demo mode is on', async () => {
    getSettings.mockResolvedValue({ demoMode: true });

    const { user, error } = await authenticateWriteToolCall(extra({ userId: 'u1' }), 'create_job_from_draft');

    expect(user).toBeNull();
    expect(error).toContain('read-only demo');
  });

  it('lets the admin through, so the demo instance stays maintainable', async () => {
    getSettings.mockResolvedValue({ demoMode: true });
    getUser.mockReturnValue({ id: 'admin', isAdmin: true });

    const { error } = await authenticateWriteToolCall(extra({ userId: 'admin' }), 'create_job_from_draft');

    expect(error).toBeNull();
  });

  it('reads the setting live, so switching the demo off takes effect without a restart', async () => {
    getSettings.mockResolvedValue({ demoMode: true });
    expect((await authenticateWriteToolCall(extra({ userId: 'u1' }), 'watch_listing')).error).not.toBeNull();

    getSettings.mockResolvedValue({ demoMode: false });
    expect((await authenticateWriteToolCall(extra({ userId: 'u1' }), 'watch_listing')).error).toBeNull();
  });
});

describe('scopes survive the trip from the token to the tool call', () => {
  it('carries them out of an OAuth token', () => {
    const auth = authenticateRequest({ headers: { authorization: 'Bearer oauth-token' } }, 'https://fredy/api/mcp');
    expect(auth).toEqual({ userId: 'u1', scopes: ['mcp:read'] });
  });

  it('reports none for a manually issued token', () => {
    const auth = authenticateRequest({ headers: { authorization: 'Bearer fredy_abc' } }, 'https://fredy/api/mcp');
    expect(auth).toEqual({ userId: 'u1' });
    expect(auth.scopes).toBeUndefined();
  });
});
