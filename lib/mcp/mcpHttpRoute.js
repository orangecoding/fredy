/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './mcpAdapter.js';
import { authenticateRequest } from './mcpAuthentication.js';
import { getSettings } from '../services/storage/settingsStorage.js';
import logger from '../services/logger.js';
import crypto from 'crypto';

/**
 * Active transports keyed by session id.
 * @type {Map<string, { server: McpServer, transport: StreamableHTTPServerTransport }>}
 */
const sessions = new Map();

/**
 * @param {string|undefined} sessionId
 * @param {{ userId: string }} auth
 */
function getOrCreateSession(sessionId, auth) {
  if (sessionId && sessions.has(sessionId)) {
    const entry = sessions.get(sessionId);
    return entry.userId === auth.userId ? entry : null;
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
    onsessioninitialized: (sid) => {
      sessions.set(sid, entry);
      logger.debug(`MCP session created: ${sid}`);
    },
  });

  const server = createMcpServer();
  const entry = { server, transport, userId: auth.userId };

  transport.onclose = () => {
    const sid = transport.sessionId;
    if (sid) {
      sessions.delete(sid);
      logger.debug(`MCP session closed: ${sid}`);
    }
  };

  return entry;
}

/**
 * Register MCP Streamable HTTP routes on a fastify instance.
 *
 * POST /api/mcp  - JSON-RPC messages
 * GET  /api/mcp  - SSE stream for server-initiated notifications
 * DELETE /api/mcp - session termination
 *
 * All endpoints require a valid Bearer token in the Authorization header.
 *
 * @param {import('fastify').FastifyInstance} fastify
 */
export function registerMcpRoutes(fastify) {
  const unauthorized = async (request, reply) => {
    const settings = await getSettings();
    const baseUrl = typeof settings.baseUrl === 'string' ? settings.baseUrl.trim().replace(/\/$/, '') : '';
    if (baseUrl)
      reply.header(
        'www-authenticate',
        `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource/api/mcp"`,
      );
    return reply.code(401).send({ error: 'Unauthorized. Provide a valid Bearer token.' });
  };

  fastify.post('/api/mcp', async (request, reply) => {
    const auth = authenticateRequest(request.raw);
    if (!auth) {
      return unauthorized(request, reply);
    }

    const sessionId = request.raw.headers['mcp-session-id'];
    const entry = getOrCreateSession(sessionId, auth);
    if (!entry) return reply.code(403).send({ error: 'MCP session belongs to another user.' });
    const { server, transport } = entry;

    if (!transport.onmessage) {
      await server.connect(transport);
    }

    request.raw.auth = { userId: auth.userId };

    reply.hijack();
    await transport.handleRequest(request.raw, reply.raw, request.body);
  });

  fastify.get('/api/mcp', async (request, reply) => {
    const auth = authenticateRequest(request.raw);
    if (!auth) {
      return unauthorized(request, reply);
    }

    const sessionId = request.raw.headers['mcp-session-id'];
    if (!sessionId || !sessions.has(sessionId)) {
      return reply.code(400).send({ error: 'Invalid or missing session. Send an initialize request first.' });
    }

    const entry = sessions.get(sessionId);
    if (entry.userId !== auth.userId) return reply.code(403).send({ error: 'MCP session belongs to another user.' });
    const { transport } = entry;
    reply.hijack();
    await transport.handleRequest(request.raw, reply.raw);
  });

  fastify.delete('/api/mcp', async (request, reply) => {
    const auth = authenticateRequest(request.raw);
    if (!auth) {
      return unauthorized(request, reply);
    }

    const sessionId = request.raw.headers['mcp-session-id'];
    if (!sessionId || !sessions.has(sessionId)) {
      return reply.code(404).send({ error: 'Session not found.' });
    }

    const entry = sessions.get(sessionId);
    if (entry.userId !== auth.userId) return reply.code(403).send({ error: 'MCP session belongs to another user.' });
    const { transport } = entry;
    await transport.close();
    sessions.delete(sessionId);
    return { ok: true };
  });

  logger.debug('MCP Streamable HTTP endpoint registered at /api/mcp');
}
