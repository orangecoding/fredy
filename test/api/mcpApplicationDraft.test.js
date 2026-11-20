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
vi.mock('../../lib/services/tracking/Tracker.js', () => ({ trackPoi: vi.fn() }));
vi.mock('../../lib/services/application/applicationDraftService.js', () => ({
  writeApplicationDraft: vi.fn(),
}));
vi.mock('../../lib/mcp/mcpAuthentication.js', () => ({
  authenticateToolCall: vi.fn(() => ({ user: { id: 'u1', isAdmin: false }, error: null })),
  authenticateWriteToolCall: vi.fn(async () => ({ user: { id: 'u1', isAdmin: false }, error: null })),
  checkJobAccess: vi.fn(() => true),
}));

import { writeApplicationDraft } from '../../lib/services/application/applicationDraftService.js';
import { authenticateWriteToolCall } from '../../lib/mcp/mcpAuthentication.js';
import { trackPoi } from '../../lib/services/tracking/Tracker.js';
import { TRACKING_POIS } from '../../lib/TRACKING_POIS.js';
import { createMcpServer } from '../../lib/mcp/mcpAdapter.js';

const TOOL = 'write_application_draft';

async function callTool(args) {
  const server = createMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const result = await client.callTool({ name: TOOL, arguments: args });
  await client.close();
  return result;
}

const textOf = (result) => result.content.map((part) => part.text).join('\n');

const LISTING = { id: 'l1', title: 'Helle 3-Zimmer-Wohnung' };
const DRAFT = { text: 'Guten Tag,\n\nich interessiere mich für Ihre Wohnung.', model: 'gpt-test', generatedAt: 0 };

beforeEach(() => {
  vi.mocked(writeApplicationDraft).mockReset();
  vi.mocked(trackPoi).mockClear();
});

describe('write_application_draft', () => {
  it('hands back a stored draft without a new request unless told to rewrite', async () => {
    vi.mocked(writeApplicationDraft).mockResolvedValue({ ok: true, draft: DRAFT, reused: true, listing: LISTING });

    const result = await callTool({ listingId: 'l1' });

    expect(writeApplicationDraft).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1' }), 'l1', {
      rewrite: false,
      language: null,
    });
    expect(textOf(result)).toMatch(/already had this draft, so no new request was made/);
    expect(textOf(result)).toContain(DRAFT.text);
    expect(trackPoi).not.toHaveBeenCalled();
  });

  it('asks for a new draft on rewrite, and counts it', async () => {
    vi.mocked(writeApplicationDraft).mockResolvedValue({ ok: true, draft: DRAFT, reused: false, listing: LISTING });

    const result = await callTool({ listingId: 'l1', rewrite: true });

    expect(writeApplicationDraft).toHaveBeenCalledWith(expect.anything(), 'l1', { rewrite: true, language: null });
    expect(textOf(result)).toMatch(/Written just now/);
    expect(textOf(result)).toMatch(/written by an AI and should be checked/);
    expect(trackPoi).toHaveBeenCalledWith(TRACKING_POIS.MCP_APPLICATION_AI_DRAFT);
  });

  it('writes anew for another language, since the stored draft is in the old one', async () => {
    vi.mocked(writeApplicationDraft).mockResolvedValue({ ok: true, draft: DRAFT, reused: false, listing: LISTING });

    await callTool({ listingId: 'l1', language: 'en' });

    expect(writeApplicationDraft).toHaveBeenCalledWith(expect.anything(), 'l1', { rewrite: true, language: 'en' });
  });

  it('fences the draft so text inside it cannot close the block', async () => {
    const tricky = { ...DRAFT, text: 'Hallo ``` und weiter' };
    vi.mocked(writeApplicationDraft).mockResolvedValue({ ok: true, draft: tricky, reused: false, listing: LISTING });

    const text = textOf(await callTool({ listingId: 'l1' }));

    expect(text).toContain('````\nHallo ``` und weiter\n````');
  });

  it('passes a refusal on as an error', async () => {
    vi.mocked(writeApplicationDraft).mockResolvedValue({
      ok: false,
      reason: 'unavailable',
      error: 'AI application drafts are not set up on this Fredy.',
    });

    const result = await callTool({ listingId: 'l1' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/not set up on this Fredy/);
  });

  it('needs a connection allowed to change things', async () => {
    vi.mocked(authenticateWriteToolCall).mockResolvedValueOnce({ user: null, error: 'Read-only connection.' });

    const result = await callTool({ listingId: 'l1' });

    expect(result.isError).toBe(true);
    expect(writeApplicationDraft).not.toHaveBeenCalled();
  });
});
