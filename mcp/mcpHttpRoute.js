/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './mcpAdapter.js';
import { authenticateRequest } from './mcpAuthentication.js';
import logger from '../lib/services/logger.js';
import crypto from 'crypto';

/**
 * Active transports keyed by session id.
 * Each session gets its own McpServer + StreamableHTTPServerTransport pair.
 * @type {Map<string, { server: McpServer, transport: StreamableHTTPServerTransport }>}
 */
const sessions = new Map();

/**
 * Get or create a session for the given session id with authentication.
 * @param {string|undefined} sessionId
 * @param {{ userId: string }} auth
 * @returns {{ server: McpServer, transport: StreamableHTTPServerTransport }}
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
 * Register MCP Streamable HTTP routes on a restana service.
 *
 * Mounts handlers at /api/mcp to handle the MCP Streamable HTTP protocol:
 * - POST /api/mcp  – JSON-RPC messages (initialize, tool calls, etc.)
 * - GET  /api/mcp  – SSE stream for server-initiated notifications
 * - DELETE /api/mcp – session termination
 *
 * All endpoints require a valid Bearer token in the Authorization header.
 *
 * @param {import('restana').Service} service - The restana service instance.
 */
export function registerMcpRoutes(service) {
  // POST – main JSON-RPC endpoint
  service.post('/api/mcp', async (req, res) => {
    const auth = authenticateRequest(req);
    if (!auth) {
      res.statusCode = 401;
      return res.send({ error: 'Unauthorized. Provide a valid Bearer token.' });
    }

    const sessionId = req.headers['mcp-session-id'];
    const { server, transport } = getOrCreateSession(sessionId, auth);

    // Connect server to transport if not already connected
    if (!transport.onmessage) {
      await server.connect(transport);
    }

    // Inject authInfo so tools can access the authenticated user
    req.auth = { userId: auth.userId };

    await transport.handleRequest(req, res, req.body);
  });

  // GET – SSE stream for server-initiated messages
  service.get('/api/mcp', async (req, res) => {
    const auth = authenticateRequest(req);
    if (!auth) {
      res.statusCode = 401;
      return res.send({ error: 'Unauthorized. Provide a valid Bearer token.' });
    }

    const sessionId = req.headers['mcp-session-id'];
    if (!sessionId || !sessions.has(sessionId)) {
      res.statusCode = 400;
      return res.send({ error: 'Invalid or missing session. Send an initialize request first.' });
    }

    const { transport } = sessions.get(sessionId);
    await transport.handleRequest(req, res);
  });

  // DELETE – terminate session
  service.delete('/api/mcp', async (req, res) => {
    const auth = authenticateRequest(req);
    if (!auth) {
      res.statusCode = 401;
      return res.send({ error: 'Unauthorized. Provide a valid Bearer token.' });
    }

    const sessionId = req.headers['mcp-session-id'];
    if (!sessionId || !sessions.has(sessionId)) {
      res.statusCode = 404;
      return res.send({ error: 'Session not found.' });
    }

    const { transport } = sessions.get(sessionId);
    await transport.close();
    sessions.delete(sessionId);
    res.statusCode = 200;
    res.send({ ok: true });
  });

  logger.debug('MCP Streamable HTTP endpoint registered at /api/mcp');
}
