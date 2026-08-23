/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './mcpAdapter.js';
import { authenticateRequest } from './mcpAuthentication.js';
import { mcpOAuthUrls } from './mcpOAuthUrls.js';
import logger from '../services/logger.js';
import crypto from 'crypto';

/**
 * Active transports keyed by session id.
 * @type {Map<string, { server: McpServer, transport: StreamableHTTPServerTransport, userId: string }>}
 */
const sessions = new Map();

/**
 * Open a fresh session for the caller. It is registered under its id once the transport has one.
 * @param {{ userId: string }} auth
 */
function createSession(auth) {
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
  /**
   * Resolve the caller, or answer 401 pointing OAuth-capable clients at the resource metadata.
   * @param {import('fastify').FastifyRequest} request
   * @param {import('fastify').FastifyReply} reply
   * @returns {Promise<{userId: string} | null>}
   */
  const authenticate = async (request, reply) => {
    const urls = await mcpOAuthUrls();
    const auth = authenticateRequest(request.raw, urls?.resource ?? null);
    if (auth) return auth;
    if (urls) {
      reply.header(
        'www-authenticate',
        `Bearer resource_metadata="${urls.baseUrl}/.well-known/oauth-protected-resource/api/mcp"`,
      );
    }
    reply.code(401).send({ error: 'Unauthorized. Provide a valid Bearer token.' });
    return null;
  };

  /**
   * Find the caller's existing session, if the request names one.
   *
   * A session id is not a secret, so it is only honoured together with the credential it was
   * opened with; a valid token of one user must not attach to another user's transport.
   *
   * @param {import('fastify').FastifyRequest} request
   * @param {import('fastify').FastifyReply} reply
   * @param {{userId: string}} auth
   * @returns {{server: McpServer, transport: StreamableHTTPServerTransport, userId: string} | null | undefined}
   *   The entry; `undefined` when no such session exists; `null` after a 403 has been sent.
   */
  const ownedSession = (request, reply, auth) => {
    const sessionId = request.raw.headers['mcp-session-id'];
    const entry = sessionId ? sessions.get(sessionId) : undefined;
    if (!entry) return undefined;
    if (entry.userId !== auth.userId) {
      reply.code(403).send({ error: 'MCP session belongs to another user.' });
      return null;
    }
    return entry;
  };

  fastify.post('/api/mcp', async (request, reply) => {
    const auth = await authenticate(request, reply);
    if (!auth) return reply;

    const existing = ownedSession(request, reply, auth);
    if (existing === null) return reply;
    const { server, transport } = existing ?? createSession(auth);

    if (!transport.onmessage) {
      await server.connect(transport);
    }

    request.raw.auth = { userId: auth.userId };

    reply.hijack();
    await transport.handleRequest(request.raw, reply.raw, request.body);
  });

  fastify.get('/api/mcp', async (request, reply) => {
    const auth = await authenticate(request, reply);
    if (!auth) return reply;

    const entry = ownedSession(request, reply, auth);
    if (entry === null) return reply;
    if (!entry) {
      return reply.code(400).send({ error: 'Invalid or missing session. Send an initialize request first.' });
    }

    const { transport } = entry;
    reply.hijack();
    await transport.handleRequest(request.raw, reply.raw);
  });

  fastify.delete('/api/mcp', async (request, reply) => {
    const auth = await authenticate(request, reply);
    if (!auth) return reply;

    const entry = ownedSession(request, reply, auth);
    if (entry === null) return reply;
    if (!entry) {
      return reply.code(404).send({ error: 'Session not found.' });
    }

    const { transport } = entry;
    await transport.close();
    sessions.delete(transport.sessionId);
    return { ok: true };
  });

  logger.debug('MCP Streamable HTTP endpoint registered at /api/mcp');
}
