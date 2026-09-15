/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../lib/services/storage/listingAttachmentsStorage.js', () => ({
  listAttachments: vi.fn(() => []),
  countAttachments: vi.fn(() => 0),
  getAttachment: vi.fn(() => null),
  addAttachment: vi.fn((input) => ({
    id: 'att-1',
    listingId: input.listingId,
    filename: input.filename,
    mimeType: input.mimeType,
    size: input.content.length,
    createdAt: 1700000000000,
  })),
  deleteAttachment: vi.fn(() => 1),
}));
vi.mock('../../lib/services/storage/listingsStorage.js', () => ({ userCanAccessListing: vi.fn(() => true) }));
vi.mock('../../lib/services/storage/settingsStorage.js', () => ({
  getSettings: vi.fn(async () => ({ demoMode: false, listingAttachmentMaxMb: 10, listingAttachmentMaxPerListing: 20 })),
}));
vi.mock('../../lib/services/tracking/Tracker.js', () => ({ trackPoi: vi.fn() }));
vi.mock('../../lib/services/logger.js', () => ({ default: { error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('../../lib/api/security.js', () => ({ isAdmin: vi.fn(() => false) }));

import * as attachmentStorage from '../../lib/services/storage/listingAttachmentsStorage.js';
import { userCanAccessListing } from '../../lib/services/storage/listingsStorage.js';
import { getSettings } from '../../lib/services/storage/settingsStorage.js';
import { trackPoi } from '../../lib/services/tracking/Tracker.js';
import { isAdmin } from '../../lib/api/security.js';
import listingAttachmentsPlugin from '../../lib/api/routes/listingAttachmentsRouter.js';

const PDF = Buffer.from('%PDF-1.7 here is an exposé');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);

async function buildApp() {
  const app = Fastify();
  app.addHook('onRequest', async (request) => {
    request.session = { currentUser: 'user-1' };
    request.currentUser = { id: 'user-1' };
  });
  await app.register(listingAttachmentsPlugin);
  await app.ready();
  return app;
}

const upload = async (payload, { name = 'expose.pdf', contentType = 'application/pdf' } = {}) => {
  const app = await buildApp();
  return app.inject({
    method: 'POST',
    url: `/listing-1/attachments?name=${encodeURIComponent(name)}`,
    headers: { 'content-type': contentType },
    payload,
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  attachmentStorage.listAttachments.mockReturnValue([]);
  attachmentStorage.countAttachments.mockReturnValue(0);
  attachmentStorage.getAttachment.mockReturnValue(null);
  attachmentStorage.addAttachment.mockImplementation((input) => ({
    id: 'att-1',
    listingId: input.listingId,
    filename: input.filename,
    mimeType: input.mimeType,
    size: input.content.length,
    createdAt: 1700000000000,
  }));
  attachmentStorage.deleteAttachment.mockReturnValue(1);
  userCanAccessListing.mockReturnValue(true);
  getSettings.mockResolvedValue({
    demoMode: false,
    listingAttachmentMaxMb: 10,
    listingAttachmentMaxPerListing: 20,
  });
  isAdmin.mockReturnValue(false);
});

describe('GET /:listingId/attachments', () => {
  it('returns the documents together with the limits the backend will enforce', async () => {
    attachmentStorage.listAttachments.mockReturnValue([
      { id: 'att-1', listingId: 'listing-1', filename: 'expose.pdf', mimeType: 'application/pdf', size: 12 },
    ]);
    const app = await buildApp();

    const response = await app.inject({ method: 'GET', url: '/listing-1/attachments' });

    expect(response.statusCode).toBe(200);
    expect(response.json().attachments).toHaveLength(1);
    // The component needs these to refuse an oversized file before uploading it, and the person
    // looking at a listing is usually not an admin, so the settings endpoint cannot supply them.
    expect(response.json().limits).toEqual({ maxBytes: 10 * 1024 * 1024, maxCount: 20 });
  });

  it('never leaks the bytes into the list', async () => {
    attachmentStorage.listAttachments.mockReturnValue([
      { id: 'att-1', listingId: 'listing-1', filename: 'expose.pdf', mimeType: 'application/pdf', size: 12 },
    ]);
    const app = await buildApp();

    const response = await app.inject({ method: 'GET', url: '/listing-1/attachments' });

    expect(response.json().attachments[0]).not.toHaveProperty('content');
  });

  it('falls back to sane limits when the settings row is gone', async () => {
    getSettings.mockResolvedValue({ demoMode: false });
    const app = await buildApp();

    const response = await app.inject({ method: 'GET', url: '/listing-1/attachments' });

    expect(response.json().limits).toEqual({ maxBytes: 10 * 1024 * 1024, maxCount: 20 });
  });
});

describe('POST /:listingId/attachments', () => {
  it('stores a PDF and reports what it stored', async () => {
    const response = await upload(PDF);

    expect(response.statusCode).toBe(201);
    expect(attachmentStorage.addAttachment).toHaveBeenCalledWith({
      listingId: 'listing-1',
      filename: 'expose.pdf',
      mimeType: 'application/pdf',
      content: expect.any(Buffer),
    });
    expect(response.json()).toMatchObject({ filename: 'expose.pdf', mimeType: 'application/pdf' });
    expect(trackPoi).toHaveBeenCalledWith('LISTING_ATTACHMENT_UPLOAD');
  });

  it('believes the bytes rather than the declared content type', async () => {
    // A PNG announced as a PDF is still a PNG, and is stored as one.
    const response = await upload(PNG, { name: 'grundriss.png', contentType: 'application/pdf' });

    expect(response.statusCode).toBe(201);
    expect(attachmentStorage.addAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: 'image/png', filename: 'grundriss.png' }),
    );
  });

  it('refuses a file whose bytes are not an allowed type', async () => {
    const response = await upload(Buffer.from('<html><script>alert(1)</script></html>'), {
      name: 'expose.pdf',
      contentType: 'application/pdf',
    });

    expect(response.statusCode).toBe(415);
    expect(attachmentStorage.addAttachment).not.toHaveBeenCalled();
  });

  it('refuses an empty body', async () => {
    const response = await upload(Buffer.alloc(0));

    expect(response.statusCode).toBe(400);
    expect(attachmentStorage.addAttachment).not.toHaveBeenCalled();
  });

  it('refuses a file over the configured size', async () => {
    getSettings.mockResolvedValue({ demoMode: false, listingAttachmentMaxMb: 1, listingAttachmentMaxPerListing: 20 });
    const big = Buffer.concat([Buffer.from('%PDF-1.7'), Buffer.alloc(2 * 1024 * 1024)]);

    const response = await upload(big);

    expect(response.statusCode).toBe(413);
    expect(attachmentStorage.addAttachment).not.toHaveBeenCalled();
  });

  it('refuses once the listing is at its document limit', async () => {
    getSettings.mockResolvedValue({ demoMode: false, listingAttachmentMaxMb: 10, listingAttachmentMaxPerListing: 2 });
    attachmentStorage.countAttachments.mockReturnValue(2);

    const response = await upload(PDF);

    expect(response.statusCode).toBe(409);
    expect(attachmentStorage.addAttachment).not.toHaveBeenCalled();
  });

  it('sanitises the filename it was handed', async () => {
    await upload(PDF, { name: '../../etc/passwd' });

    expect(attachmentStorage.addAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ filename: '.._.._etc_passwd' }),
    );
  });

  it('refuses a listing the user may not see', async () => {
    userCanAccessListing.mockReturnValue(false);

    const response = await upload(PDF);

    expect(response.statusCode).toBe(403);
    expect(attachmentStorage.addAttachment).not.toHaveBeenCalled();
  });

  it('refuses in demo mode unless the user is an admin', async () => {
    getSettings.mockResolvedValue({ demoMode: true, listingAttachmentMaxMb: 10, listingAttachmentMaxPerListing: 20 });

    expect((await upload(PDF)).statusCode).toBe(403);

    isAdmin.mockReturnValue(true);
    expect((await upload(PDF)).statusCode).toBe(201);
  });

  it('answers 500 rather than leaking a storage failure', async () => {
    attachmentStorage.addAttachment.mockImplementation(() => {
      throw new Error('disk is on fire');
    });

    const response = await upload(PDF);

    expect(response.statusCode).toBe(500);
    expect(response.json().message).not.toContain('disk is on fire');
  });
});

