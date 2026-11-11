/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

vi.mock('../../lib/services/storage/settingsStorage.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getSettings: vi.fn(async () => ({ demoMode: false })),
  getUserSettings: vi.fn(() => ({})),
  upsertSettings: vi.fn(),
}));
vi.mock('../../lib/services/storage/userStorage.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getUser: vi.fn(() => ({ id: 'u1', isAdmin: false })),
  validateMcpToken: vi.fn(() => ({ userId: 'u1' })),
}));

import { getSettings, getUserSettings, upsertSettings } from '../../lib/services/storage/settingsStorage.js';
import { getMcpServerSettings, mcpToolRefusal } from '../../lib/mcp/mcpUserSettings.js';
import { authenticateToolCall } from '../../lib/mcp/mcpAuthentication.js';
import { applyMcpToolSettings, createMcpServer, mcpToolCatalog } from '../../lib/mcp/mcpAdapter.js';
import { registerMcpRoutes } from '../../lib/mcp/mcpHttpRoute.js';
import mcpServerSettingsPlugin from '../../lib/api/routes/mcpServerSettingsRoute.js';

/**
 * Store `value` as the calling user's MCP server setting.
 *
 * @param {object|undefined} value
 * @returns {void}
 */
const storeSetting = (value) => getUserSettings.mockReturnValue(value === undefined ? {} : { mcp_server: value });

/**
 * Connect a client to `server` and return the names it is offered.
 *
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @returns {Promise<{client: Client, names: () => Promise<string[]>}>}
 */
async function connect(server) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, names: async () => (await client.listTools()).tools.map((tool) => tool.name) };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSettings.mockResolvedValue({ demoMode: false });
  storeSetting(undefined);
});

describe('the stored setting', () => {
  it('means on, with every tool, for a user who never saved it', () => {
    // The server existed long before the switch did. Off by default would have cut off every client
    // connected before the upgrade.
    expect(getMcpServerSettings('u1')).toEqual({ enabled: true, disabledTools: [] });
  });

  it('reads back what was saved', () => {
    storeSetting({ enabled: false, disabledTools: ['watch_listing'] });
    expect(getMcpServerSettings('u1')).toEqual({ enabled: false, disabledTools: ['watch_listing'] });
  });

  it('ignores a malformed list rather than refusing every tool', () => {
    storeSetting({ enabled: true, disabledTools: 'watch_listing' });
    expect(getMcpServerSettings('u1').disabledTools).toEqual([]);
  });
});

describe('the tool call gate', () => {
  const extra = { authInfo: { userId: 'u1' } };

  it('lets a call through while the server and the tool are on', () => {
    expect(authenticateToolCall(extra, 'list_jobs')).toEqual({ user: { id: 'u1', isAdmin: false }, error: null });
  });

  it('refuses every tool while the server is off, and says where to turn it back on', () => {
    storeSetting({ enabled: false, disabledTools: [] });
    const { user, error } = authenticateToolCall(extra, 'list_jobs');
    expect(user).toBeNull();
    expect(error).toContain('turned off');
    expect(error).toContain('Settings → MCP server');
  });

  it('refuses only the tool that was turned off', () => {
    storeSetting({ enabled: true, disabledTools: ['get_listing'] });
    expect(authenticateToolCall(extra, 'get_listing').error).toContain('get_listing');
    expect(authenticateToolCall(extra, 'list_jobs').error).toBeNull();
  });

  it('is what the write tools go through as well', () => {
    storeSetting({ enabled: true, disabledTools: ['watch_listing'] });
    expect(mcpToolRefusal('u1', 'watch_listing')).toContain('watch_listing');
  });
});

