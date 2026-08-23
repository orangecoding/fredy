/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../lib/mcp/mcpOAuthStorage.js', () => ({
  createClient: vi.fn(),
  createAuthorizationCode: vi.fn(),
  getClient: vi.fn(),
  redeemAuthorizationCode: vi.fn(),
  refreshAccessToken: vi.fn(),
}));
vi.mock('../../lib/services/storage/settingsStorage.js', () => ({
  getSettings: vi.fn(async () => ({ baseUrl: 'https://fredy.example' })),
}));

import { createClient, getClient } from '../../lib/mcp/mcpOAuthStorage.js';
import { registerMcpOAuthRoutes } from '../../lib/mcp/mcpOAuthRoute.js';

async function buildApp() {
  const app = Fastify();
  await registerMcpOAuthRoutes(app);
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MCP OAuth discovery', () => {
  it('advertises protected-resource metadata from the MCP endpoint', async () => {
    const app = await buildApp();

    const response = await app.inject({ method: 'GET', url: '/.well-known/oauth-protected-resource/api/mcp' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      resource: 'https://fredy.example/api/mcp',
      authorization_servers: ['https://fredy.example'],
      scopes_supported: ['mcp:read'],
    });
    await app.close();
  });

  it('dynamically registers a public client with exact redirect URIs', async () => {
    createClient.mockReturnValue({ clientId: 'client-1', redirectUris: ['https://claude.ai/oauth/callback'] });
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/oauth/register',
      payload: {
        client_name: 'Claude',
        redirect_uris: ['https://claude.ai/oauth/callback'],
        grant_types: ['authorization_code', 'refresh_token'],
        token_endpoint_auth_method: 'none',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(createClient).toHaveBeenCalledWith({
      clientName: 'Claude',
      redirectUris: ['https://claude.ai/oauth/callback'],
    });
    expect(response.json()).toMatchObject({
      client_id: 'client-1',
      redirect_uris: ['https://claude.ai/oauth/callback'],
      token_endpoint_auth_method: 'none',
    });
    await app.close();
  });

  it('rejects dynamic registration with an insecure redirect URI', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/oauth/register',
      payload: { redirect_uris: ['http://attacker.example/callback'] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'invalid_redirect_uri' });
    expect(createClient).not.toHaveBeenCalled();
    await app.close();
  });

  it('accepts form-encoded OAuth token requests', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/oauth/token',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'grant_type=unsupported',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'invalid_request' });
    await app.close();
  });

  it('returns an unauthenticated user to the validated authorization request after login', async () => {
    getClient.mockReturnValue({ clientId: 'client-1', redirectUris: ['https://claude.ai/oauth/callback'] });
    const app = await buildApp();
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: 'client-1',
      redirect_uri: 'https://claude.ai/oauth/callback',
      code_challenge: 'a'.repeat(43),
      code_challenge_method: 'S256',
      resource: 'https://fredy.example/api/mcp',
      scope: 'mcp:read',
    });

    const response = await app.inject({ method: 'GET', url: `/api/oauth/authorize?${query}` });

    expect(response.statusCode).toBe(401);
    expect(response.body).toContain('/#/login?returnTo=%2Fapi%2Foauth%2Fauthorize%3F');
    await app.close();
  });
});

describe('MCP OAuth route encapsulation', () => {
  it('keeps the form-encoded parser away from the rest of the application', async () => {
    const app = Fastify();
    app.post('/api/elsewhere', async (request) => request.body);
    await registerMcpOAuthRoutes(app);
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/elsewhere',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'a=1',
    });

    expect(response.statusCode).toBe(415);
    await app.close();
  });

  it('rate limits dynamic client registration per address', async () => {
    createClient.mockReturnValue({ clientId: 'client-1', redirectUris: ['https://claude.ai/oauth/callback'] });
    const app = await buildApp();
    const register = (ip) =>
      app.inject({
        method: 'POST',
        url: '/api/oauth/register',
        remoteAddress: ip,
        payload: { redirect_uris: ['https://claude.ai/oauth/callback'] },
      });

    const statuses = [];
    for (let i = 0; i < 11; i++) statuses.push((await register('203.0.113.7')).statusCode);

    expect(statuses.slice(0, 10).every((status) => status === 201)).toBe(true);
    expect(statuses[10]).toBe(429);
    expect((await register('203.0.113.8')).statusCode).toBe(201);
    await app.close();
  });
});