describe('GET /:listingId/attachments/:attachmentId', () => {
  it('sends an image inline, typed from what was stored', async () => {
    attachmentStorage.getAttachment.mockReturnValue({
      id: 'att-1',
      filename: 'grundriss.png',
      mimeType: 'image/png',
      size: PNG.length,
      content: PNG,
    });
    const app = await buildApp();

    const response = await app.inject({ method: 'GET', url: '/listing-1/attachments/att-1' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/png');
    // Without nosniff the browser is free to second-guess the type, which would undo the point of
    // having sniffed the bytes on the way in.
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-disposition']).toBe("inline; filename*=UTF-8''grundriss.png");
    expect(response.rawPayload.equals(PNG)).toBe(true);
  });

  it('sends a PDF as a download', async () => {
    attachmentStorage.getAttachment.mockReturnValue({
      id: 'att-1',
      filename: 'Exposé Musterstraße.pdf',
      mimeType: 'application/pdf',
      size: PDF.length,
      content: PDF,
    });
    const app = await buildApp();

    const response = await app.inject({ method: 'GET', url: '/listing-1/attachments/att-1' });

    expect(response.headers['content-disposition']).toBe(
      `attachment; filename*=UTF-8''${encodeURIComponent('Exposé Musterstraße.pdf')}`,
    );
  });

  it('looks the document up within the listing, so a borrowed id finds nothing', async () => {
    const app = await buildApp();

    const response = await app.inject({ method: 'GET', url: '/listing-1/attachments/someone-elses' });

    expect(attachmentStorage.getAttachment).toHaveBeenCalledWith('someone-elses', 'listing-1');
    expect(response.statusCode).toBe(404);
  });

  it('refuses a listing the user may not see', async () => {
    userCanAccessListing.mockReturnValue(false);
    const app = await buildApp();

    const response = await app.inject({ method: 'GET', url: '/listing-1/attachments/att-1' });

    expect(response.statusCode).toBe(403);
    expect(attachmentStorage.getAttachment).not.toHaveBeenCalled();
  });
});

describe('DELETE /:listingId/attachments/:attachmentId', () => {
  it('deletes within the listing', async () => {
    const app = await buildApp();

    const response = await app.inject({ method: 'DELETE', url: '/listing-1/attachments/att-1' });

    expect(response.statusCode).toBe(200);
    expect(attachmentStorage.deleteAttachment).toHaveBeenCalledWith('att-1', 'listing-1');
  });

  it('answers 404 when nothing was deleted', async () => {
    attachmentStorage.deleteAttachment.mockReturnValue(0);
    const app = await buildApp();

    const response = await app.inject({ method: 'DELETE', url: '/listing-1/attachments/att-1' });

    expect(response.statusCode).toBe(404);
  });

  it('refuses in demo mode', async () => {
    getSettings.mockResolvedValue({ demoMode: true, listingAttachmentMaxMb: 10, listingAttachmentMaxPerListing: 20 });
    const app = await buildApp();

    const response = await app.inject({ method: 'DELETE', url: '/listing-1/attachments/att-1' });

    expect(response.statusCode).toBe(403);
    expect(attachmentStorage.deleteAttachment).not.toHaveBeenCalled();
  });
});
