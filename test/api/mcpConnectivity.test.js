/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

vi.mock('../../lib/services/storage/listingsStorage.js', () => ({
  queryListings: vi.fn(() => ({ totalNumber: 0, page: 1, result: [] })),
  getListingById: vi.fn(),
}));
vi.mock('../../lib/mcp/mcpAuthentication.js', () => ({
  authenticateToolCall: vi.fn(() => ({ user: { id: 'u1', isAdmin: false } })),
  checkJobAccess: vi.fn(() => true),
}));

import { queryListings } from '../../lib/services/storage/listingsStorage.js';
import { filterMask } from '../../lib/services/connectivity/mobileBits.js';
import { normalizeGetListing, normalizeListListings } from '../../lib/mcp/mcpNormalizer.js';
import { createMcpServer } from '../../lib/mcp/mcpAdapter.js';

async function callTool(name, args) {
  const server = createMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const result = await client.callTool({ name, arguments: args });
  await client.close();
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('list_listings connectivity filters', () => {
  it('passes the downstream and fibre filters through to the query', async () => {
    await callTool('list_listings', { minDownMbit: 100, fiberOnly: true });

    expect(queryListings).toHaveBeenCalledOnce();
    expect(queryListings.mock.calls[0][0]).toMatchObject({
      connectivityMinDown: 100,
      connectivityFiberOnly: true,
    });
  });

  it('packs mobileTech and mobileOperator into the coverage bitmask', async () => {
    await callTool('list_listings', { mobileTech: '5g', mobileOperator: 'dt' });

    expect(queryListings.mock.calls[0][0].connectivityMobileMask).toBe(filterMask('5g', 'dt'));
  });

  it('packs a neutral (any-operator) mask when no operator is given', async () => {
    await callTool('list_listings', { mobileTech: '4g' });

    expect(queryListings.mock.calls[0][0].connectivityMobileMask).toBe(filterMask('4g', null));
  });
});

describe('connectivity in tool output', () => {
  const listing = {
    id: 'l1',
    title: 'Nice flat',
    connectivity: {
      maxDownMbit: 1000,
      fiber: true,
      mobile: {
        neutral: { '2g': true, '4g': true, '5g': true, '5g_sa': false },
        operators: {
          dt: { '4g': true, '5g': true },
          vf: { '4g': true, '5g': false },
        },
      },
    },
  };

  it('renders a connectivity section in get_listing', () => {
    const md = normalizeGetListing(listing).content[0].text;
    expect(md).toMatch(/1000 Mbit\/s/);
    expect(md).toMatch(/Fib(re|er)/i);
    expect(md).toMatch(/5G/);
    expect(md).toContain('Telekom');
  });

  it('shows a compact internet column in list_listings', () => {
    const rows = { totalNumber: 1, result: [{ ...listing, connectivity_max_down: 1000, connectivity_fiber: 1 }] };
    const md = normalizeListListings(rows, { page: 1, pageSize: 50 }).content[0].text;
    expect(md).toMatch(/Internet/);
    expect(md).toMatch(/1000/);
  });
});
