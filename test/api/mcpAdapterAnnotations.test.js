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

const READ_TOOLS = [
  'list_jobs',
  'get_job',
  'list_listings',
  'get_listing',
  'get_photo_for_listing',
  'calculate_financing',
  'get_current_date_time',
  'get_application_letter',
  'list_channels',
  'list_adapters',
  'get_user_settings',
];

/**
 * Everything that changes something. A client shows a confirmation prompt based on these hints, so
 * a write tool advertised as read-only is a change made behind the user's back.
 */
const WRITE_TOOLS = [
  'add_listing_note',
  'set_listing_notes',
  'watch_listing',
  'unwatch_listing',
  'start_job_draft',
  'update_job_draft',
  'create_job_from_draft',
  'discard_job_draft',
  'run_job',
  'run_all_jobs',
  'set_job_enabled',
  'update_job',
  'delete_job',
  'create_channel',
  'update_channel',
  'delete_channel',
  'test_channel',
  'set_listing_status',
  'add_listing_by_url',
  'delete_listing',
  'update_user_settings',
];

/**
 * Destructive means: this can overwrite or delete something the user wrote, beyond getting it back.
 * Replacing the notes on a listing qualifies. A watch flag, and a draft that only lives in memory,
 * do not - and marking them destructive would train the user to click through the prompt that
 * guards the ones that are. `update_channel` is deliberately absent: its merge semantics keep every
 * stored value the call does not name, so a mis-sent field bag is re-entered rather than lost. The
 * three deletes qualify outright - a deleted job, channel or hard-deleted listing is not coming back.
 */
const DESTRUCTIVE_TOOLS = ['set_listing_notes', 'delete_job', 'delete_channel', 'delete_listing'];

/** Calling it twice must be the same as calling it once. */
const NON_IDEMPOTENT_TOOLS = [
  'get_current_date_time',
  'add_listing_note',
  'create_job_from_draft',
  'run_job',
  'run_all_jobs',
  'create_channel',
  'delete_job',
  'delete_channel',
  'delete_listing',
];

describe('MCP tool annotations', () => {
  it('advertises every read tool as read-only, so a client never warns about side effects', async () => {
    const tools = await listTools();
    for (const name of READ_TOOLS) {
      expect(tools[name]?.annotations?.readOnlyHint, `${name}.readOnlyHint`).toBe(true);
    }
  });

  it('advertises every write tool as not read-only', async () => {
    const tools = await listTools();
    for (const name of WRITE_TOOLS) {
      expect(tools[name]?.annotations?.readOnlyHint, `${name}.readOnlyHint`).toBe(false);
    }
  });

  it('flags only the tools that can destroy user-written content', async () => {
    const tools = await listTools();
    for (const name of WRITE_TOOLS) {
      expect(tools[name]?.annotations?.destructiveHint, `${name}.destructiveHint`).toBe(
        DESTRUCTIVE_TOOLS.includes(name),
      );
    }
  });

  it('accounts for every tool the server offers', async () => {
    const tools = await listTools();
    expect(Object.keys(tools).sort()).toEqual([...READ_TOOLS, ...WRITE_TOOLS].sort());
  });

  it('gives each tool a human title', async () => {
    const tools = await listTools();
    for (const name of [...READ_TOOLS, ...WRITE_TOOLS]) {
      expect(typeof tools[name]?.annotations?.title, `${name}.title`).toBe('string');
    }
    expect(tools.get_listing.annotations.title).toBe('Get listing details');
  });

  it('flags the remote fetches and the outward test-send as open-world while everything else is closed-world', async () => {
    const tools = await listTools();
    const OPEN_WORLD_TOOLS = ['get_photo_for_listing', 'add_listing_by_url', 'test_channel'];
    for (const name of OPEN_WORLD_TOOLS) {
      expect(tools[name]?.annotations?.openWorldHint, `${name}.openWorldHint`).toBe(true);
    }
    for (const name of [...READ_TOOLS, ...WRITE_TOOLS].filter((tool) => !OPEN_WORLD_TOOLS.includes(tool))) {
      expect(tools[name]?.annotations?.openWorldHint, `${name}.openWorldHint`).toBe(false);
    }
  });

  it('marks a repeatable call idempotent and a cumulative one not', async () => {
    const tools = await listTools();
    for (const name of [...READ_TOOLS, ...WRITE_TOOLS]) {
      expect(tools[name]?.annotations?.idempotentHint, `${name}.idempotentHint`).toBe(
        !NON_IDEMPOTENT_TOOLS.includes(name),
      );
    }
  });
});
