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

/**
 * Authenticate an MCP tool call by extracting and validating the user from authInfo.
 *
 * @param {{ authInfo?: { userId?: string } }} extra - The extra context passed by the MCP SDK.
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
 * @returns {{ userId: string } | null} The authenticated user info, or null if invalid.
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
