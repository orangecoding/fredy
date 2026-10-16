/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import {
  compressPreview,
  fetchListingPicture,
  MAX_PICTURE_DOWNLOAD_BYTES,
  PREVIEW_MAX_EDGE,
  sniffImageMime,
} from '../../../lib/services/listings/listingPictures.js';

/** A real picture, so the compression is tested against libvips and not against a double. */
const photo = (width, height, format = 'jpeg') =>
  sharp({ create: { width, height, channels: 3, background: { r: 180, g: 120, b: 90 } } })
    .toFormat(format, { quality: 95 })
    .toBuffer();

/**
 * A `fetch` answer, shaped the way the code reads it.
 *
 * @param {number} status
 * @param {Record<string, string>} headers
 * @param {Uint8Array|Buffer} [body]
 */
const answer = (status, headers = {}, body = new Uint8Array()) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name) => headers[name.toLowerCase()] ?? null },
  arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sniffImageMime', () => {
  it('knows the four picture types by their bytes', async () => {
    expect(sniffImageMime(await photo(20, 20, 'jpeg'))).toBe('image/jpeg');
    expect(sniffImageMime(await photo(20, 20, 'png'))).toBe('image/png');
    expect(sniffImageMime(await photo(20, 20, 'webp'))).toBe('image/webp');
    expect(sniffImageMime(await photo(20, 20, 'gif'))).toBe('image/gif');
  });

  it('refuses anything scriptable, whatever it is called', () => {
    expect(sniffImageMime(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'))).toBeNull();
    expect(sniffImageMime(Buffer.from('<!doctype html><script>alert(1)</script>'))).toBeNull();
    expect(sniffImageMime(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(sniffImageMime(null)).toBeNull();
  });
});

describe('fetchListingPicture', () => {
  it('downloads a public picture and says what it is', async () => {
    const jpeg = await photo(40, 30);
    const fetchMock = vi.fn().mockResolvedValue(answer(200, { 'content-type': 'image/jpeg' }, jpeg));
    vi.stubGlobal('fetch', fetchMock);

    const picture = await fetchListingPicture('https://pics.test/a.jpg');

    expect(picture.mimeType).toBe('image/jpeg');
    expect(picture.buffer.equals(jpeg)).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('https://pics.test/a.jpg', expect.objectContaining({ redirect: 'manual' }));
  });

  it('refuses a private address without asking it', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchListingPicture('http://192.168.1.1/router.png')).rejects.toThrow(/Refusing/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('follows a redirect, but checks where it leads', async () => {
    const jpeg = await photo(10, 10);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(answer(301, { location: '/moved.jpg' }))
      .mockResolvedValueOnce(answer(200, {}, jpeg));
    vi.stubGlobal('fetch', fetchMock);

    const picture = await fetchListingPicture('https://pics.test/a.jpg');
    expect(picture.url).toBe('https://pics.test/moved.jpg');

    fetchMock.mockReset().mockResolvedValueOnce(answer(302, { location: 'http://127.0.0.1:9998/api/user' }));
    await expect(fetchListingPicture('https://pics.test/a.jpg')).rejects.toThrow(/Refusing/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up on an endless chain of redirects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer(302, { location: 'https://pics.test/again.jpg' })));

    await expect(fetchListingPicture('https://pics.test/a.jpg')).rejects.toThrow(/Too many redirects/);
  });

  it('refuses an answer that is not a picture, or too large to be one', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer(200, {}, Buffer.from('<html>blocked</html>'))));
    await expect(fetchListingPicture('https://pics.test/a.jpg')).rejects.toThrow(/Not a supported image/);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(answer(200, { 'content-length': String(MAX_PICTURE_DOWNLOAD_BYTES + 1) })),
    );
    await expect(fetchListingPicture('https://pics.test/a.jpg')).rejects.toThrow(/too large/);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer(404)));
    await expect(fetchListingPicture('https://pics.test/a.jpg')).rejects.toThrow(/HTTP 404/);
  });
});

describe('compressPreview', () => {
  it('shrinks a large photo to a small WebP', async () => {
    const original = await photo(2400, 1600, 'png');

    const { content, mimeType } = await compressPreview(original, 'image/png');
    const meta = await sharp(content).metadata();

    expect(mimeType).toBe('image/webp');
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(PREVIEW_MAX_EDGE);
    expect(meta.height).toBe(Math.round((PREVIEW_MAX_EDGE * 1600) / 2400));
    expect(content.length).toBeLessThan(original.length);
  });

  it('never enlarges a small picture', async () => {
    const { content } = await compressPreview(await photo(320, 240, 'png'), 'image/png');

    expect((await sharp(content).metadata()).width).toBeLessThanOrEqual(320);
  });

  it('keeps the original when re-encoding would not make it smaller', async () => {
    const tiny = await photo(8, 8, 'webp');

    const { content, mimeType } = await compressPreview(tiny, 'image/webp');

    expect(mimeType).toBe('image/webp');
    expect(content.length).toBeLessThanOrEqual(tiny.length);
  });

  it('fails on bytes that only claim to be a picture', async () => {
    await expect(
      compressPreview(Buffer.from([0xff, 0xd8, 0xff, 0, 1, 2, 3, 4, 5, 6, 7, 8]), 'image/jpeg'),
    ).rejects.toThrow();
  });
});
