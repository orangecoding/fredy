/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { mcpToolCatalog } from '../../mcp/mcpAdapter.js';
import { getMcpServerSettings, MCP_SERVER_SETTING } from '../../mcp/mcpUserSettings.js';
import { getSettings, upsertSettings } from '../../services/storage/settingsStorage.js';
import { isAdmin } from '../security.js';
import logger from '../../services/logger.js';

/**
 * The settings page answer: the user's two switches plus every tool the server offers.
 *
 * The tools come from the server itself, so the page never carries a list of its own that could
 * fall behind. A stored name that no longer matches a tool (one removed in a later release) is left
 * out, so the page never posts back a name the validation below would refuse.
 *
 * @param {string} userId
 * @returns {{enabled: boolean, disabledTools: string[], tools: import('../../mcp/mcpAdapter.js').McpToolInfo[]}}
 */
function settingsFor(userId) {
  const tools = mcpToolCatalog();
  const known = new Set(tools.map((tool) => tool.name));
  const { enabled, disabledTools } = getMcpServerSettings(userId);
  return { enabled, disabledTools: disabledTools.filter((name) => known.has(name)), tools };
}

/**
 * Whether this user's MCP server answers at all, and which of its tools it offers.
 *
 * Mounted behind `authHook`, so `request.session.currentUser` is always set, and both routes key on
 * it. Enforcement lives with the MCP server (`mcpUserSettings.js`); this only reads and writes the
 * setting.
 *
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function mcpServerSettingsPlugin(fastify) {
  fastify.get('/', async (request) => settingsFor(request.session.currentUser));

  fastify.post('/', async (request, reply) => {
    const userId = request.session.currentUser;
    const { enabled, disabledTools } = request.body ?? {};

    const globalSettings = await getSettings();
    if (globalSettings.demoMode && !isAdmin(request)) {
      return reply.code(403).send({ error: 'In demo mode, it is not allowed to change settings.' });
    }

    if (typeof enabled !== 'boolean') {
      return reply.code(400).send({ error: 'enabled must be true or false.' });
    }
    if (!Array.isArray(disabledTools)) {
      return reply.code(400).send({ error: 'disabledTools must be a list of tool names.' });
    }
    const known = new Set(mcpToolCatalog().map((tool) => tool.name));
    const unknown = disabledTools.filter((name) => !known.has(name));
    if (unknown.length > 0) {
      return reply.code(400).send({ error: `Unknown tool: ${unknown.map(String).join(', ')}` });
    }

    try {
      upsertSettings({ [MCP_SERVER_SETTING]: { enabled, disabledTools: [...new Set(disabledTools)] } }, userId);
      return settingsFor(userId);
    } catch (error) {
      logger.error('Error updating the MCP server settings', error);
      return reply.code(500).send({ error: error.message });
    }
  });
}
