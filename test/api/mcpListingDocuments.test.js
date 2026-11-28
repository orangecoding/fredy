/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import sharp from 'sharp';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildPdf } from '../mocks/buildPdf.js';

vi.mock('../../lib/services/storage/listingsStorage.js', () => ({
  queryListings: vi.fn(() => ({ totalNumber: 0, page: 1, result: [] })),
  getListingById: vi.fn(),
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
import { DOCUMENT_IMAGE_MAX_EDGE, MAX_DOCUMENT_TEXT_CHARS } from '../../lib/mcp/listingDocument.js';

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

/** A real picture, so the shrinking is tested against libvips and not against a double. */
const picture = (width, height) =>
  sharp({ create: { width, height, channels: 3, background: { r: 240, g: 240, b: 240 } } })
    .png()
    .toBuffer();

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

  it('returns a PDF as its text, not as a binary the client may drop', async () => {
    const pdf = buildPdf([['Exposé Nice flat', 'Kaltmiete 950 EUR'], ['Energieausweis: B']]);
    getAttachment.mockReturnValue({ ...EXPOSE, size: pdf.length, content: pdf });

    const result = await callTool('get_listing_document', { listingId: 'l1', documentId: 'd1' });
    const text = textOf(result);

    expect(getAttachment).toHaveBeenCalledWith('d1', 'l1');
    expect(result.isError).toBeFalsy();
    expect(result.content.every((part) => part.type === 'text')).toBe(true);
    expect(text).toContain('### Document: expose.pdf');
    expect(text).toContain('2 pages');
    expect(text).toContain('**Pages shown:** 1–2 of 2');
    expect(text).toContain('[Page 1]\nExposé Nice flat\nKaltmiete 950 EUR');
    expect(text).toContain('[Page 2]\nEnergieausweis: B');
    expect(text).not.toContain('More pages');
  });

  it('reads a long PDF in parts, each naming the page to go on from', async () => {
    // Fifty lines fill a page; pdf.js drops text set outside the page, so a page cannot hold more.
    const line = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor.';
    const pdf = buildPdf(Array.from({ length: 15 }, () => Array(50).fill(line)));
    getAttachment.mockReturnValue({ ...EXPOSE, content: pdf });

    const first = textOf(await callTool('get_listing_document', { listingId: 'l1', documentId: 'd1' }));
    const [, last] = first.match(/\*\*Pages shown:\*\* 1–(\d+) of 15/);
    const next = Number(last) + 1;
    expect(next).toBeLessThan(15);
    expect(first).toContain(`fromPage ${next}`);
    expect(first).not.toContain(`[Page ${next}]`);
    expect(first.length).toBeLessThan(MAX_DOCUMENT_TEXT_CHARS + 2000);

    const second = textOf(
      await callTool('get_listing_document', { listingId: 'l1', documentId: 'd1', fromPage: next }),
    );
    expect(second).toContain(`**Pages shown:** ${next}–15 of 15`);
    expect(second).toContain(`[Page ${next}]`);
    expect(second).not.toContain('More pages');
  });

  it('says so when a PDF carries no text, and where the user can see it', async () => {
    getAttachment.mockReturnValue({ ...EXPOSE, content: buildPdf([[], []]) });

    const text = textOf(await callTool('get_listing_document', { listingId: 'l1', documentId: 'd1' }));

    expect(text).toContain('most likely scanned');
    expect(text).toContain("Fredy's web UI");
    expect(text).not.toContain('[Page 1]');
  });

  it('marks a single scanned page among pages with text', async () => {
    getAttachment.mockReturnValue({ ...EXPOSE, content: buildPdf([['Text'], []]) });

    const text = textOf(await callTool('get_listing_document', { listingId: 'l1', documentId: 'd1' }));

    expect(text).toContain('[Page 2]\n(no text on this page');
  });

  it('keeps backticks in the document from closing the block early', async () => {
    getAttachment.mockReturnValue({ ...EXPOSE, content: buildPdf([['before ```` after']]) });

    const text = textOf(await callTool('get_listing_document', { listingId: 'l1', documentId: 'd1' }));

    expect(text).toContain('`````text\n[Page 1]\nbefore ```` after\n`````');
  });

  it('refuses a page past the end of the PDF', async () => {
    getAttachment.mockReturnValue({ ...EXPOSE, content: buildPdf([['one'], ['two']]) });

    const result = await callTool('get_listing_document', { listingId: 'l1', documentId: 'd1', fromPage: 5 });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('The PDF has 2 pages, so there is no page 5.');
  });

  it('refuses a broken PDF with a pointer to the web UI', async () => {
    getAttachment.mockReturnValue({ ...EXPOSE, content: Buffer.from('%PDF-1.7 broken') });

    const result = await callTool('get_listing_document', { listingId: 'l1', documentId: 'd1' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('The PDF cannot be read');
    expect(textOf(result)).toContain("Fredy's web UI");
  });

  it('shrinks a large image before it goes out', async () => {
    const original = await picture(4000, 3000);
    getAttachment.mockReturnValue({ ...FLOOR_PLAN, size: original.length, content: original });

    const result = await callTool('get_listing_document', { listingId: 'l1', documentId: 'd2' });

    const image = result.content.find((part) => part.type === 'image');
    expect(image.mimeType).toBe('image/webp');
    const meta = await sharp(Buffer.from(image.data, 'base64')).metadata();
    expect(meta.width).toBe(DOCUMENT_IMAGE_MAX_EDGE);
    expect(meta.height).toBe(1200);
    expect(textOf(result)).toContain('### Document: plan.png');
  });

  it('refuses an image that cannot be decoded, with a pointer to the web UI', async () => {
    getAttachment.mockReturnValue({ ...FLOOR_PLAN, content: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]) });

    const result = await callTool('get_listing_document', { listingId: 'l1', documentId: 'd2' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('The image could not be prepared');
    expect(textOf(result)).toContain("Fredy's web UI");
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
