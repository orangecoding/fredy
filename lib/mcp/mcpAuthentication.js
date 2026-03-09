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
 * Admins have access to all jobs. Non-admins can only access their own jobs
 * or jobs explicitly shared with them.
 *
 * @param {object} user - The authenticated user object.
 * @param {object} job - The job object from storage.
 * @returns {boolean} True if the user is allowed to access this job.
 */
export function checkJobAccess(user, job) {
  if (user.isAdmin) return true;
  if (job.userId === user.id) return true;
  if (Array.isArray(job.shared_with_user) && job.shared_with_user.includes(user.id)) return true;
  return false;
}

/**
 * Authenticate an HTTP request by extracting and validating the Bearer token
 * from the Authorization header.
 *
 * @param {import('http').IncomingMessage} req
 * @returns {{ userId: string } | null} The authenticated user info, or null if invalid.
 */
export function authenticateRequest(req) {
  const authHeader = req.headers['authorization'] || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  return validateMcpToken(token);
}
