/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */
/**
 * Fredy MCP Server – stdio transport
 *
 * Launches the MCP server over stdin/stdout so that local LLM clients
 * (e.g. Claude Desktop, llm-cli, mcp-cli) can connect directly.
 *
 * Usage:
 *   MCP_TOKEN=fredy_<your-token> node mcp/stdio.js
 *
 * The MCP_TOKEN environment variable must contain a valid Fredy MCP token.
 * Each user has a permanent, non-expiring token shown in the user management list.
 */
import { fileURLToPath } from 'url';
import path from 'path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import SqliteConnection from '../lib/services/storage/SqliteConnection.js';
import { runMigrations } from '../lib/services/storage/migrations/migrate.js';
import { createMcpServer } from './mcpAdapter.js';
import { validateMcpToken } from '../lib/services/storage/userStorage.js';

// Ensure cwd is the project root so that relative DB/config paths resolve correctly
// (LM Studio and other MCP hosts may spawn this process from an arbitrary directory)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.resolve(__dirname, '..'));

// Initialize the database (required for standalone usage)
await SqliteConnection.init();
await runMigrations();

const token = process.env.MCP_TOKEN;
if (!token) {
  process.stderr.write('Error: MCP_TOKEN environment variable is required.\n');
  process.stderr.write('Each user has a permanent MCP token shown in the user management list.\n');
  process.exit(1);
}

const auth = validateMcpToken(token);
if (!auth) {
  process.stderr.write('Error: Invalid MCP_TOKEN. Token not found or user no longer exists.\n');
  process.exit(1);
}

const mcpServer = createMcpServer();

// Wrap the stdio transport to inject authInfo into every message
const transport = new StdioServerTransport();

// Patch: the MCP SDK passes authInfo through the transport's onmessage extra param.
// For stdio we inject the resolved user from the token.
const patchedTransport = new Proxy(transport, {
  set(target, prop, value) {
    if (prop === 'onmessage') {
      target.onmessage = (message, extra) => {
        value(message, { ...extra, authInfo: { userId: auth.userId } });
      };
      return true;
    }
    target[prop] = value;
    return true;
  },
  get(target, prop) {
    return target[prop];
  },
});

await mcpServer.connect(patchedTransport);
process.stderr.write('Fredy MCP Server running on stdio\n');
