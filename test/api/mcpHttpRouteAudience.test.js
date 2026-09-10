/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../lib/mcp/mcpOAuthStorage.js', () => ({
  validateAccessToken: vi.fn(() => null),
}));
vi.mock('../../lib/services/storage/userStorage.js', () => ({
  getUser: vi.fn(),
  validateMcpToken: vi.fn(() => null),
}));
vi.mock('../../lib/services/storage/settingsStorage.js', () => ({
  getSettings: vi.fn(async () => ({ baseUrl: 'https://fredy.example/' })),
}));

import { validateAccessToken } from '../../lib/mcp/mcpOAuthStorage.js';
import { registerMcpRoutes } from '../../lib/mcp/mcpHttpRoute.js';

beforeEach(() => vi.clearAllMocks());

/**
 * The token audience is bound to the configured public base URL, not to whatever Host header the
 * request happened to carry. Behind a proxy the two routinely differ, and a client-controlled
 * value is no audience check at all.
 */
describe('MCP access token audience', () => {
  it('checks the token against the configured base URL rather than the request host', async () => {
    const app = Fastify();
    registerMcpRoutes(app);
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/mcp',
      headers: { authorization: 'Bearer abc', host: 'internal:9998' },
      payload: {},
    });

    expect(response.statusCode).toBe(401);
    expect(validateAccessToken).toHaveBeenCalledWith('abc', 'https://fredy.example/api/mcp');
    expect(response.headers['www-authenticate']).toBe(
      'Bearer resource_metadata="https://fredy.example/.well-known/oauth-protected-resource/api/mcp"',
    );
    await app.close();
  });
});

/**
 * The SDK copies `req.auth` into the `authInfo` every tool handler is handed. The scopes have to be
 * on it: without them a token approved for reading only arrives at the write tools looking exactly
 * like one approved for everything.
 */
describe('the token scopes reach the tool handlers', () => {
  it('puts them on the raw request alongside the user id', async () => {
    validateAccessToken.mockReturnValue({ userId: 'u1', scopes: ['mcp:read'] });

    /** @type {any} */
    let seen = null;
    const app = Fastify();
    // The route hijacks the reply and hands `request.raw` straight to the SDK transport, so there
    // is no later hook to read the assignment back from. Watching the property itself is.
    app.addHook('onRequest', (request, _reply, done) => {
      Object.defineProperty(request.raw, 'auth', {
        configurable: true,
        get: () => seen,
        set: (value) => {
          seen = value;
        },
      });
      done();
    });
    registerMcpRoutes(app);
    await app.ready();

    await app.inject({
      method: 'POST',
      url: '/api/mcp',
      headers: { authorization: 'Bearer abc' },
      payload: {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } },
      },
    });

    expect(seen).toEqual({ userId: 'u1', scopes: ['mcp:read'] });
    await app.close();
  });
});
