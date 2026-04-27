/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './mcpAdapter.js';
import { authenticateRequest } from './mcpAuthentication.js';
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
    return sessions.get(sessionId);
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
 * POST /api/mcp  – JSON-RPC messages
 * GET  /api/mcp  – SSE stream for server-initiated notifications
 * DELETE /api/mcp – session termination
 *
 * All endpoints require a valid Bearer token in the Authorization header.
 *
 * @param {import('fastify').FastifyInstance} fastify
 */
export function registerMcpRoutes(fastify) {
  fastify.post('/api/mcp', async (request, reply) => {
    const auth = authenticateRequest(request.raw);
    if (!auth) {
      return reply.code(401).send({ error: 'Unauthorized. Provide a valid Bearer token.' });
    }

    const sessionId = request.raw.headers['mcp-session-id'];
    const { server, transport } = getOrCreateSession(sessionId, auth);

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
      return reply.code(401).send({ error: 'Unauthorized. Provide a valid Bearer token.' });
    }

    const sessionId = request.raw.headers['mcp-session-id'];
    if (!sessionId || !sessions.has(sessionId)) {
      return reply.code(400).send({ error: 'Invalid or missing session. Send an initialize request first.' });
    }

    const { transport } = sessions.get(sessionId);
    reply.hijack();
    await transport.handleRequest(request.raw, reply.raw);
  });

  fastify.delete('/api/mcp', async (request, reply) => {
    const auth = authenticateRequest(request.raw);
    if (!auth) {
      return reply.code(401).send({ error: 'Unauthorized. Provide a valid Bearer token.' });
    }

    const sessionId = request.raw.headers['mcp-session-id'];
    if (!sessionId || !sessions.has(sessionId)) {
      return reply.code(404).send({ error: 'Session not found.' });
    }

    const { transport } = sessions.get(sessionId);
    await transport.close();
    sessions.delete(sessionId);
    return { ok: true };
  });

  logger.debug('MCP Streamable HTTP endpoint registered at /api/mcp');
}