describe('the tools a client is offered', () => {
  it('leaves out the tools a user turned off, and brings them back once turned on', async () => {
    const server = createMcpServer();
    const { client, names } = await connect(server);

    applyMcpToolSettings(server, { enabled: true, disabledTools: ['get_listing', 'watch_listing'] });
    const trimmed = await names();
    expect(trimmed).not.toContain('get_listing');
    expect(trimmed).not.toContain('watch_listing');
    expect(trimmed).toContain('list_jobs');

    applyMcpToolSettings(server, { enabled: true, disabledTools: [] });
    expect(await names()).toContain('get_listing');
    await client.close();
  });

  it('offers nothing while the server is off', async () => {
    const server = createMcpServer();
    const { client, names } = await connect(server);
    applyMcpToolSettings(server, { enabled: false, disabledTools: [] });
    expect(await names()).toEqual([]);
    await client.close();
  });

  it('tells a connected client only when the list really changed', async () => {
    // Applied on every request: a notification each time would have the client re-fetch the list
    // on every call it makes.
    const server = createMcpServer();
    const { client } = await connect(server);
    const changed = vi.fn();
    const { ToolListChangedNotificationSchema } = await import('@modelcontextprotocol/sdk/types.js');
    client.setNotificationHandler(ToolListChangedNotificationSchema, changed);

    applyMcpToolSettings(server, { enabled: true, disabledTools: [] });
    applyMcpToolSettings(server, { enabled: true, disabledTools: ['get_job'] });
    applyMcpToolSettings(server, { enabled: true, disabledTools: ['get_job'] });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(changed).toHaveBeenCalledTimes(1);
    await client.close();
  });
});

describe('the tool catalog the settings page lists', () => {
  it('describes every tool the server offers, as the server describes it', async () => {
    const { client } = await connect(createMcpServer());
    const { tools } = await client.listTools();
    await client.close();

    const catalog = mcpToolCatalog();
    expect(catalog.map((tool) => tool.name)).toEqual(tools.map((tool) => tool.name));
    for (const listed of tools) {
      const entry = catalog.find((tool) => tool.name === listed.name);
      expect(entry.description).toBe(listed.description);
      expect(entry.title).toBe(listed.annotations.title);
      expect(entry.readOnly).toBe(listed.annotations.readOnlyHint === true);
    }
  });
});

describe('GET and POST /api/user/mcp-server', () => {
  /**
   * @param {{isAdmin?: boolean}} [options]
   * @returns {Promise<import('fastify').FastifyInstance>}
   */
  async function buildApp({ isAdmin = false } = {}) {
    const app = Fastify();
    app.addHook('preHandler', async (request) => {
      request.session = { currentUser: 'u1' };
      request.currentUser = { id: 'u1', isAdmin };
    });
    await app.register(mcpServerSettingsPlugin, { prefix: '/api/user/mcp-server' });
    await app.ready();
    return app;
  }

  const post = (app, payload) => app.inject({ method: 'POST', url: '/api/user/mcp-server', payload });

  it('answers with the switches and every tool there is', async () => {
    storeSetting({ enabled: true, disabledTools: ['get_job', 'a_tool_since_removed'] });
    const app = await buildApp();

    const response = await app.inject({ method: 'GET', url: '/api/user/mcp-server' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.enabled).toBe(true);
    // A name no tool answers to any more is dropped, so the page never posts it back.
    expect(body.disabledTools).toEqual(['get_job']);
    expect(body.tools).toEqual(mcpToolCatalog());
    await app.close();
  });

  it('saves both switches for the calling user', async () => {
    const app = await buildApp();

    const response = await post(app, { enabled: false, disabledTools: ['get_job', 'get_job', 'watch_listing'] });

    expect(response.statusCode).toBe(200);
    expect(upsertSettings).toHaveBeenCalledWith(
      { mcp_server: { enabled: false, disabledTools: ['get_job', 'watch_listing'] } },
      'u1',
    );
    await app.close();
  });

  it('refuses a switch that is not true or false', async () => {
    const app = await buildApp();
    expect((await post(app, { enabled: 'yes', disabledTools: [] })).statusCode).toBe(400);
    expect(upsertSettings).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuses a tool name the server does not have', async () => {
    const app = await buildApp();
    const response = await post(app, { enabled: true, disabledTools: ['drop_database'] });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain('drop_database');
    expect(upsertSettings).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuses a change in demo mode unless the caller is an admin', async () => {
    getSettings.mockResolvedValue({ demoMode: true });
    const app = await buildApp();
    expect((await post(app, { enabled: false, disabledTools: [] })).statusCode).toBe(403);
    await app.close();

    const adminApp = await buildApp({ isAdmin: true });
    expect((await post(adminApp, { enabled: false, disabledTools: [] })).statusCode).toBe(200);
    await adminApp.close();
  });
});

describe('the MCP endpoint while the server is off', () => {
  it('turns the caller away before a session is opened', async () => {
    storeSetting({ enabled: false, disabledTools: [] });
    const app = Fastify();
    registerMcpRoutes(app);
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/mcp',
      headers: { authorization: 'Bearer fredy_token' },
      payload: {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } },
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error).toContain('turned off');
    await app.close();
  });
});
