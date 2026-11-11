/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { getUserSettings } from '../services/storage/settingsStorage.js';

/**
 * The per-user setting that says whether Fredy answers MCP requests for that user, and which of
 * the tools it offers.
 * @type {string}
 */
export const MCP_SERVER_SETTING = 'mcp_server';

/**
 * @typedef {Object} McpServerSettings
 * @property {boolean} enabled Whether Fredy answers MCP requests for this user at all.
 * @property {string[]} disabledTools The tools the user turned off. Stored this way round, rather
 *   than as the tools that are on, so a tool added in a later release is on without anyone having
 *   to migrate the setting.
 */

/**
 * Read a user's MCP server settings, with the defaults applied.
 *
 * A user who never opened the page has no row at all, and that means "on, every tool": the server
 * existed long before the switch did, and turning it off for everyone on upgrade would break every
 * client that was already connected.
 *
 * @param {string} userId
 * @returns {McpServerSettings}
 */
export function getMcpServerSettings(userId) {
  const stored = getUserSettings(userId)[MCP_SERVER_SETTING];
  return {
    enabled: stored?.enabled !== false,
    disabledTools: Array.isArray(stored?.disabledTools)
      ? stored.disabledTools.filter((name) => typeof name === 'string')
      : [],
  };
}

/**
 * The answer an MCP client gets while its user has the server switched off.
 * @type {string}
 */
export const MCP_SERVER_OFF_MESSAGE =
  'The MCP server is turned off for this Fredy account. It can be turned back on in Fredy under Settings → MCP server.';

/**
 * Why this user may not call this tool right now, or `null` when they may.
 *
 * The one place both switches are enforced, for both transports. The tool list a client sees is
 * trimmed as well, but a stdio process started before the change, or a client holding on to an old
 * list, would otherwise still reach a tool the user turned off.
 *
 * @param {string} userId
 * @param {string} [toolName]
 * @returns {string|null}
 */
export function mcpToolRefusal(userId, toolName) {
  const { enabled, disabledTools } = getMcpServerSettings(userId);
  if (!enabled) return MCP_SERVER_OFF_MESSAGE;
  if (toolName != null && disabledTools.includes(toolName)) {
    return `The tool ${toolName} is turned off for this Fredy account. It can be turned back on in Fredy under Settings → MCP server.`;
  }
  return null;
}
