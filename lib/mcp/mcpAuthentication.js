/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * MCP Authentication Layer
 *
 * Centralizes all authentication and authorization logic for MCP tool calls
 * and HTTP requests. Ensures consistent access control across all transports.
 */

import { getUser, validateMcpToken } from '../services/storage/userStorage.js';
import { canAccessJob } from '../services/security/access.js';
import { validateAccessToken } from './mcpOAuthStorage.js';
import { getSettings } from '../services/storage/settingsStorage.js';

/**
 * The scope a connection needs before it may change anything.
 *
 * Remote connectors approved before write tools existed hold a token carrying only `mcp:read`, and
 * the consent page they were approved on promised exactly that. Enforcing the scope here is what
 * stops those grants quietly gaining the ability to create jobs and rewrite notes.
 * @type {string}
 */
export const WRITE_SCOPE = 'mcp:write';

/**
 * Authenticate an MCP tool call by extracting and validating the user from authInfo.
 *
 * Call sites pass their own tool name as a second argument. It is ignored here - it is there so a
 * future per-tool rule does not have to touch every one of them again.
 *
 * @param {{ authInfo?: { userId?: string, scopes?: string[] } }} extra - The extra context passed by
 *   the MCP SDK.
 * @returns {{ user: object|null, error: string|null }}
 *   - On success: { user: <userObject>, error: null }
 *   - On failure: { user: null, error: <errorMessage> }
 */
export function authenticateToolCall(extra) {
  const userId = extra?.authInfo?.userId;
  if (!userId) {
    return { user: null, error: 'Authentication required. Please provide a valid MCP API token.' };
  }

  const user = getUser(userId);
  if (!user) {
    return { user: null, error: 'Authentication required. Please provide a valid MCP API token.' };
  }

  return { user, error: null };
}

/**
 * Authenticate a tool call that is going to change something.
 *
 * Three gates rather than one, because they fail for three different reasons and an LLM relaying
 * the message to a user can only act on the difference: not signed in at all, signed in over a
 * connection that was only ever approved for reading, or signed in to the public demo.
 *
 * Async because the demo gate reads live settings - the demo can be switched off without a restart,
 * and a cached answer would keep refusing writes afterwards.
 *
 * @param {{ authInfo?: { userId?: string, scopes?: string[] } }} extra
 * @param {string} [toolName]
 * @returns {Promise<{ user: object|null, error: string|null }>}
 */
export async function authenticateWriteToolCall(extra, toolName) {
  const { user, error } = authenticateToolCall(extra, toolName);
  if (error) return { user, error };

  // Only OAuth tokens carry scopes. A manually issued `fredy_` token and the stdio transport have
  // no scope list at all, and those are full-access by construction - the user pasted the token
  // into their own client, there was no consent page to promise less.
  const scopes = extra?.authInfo?.scopes;
  if (Array.isArray(scopes) && !scopes.includes(WRITE_SCOPE)) {
    return {
      user: null,
      error:
        'This connection was authorized for read access only. Disconnect and reconnect Fredy in your client to grant write access.',
    };
  }

  const settings = await getSettings();
  if (settings?.demoMode && user.isAdmin !== true) {
    return {
      user: null,
      error: 'This is a read-only demo of Fredy. Creating jobs, notes and watchlist entries is disabled here.',
    };
  }

  return { user, error: null };
}

/**
 * Check whether a user has access to a specific job.
 *
 * Delegates to the shared rule rather than restating it - this used to be a fourth copy of "owner,
 * shared with, or admin", and copies of that rule are how routes end up quietly missing it.
 *
 * @param {object} user - The authenticated user object.
 * @param {object} job - The job object from storage.
 * @returns {boolean} True if the user is allowed to access this job.
 */
export function checkJobAccess(user, job) {
  return canAccessJob(user, job);
}

/**
 * Authenticate an HTTP request by extracting and validating the Bearer token
 * from the Authorization header.
 *
 * @param {import('http').IncomingMessage} req
 * @param {string | null} resource - The OAuth resource identifier of this server, from configuration.
 *   Null when no public base URL is configured, in which case only manually issued MCP tokens can
 *   authenticate: OAuth tokens are audience-bound and there is no audience to bind them to.
 * @returns {{ userId: string, scopes?: string[] } | null} The authenticated user info, or null if
 *   invalid. `scopes` is present only for OAuth tokens; a manually issued `fredy_` token carries no
 *   scope list and is full access, which is what {@link authenticateWriteToolCall} keys off.
 */
export function authenticateRequest(req, resource = null) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return null;
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  // Manually issued tokens keep working alongside OAuth. They carry a `fredy_` prefix that an
  // OAuth secret never has, so each token costs exactly one lookup.
  if (token.startsWith('fredy_')) return validateMcpToken(token);
  return resource ? validateAccessToken(token, resource) : null;
}
