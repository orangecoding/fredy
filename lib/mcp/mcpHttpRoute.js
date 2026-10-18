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

/** A session nobody has used for this long is closed. Clients reconnect with a fresh initialize. */
const IDLE_MS = 30 * 60 * 1000;
/** How many open sessions one user may hold; the oldest goes first beyond that. */
const MAX_PER_USER = 20;

/**
 * Close sessions that went quiet, and the oldest of a user who holds too many.
 *
 * The SDK only removes a session on an explicit DELETE, which remote connectors rarely send: they
 * initialize a new one on every reconnect. Without this the server instances piled up until restart.
 *
 * @param {number} [now]
 * @returns {void}
 */
export function sweepSessions(now = Date.now()) {
  const perUser = new Map();
  for (const [sid, entry] of sessions) {
    if (now - (entry.lastSeen ?? now) > IDLE_MS) {
      closeSession(sid, entry);
      continue;
    }
    perUser.set(entry.userId, [...(perUser.get(entry.userId) ?? []), [sid, entry]]);
  }
  for (const list of perUser.values()) {
    list
      .sort((a, b) => (a[1].lastSeen ?? 0) - (b[1].lastSeen ?? 0))
      .slice(0, Math.max(0, list.length - MAX_PER_USER))
      .forEach(([sid, entry]) => closeSession(sid, entry));
  }
}

/**
 * @param {string} sid
 * @param {{ transport: StreamableHTTPServerTransport }} entry
 * @returns {void}
 */
function closeSession(sid, entry) {
  sessions.delete(sid);
  entry.transport.close?.().catch?.(() => {});
}

setInterval(sweepSessions, 5 * 60 * 1000).unref?.();

/** Test seam: the live map, for the sweep's tests only. */
export const _sessions = sessions;

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
  const entry = { server, transport, userId: auth.userId, lastSeen: Date.now() };

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
    entry.lastSeen = Date.now();
    return entry;
  };

  fastify.post('/api/mcp', async (request, reply) => {
    const auth = await authenticate(request, reply);
    if (!auth) return reply;

    const existing = ownedSession(request, reply, auth);
    if (existing === null) return reply;
    const session = existing ?? createSession(auth);
    session.lastSeen = Date.now();
    const { server, transport } = session;

    if (!transport.onmessage) {
      await server.connect(transport);
    }

    // The SDK copies `req.auth` into the `authInfo` each tool handler is given. The scopes have to
    // travel with the user id: without them a token approved for reading only would reach the write
    // tools indistinguishable from one approved for everything.
    request.raw.auth = { userId: auth.userId, scopes: auth.scopes };

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
