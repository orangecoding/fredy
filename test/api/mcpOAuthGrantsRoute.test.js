/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../lib/mcp/mcpOAuthStorage.js', () => ({
  listGrants: vi.fn(),
  revokeGrant: vi.fn(),
}));

import { listGrants, revokeGrant } from '../../lib/mcp/mcpOAuthStorage.js';
import mcpOAuthGrantsPlugin from '../../lib/api/routes/mcpOAuthGrantsRoute.js';

/** Registers the plugin the way api.js does, with the session already resolved to a user. */
async function buildApp(userId = 'u1') {
  const app = Fastify();
  app.addHook('preHandler', async (request) => {
    request.session = { currentUser: userId };
  });
  await app.register(mcpOAuthGrantsPlugin, { prefix: '/api/user/mcp-oauth-grants' });
  await app.ready();
  return app;
}

beforeEach(() => vi.clearAllMocks());

/**
 * The page where somebody sees which connectors can read their listings, and takes that away
 * again. Scoped to the calling user on both ends, so a client id seen on one account is worthless
 * against another.
 */
describe('MCP OAuth grants', () => {
  it('lists the calling user’s grants', async () => {
    listGrants.mockReturnValue([{ clientId: 'c1', clientName: 'Claude', grantedAt: 1 }]);
    const app = await buildApp('u1');

    const response = await app.inject({ method: 'GET', url: '/api/user/mcp-oauth-grants' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([{ clientId: 'c1', clientName: 'Claude', grantedAt: 1 }]);
    expect(listGrants).toHaveBeenCalledWith('u1');
    await app.close();
  });

  it('revokes a grant for the calling user only', async () => {
    revokeGrant.mockReturnValue(true);
    const app = await buildApp('u1');

    const response = await app.inject({ method: 'DELETE', url: '/api/user/mcp-oauth-grants/c1' });

    expect(response.statusCode).toBe(200);
    expect(revokeGrant).toHaveBeenCalledWith('u1', 'c1');
    await app.close();
  });

  it('answers 404 when there is no such grant to revoke', async () => {
    revokeGrant.mockReturnValue(false);
    const app = await buildApp('u1');

    const response = await app.inject({ method: 'DELETE', url: '/api/user/mcp-oauth-grants/nope' });

    expect(response.statusCode).toBe(404);
    await app.close();
  });
});
