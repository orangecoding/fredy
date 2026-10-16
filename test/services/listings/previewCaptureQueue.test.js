/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The queue between "a listing has a picture" and "its bytes are in the database". Download and
 * storage are replaced; what is tested is when the queue asks for them.
 */
describe('previewCaptureQueue', () => {
  let queue;
  let pictures;
  let storage;
  /** @type {Record<string, {hasPreview: boolean, failedAt: number|null}>} */
  let states;

  beforeEach(async () => {
    states = {};
    vi.resetModules();
    pictures = {
      fetchListingPicture: vi.fn(async (url) => ({ buffer: Buffer.from(url), mimeType: 'image/jpeg', url })),
      compressPreview: vi.fn(async (buffer) => ({ content: buffer, mimeType: 'image/webp' })),
    };
    storage = {
      getPreviewState: vi.fn((listingId) => states[listingId] ?? { hasPreview: false, failedAt: null }),
      storeListingPreview: vi.fn(),
      markListingPreviewFailed: vi.fn(),
    };
    vi.doMock('../../../lib/services/listings/listingPictures.js', () => pictures);
    vi.doMock('../../../lib/services/storage/listingMediaStorage.js', () => storage);
    queue = await import('../../../lib/services/listings/previewCaptureQueue.js');
  });

  it('downloads, shrinks and keeps the picture', async () => {
    expect(queue.enqueuePreviewCapture('l1', 'https://pics.test/1.jpg')).toBe(true);
    await queue.whenPreviewCapturesIdle();

    expect(pictures.fetchListingPicture).toHaveBeenCalledWith('https://pics.test/1.jpg');
    expect(storage.storeListingPreview).toHaveBeenCalledWith(
      'l1',
      Buffer.from('https://pics.test/1.jpg'),
      'image/webp',
    );
  });

  it('fetches one picture once, however often it is asked for meanwhile', async () => {
    queue.enqueuePreviewCapture('l1', 'https://pics.test/1.jpg');
    expect(queue.enqueuePreviewCapture('l1', 'https://pics.test/1.jpg')).toBe(false);
    await queue.whenPreviewCapturesIdle();

    expect(pictures.fetchListingPicture).toHaveBeenCalledTimes(1);
  });

  it('leaves a picture that is already kept alone', async () => {
    states.l1 = { hasPreview: true, failedAt: null };

    queue.enqueuePreviewCapture('l1', 'https://pics.test/1.jpg');
    await queue.whenPreviewCapturesIdle();

    expect(pictures.fetchListingPicture).not.toHaveBeenCalled();
  });

  it('asks again for a failed picture only after a day', async () => {
    states.recent = { hasPreview: false, failedAt: Date.now() - 60_000 };
    states.old = { hasPreview: false, failedAt: Date.now() - queue.PREVIEW_RETRY_AFTER_MS - 1 };

    queue.enqueuePreviewCapture('recent', 'https://pics.test/recent.jpg');
    queue.enqueuePreviewCapture('old', 'https://pics.test/old.jpg');
    await queue.whenPreviewCapturesIdle();

    expect(pictures.fetchListingPicture.mock.calls.map(([url]) => url)).toEqual(['https://pics.test/old.jpg']);
  });

  it('records a failure instead of throwing it', async () => {
    pictures.fetchListingPicture.mockRejectedValueOnce(new Error('HTTP 404'));

    queue.enqueuePreviewCapture('l1', 'https://pics.test/gone.jpg');
    await queue.whenPreviewCapturesIdle();

    expect(storage.markListingPreviewFailed).toHaveBeenCalledWith('l1');
    expect(storage.storeListingPreview).not.toHaveBeenCalled();
  });

  it('survives a listing deleted while its picture was on the way', async () => {
    storage.storeListingPreview.mockImplementationOnce(() => {
      throw new Error('FOREIGN KEY constraint failed');
    });
    storage.markListingPreviewFailed.mockImplementationOnce(() => {
      throw new Error('FOREIGN KEY constraint failed');
    });

    queue.enqueuePreviewCapture('gone', 'https://pics.test/1.jpg');
    await expect(queue.whenPreviewCapturesIdle()).resolves.toBeUndefined();
  });

  it('ignores a listing without a usable picture url', () => {
    expect(queue.enqueuePreviewCapture('l1', null)).toBe(false);
    expect(queue.enqueuePreviewCapture('l1', 'data:image/png;base64,AAAA')).toBe(false);
    expect(queue.enqueuePreviewCapture(null, 'https://pics.test/1.jpg')).toBe(false);
  });

  it('runs at most two downloads at once', async () => {
    let running = 0;
    let peak = 0;
    pictures.fetchListingPicture.mockImplementation(async (url) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;
      return { buffer: Buffer.from(url), mimeType: 'image/jpeg', url };
    });

    for (let index = 0; index < 6; index++) {
      queue.enqueuePreviewCapture(`l${index}`, `https://pics.test/${index}.jpg`);
    }
    await queue.whenPreviewCapturesIdle();

    expect(peak).toBe(2);
    expect(storage.storeListingPreview).toHaveBeenCalledTimes(6);
  });
});
