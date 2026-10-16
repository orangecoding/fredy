/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';

const state = { accessible: new Set(), pictures: {} };

vi.mock('../../lib/services/storage/listingsStorage.js', () => ({
  userCanAccessListing: (id) => state.accessible.has(id),
  getListingById: vi.fn(),
}));
vi.mock('../../lib/services/storage/listingMediaStorage.js', () => ({
  getListingPicture: (id) => state.pictures[id] ?? null,
  getListingGallery: () => [],
  storeListingGallery: vi.fn(),
}));
vi.mock('../../lib/services/listings/previewCaptureQueue.js', () => ({ enqueuePreviewCapture: vi.fn() }));
vi.mock('../../lib/api/security.js', () => ({ isAdmin: () => false }));

const { enqueuePreviewCapture } = await import('../../lib/services/listings/previewCaptureQueue.js');
const { default: listingsPlugin } = await import('../../lib/api/routes/listingsRouter.js');

/**
 * `GET /api/listings/:id/image` is what every `<img>` in the interface points at: the kept copy when
 * there is one, the portal otherwise, and the lazy backfill on the way.
 */
describe('GET /api/listings/:listingId/image', () => {
  let app;

  beforeAll(async () => {
    app = Fastify();
    app.addHook('onRequest', async (request) => {
      request.session = { currentUser: 'alice' };
    });
    await app.register(listingsPlugin, { prefix: '/api/listings' });
    await app.ready();
  });

  afterAll(() => app.close());

  beforeEach(() => {
    state.accessible = new Set(['kept', 'not-kept', 'no-picture', 'odd-url']);
    state.pictures = {
      kept: {
        imageUrl: 'https://pics.test/kept.jpg',
        content: Buffer.from('RIFF\0\0\0\0WEBPVP8 '),
        mimeType: 'image/webp',
        failedAt: null,
      },
      'not-kept': { imageUrl: 'https://pics.test/not-kept.jpg', content: null, mimeType: null, failedAt: null },
      'no-picture': { imageUrl: null, content: null, mimeType: null, failedAt: null },
      'odd-url': { imageUrl: 'javascript:alert(1)', content: null, mimeType: null, failedAt: null },
      'someone-elses': {
        imageUrl: 'https://pics.test/x.jpg',
        content: Buffer.from('secret'),
        mimeType: 'image/jpeg',
        failedAt: null,
      },
    };
    vi.mocked(enqueuePreviewCapture).mockClear();
  });

  it('serves the kept picture from the database, pinned to the type it was sniffed as', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/listings/kept/image' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/webp');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-disposition']).toBe('inline');
    expect(response.headers['cache-control']).toMatch(/^private, max-age=\d+$/);
    expect(response.rawPayload.equals(state.pictures.kept.content)).toBe(true);
    expect(enqueuePreviewCapture).not.toHaveBeenCalled();
  });

  it('sends the browser to the portal for a picture not kept yet, and queues it', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/listings/not-kept/image' });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('https://pics.test/not-kept.jpg');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(enqueuePreviewCapture).toHaveBeenCalledWith('not-kept', 'https://pics.test/not-kept.jpg');
  });

  it('answers 404 for a listing without a picture, and never redirects anywhere but http(s)', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/listings/no-picture/image' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/listings/odd-url/image' })).statusCode).toBe(404);
    expect(enqueuePreviewCapture).not.toHaveBeenCalled();
  });

  it('shows nobody a picture of somebody else’s listing', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/listings/someone-elses/image' });

    expect(response.statusCode).toBe(403);
    expect(response.rawPayload.includes(Buffer.from('secret'))).toBe(false);
  });
});
