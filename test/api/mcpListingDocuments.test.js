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
  setListingNotes: vi.fn(() => 1),
}));
vi.mock('../../lib/services/storage/listingAttachmentsStorage.js', () => ({
  listAttachments: vi.fn(() => []),
  getAttachment: vi.fn(() => null),
}));
vi.mock('../../lib/services/tracking/Tracker.js', () => ({ trackPoi: vi.fn() }));
vi.mock('../../lib/mcp/mcpAuthentication.js', () => ({
  authenticateToolCall: vi.fn(() => ({ user: { id: 'u1', isAdmin: false } })),
  authenticateWriteToolCall: vi.fn(async () => ({ user: { id: 'u1', isAdmin: false } })),
  checkJobAccess: vi.fn(() => true),
}));

import { getListingById } from '../../lib/services/storage/listingsStorage.js';
import { listAttachments, getAttachment } from '../../lib/services/storage/listingAttachmentsStorage.js';
import { normalizeGetListing } from '../../lib/mcp/mcpNormalizer.js';
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

/** The text parts of a tool answer, joined. */
const textOf = (result) => result.content.map((part) => part.text ?? '').join('\n');

const LISTING = { id: 'l1', title: 'Nice flat' };
const EXPOSE = { id: 'd1', listingId: 'l1', filename: 'expose.pdf', mimeType: 'application/pdf', size: 1572864 };
const FLOOR_PLAN = { id: 'd2', listingId: 'l1', filename: 'plan.png', mimeType: 'image/png', size: 2048 };

beforeEach(() => {
  vi.clearAllMocks();
  getListingById.mockReturnValue(LISTING);
  listAttachments.mockReturnValue([]);
  getAttachment.mockReturnValue(null);
});

describe('get_listing notes and documents', () => {
  it('includes the notes the user keeps on the listing', async () => {
    getListingById.mockReturnValue({ ...LISTING, notes: 'Called the agent.\nViewing on Friday.' });

    const text = textOf(await callTool('get_listing', { listingId: 'l1' }));

    expect(text).toContain('**Notes:**');
    expect(text).toContain('Called the agent.\nViewing on Friday.');
  });

  it('prints a dash for no notes and no documents, like every other empty field', async () => {
    const text = textOf(await callTool('get_listing', { listingId: 'l1' }));

    expect(text).toContain('- **Notes:** –');
    expect(text).toContain('- **Documents:** –');
  });

  it('lists each document with the id get_listing_document needs, and no more than metadata', async () => {
    listAttachments.mockReturnValue([EXPOSE, FLOOR_PLAN]);

    const result = await callTool('get_listing', { listingId: 'l1' });
    const text = textOf(result);

    expect(listAttachments).toHaveBeenCalledWith('l1');
    expect(text).toContain('**Documents (2):**');
    expect(text).toContain('get_listing_document');
    expect(text).toContain('`d1` · expose.pdf · application/pdf · 1.5 MB');
    expect(text).toContain('`d2` · plan.png · image/png · 2.0 KB');
    // Metadata only: the bytes are never read for the overview.
    expect(getAttachment).not.toHaveBeenCalled();
    expect(result.content.every((part) => part.type === 'text')).toBe(true);
  });

  it('says nothing about documents when the normalizer is given no list', () => {
    const text = textOf(normalizeGetListing(LISTING));

    expect(text).not.toContain('Documents');
    expect(text).toContain('- **Notes:** –');
  });
});

describe('get_listing_document', () => {
  it('requires a documentId', async () => {
    const result = await callTool('get_listing_document', { listingId: 'l1' });

    expect(result.isError).toBe(true);
    expect(getAttachment).not.toHaveBeenCalled();
  });

  it('returns a PDF as an embedded resource', async () => {
    getAttachment.mockReturnValue({ ...EXPOSE, content: Buffer.from('%PDF-1.7') });

    const result = await callTool('get_listing_document', { listingId: 'l1', documentId: 'd1' });

    expect(getAttachment).toHaveBeenCalledWith('d1', 'l1');
    expect(textOf(result)).toContain('expose.pdf (application/pdf, 1.5 MB)');
    const resource = result.content.find((part) => part.type === 'resource');
    expect(resource.resource).toEqual({
      uri: 'fredy://listings/l1/documents/d1',
      mimeType: 'application/pdf',
      blob: Buffer.from('%PDF-1.7').toString('base64'),
    });
  });

  it('returns an image as image content', async () => {
    getAttachment.mockReturnValue({ ...FLOOR_PLAN, content: Buffer.from('png-bytes') });

    const result = await callTool('get_listing_document', { listingId: 'l1', documentId: 'd2' });

    const image = result.content.find((part) => part.type === 'image');
    expect(image).toMatchObject({ mimeType: 'image/png', data: Buffer.from('png-bytes').toString('base64') });
  });

  it('refuses a document that is not on this listing', async () => {
    const result = await callTool('get_listing_document', { listingId: 'l1', documentId: 'nope' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Document not found on this listing.');
  });

  it('never looks a document up for a listing the caller may not see', async () => {
    getListingById.mockReturnValue(null);

    const result = await callTool('get_listing_document', { listingId: 'other', documentId: 'd1' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Listing not found or access denied.');
    expect(getAttachment).not.toHaveBeenCalled();
  });
});
