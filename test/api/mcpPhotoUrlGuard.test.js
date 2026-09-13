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

import { getListingById } from '../../lib/services/storage/listingsStorage.js';
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

/** The tool answers in Markdown; this is the whole of it. */
const textOf = (result) => result.content.map((part) => part.text ?? '').join('\n');

beforeEach(() => {
  vi.clearAllMocks();
});

/*
 * `image_url` is scraped, so asking for a listing's photo is asking the server to fetch whatever a
 * portal's markup said. Fredy normally runs inside a home network, which is the one place a URL
 * like http://192.168.1.1/ is worth something to an attacker and worth nothing to anyone else.
 */
describe('get_photo_for_listing URL guard', () => {
  it.each([
    ['a private address', 'http://192.168.1.1/admin'],
    ['loopback', 'http://127.0.0.1:9998/api/user'],
    ['loopback by name', 'http://localhost:9998/api/user'],
    ['cloud metadata', 'http://169.254.169.254/latest/meta-data/'],
    ['a local file', 'file:///etc/passwd'],
  ])('refuses %s without fetching it', async (_what, imageUrl) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    getListingById.mockReturnValue({ id: 'l1', title: 'Nice flat', image_url: imageUrl });

    const text = textOf(await callTool('get_photo_for_listing', { listingId: 'l1' }));

    expect(text).toContain('Refusing to fetch this image');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('fetches a public image as before', async () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/png' },
      arrayBuffer: async () => png.buffer,
    });
    getListingById.mockReturnValue({ id: 'l1', title: 'Nice flat', image_url: 'https://pic.example.com/flat.png' });

    const result = await callTool('get_photo_for_listing', { listingId: 'l1' });

    expect(fetchSpy).toHaveBeenCalledWith('https://pic.example.com/flat.png', expect.any(Object));
    expect(result.content[0]).toMatchObject({ type: 'image', mimeType: 'image/png' });
    fetchSpy.mockRestore();
  });
});
