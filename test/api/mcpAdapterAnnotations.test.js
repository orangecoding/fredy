/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../../lib/mcp/mcpAdapter.js';

/** Drive the real server over an in-memory transport and return tools keyed by name. */
async function listTools() {
  const server = createMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const { tools } = await client.listTools();
  await client.close();
  return Object.fromEntries(tools.map((tool) => [tool.name, tool]));
}

const ALL_TOOLS = [
  'list_jobs',
  'get_job',
  'list_listings',
  'get_listing',
  'get_photo_for_listing',
  'calculate_financing',
  'get_current_date_time',
];

describe('MCP tool annotations', () => {
  it('advertises every tool as read-only, so a client never warns about side effects', async () => {
    const tools = await listTools();
    for (const name of ALL_TOOLS) {
      expect(tools[name]?.annotations?.readOnlyHint, `${name}.readOnlyHint`).toBe(true);
    }
  });

  it('gives each tool a human title', async () => {
    const tools = await listTools();
    for (const name of ALL_TOOLS) {
      expect(typeof tools[name]?.annotations?.title, `${name}.title`).toBe('string');
    }
    expect(tools.get_listing.annotations.title).toBe('Get listing details');
  });

  it('flags the remote photo fetch as open-world while local queries are closed-world', async () => {
    const tools = await listTools();
    expect(tools.get_photo_for_listing.annotations.openWorldHint).toBe(true);
    expect(tools.list_listings.annotations.openWorldHint).toBe(false);
    expect(tools.calculate_financing.annotations.openWorldHint).toBe(false);
  });

  it('marks the clock as non-idempotent and stable queries as idempotent', async () => {
    const tools = await listTools();
    expect(tools.get_current_date_time.annotations.idempotentHint).toBe(false);
    expect(tools.list_jobs.annotations.idempotentHint).toBe(true);
    expect(tools.get_job.annotations.idempotentHint).toBe(true);
  });
});
