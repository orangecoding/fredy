/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  MAX_GALLERY_IMAGES,
  downloadListingImages,
  deleteListingImages,
  readListingImage,
  resolveImagesDir,
} from '../../../lib/services/listings/listingImages.js';

/**
 * Local gallery storage for on-demand detail enrichment.
 *
 * Downloads are sequential and forgiving - one dead CDN file must not fail the other 29 -
 * and capped, so a 200-photo new-build exposé cannot fill the disk. Every test runs against
 * a throwaway `IMAGES_DIR`, never the real database directory.
 */
let imagesDir;
let previousImagesDir;

const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
// Sliced off the pool: `jpegBytes.buffer` alone would carry the whole 8 KiB slab.
const jpegArrayBuffer = () => jpegBytes.buffer.slice(jpegBytes.byteOffset, jpegBytes.byteOffset + jpegBytes.byteLength);

/**
 * Minimal fetch Response stub: ok/status/headers/arrayBuffer is all the downloader reads.
 *
 * @param {string} url
 * @returns {Promise<{ok: boolean, status: number, headers: {get: Function}, arrayBuffer: Function}>}
 */
async function stubFetch(url) {
  const headers = (entries) => ({ get: (name) => entries[name.toLowerCase()] ?? null });
  if (url.includes('/404')) {
    return { ok: false, status: 404, headers: headers({}), arrayBuffer: async () => new ArrayBuffer(0) };
  }
  if (url.includes('/html')) {
    return {
      ok: true,
      status: 200,
      headers: headers({ 'content-type': 'text/html; charset=utf-8', 'content-length': '12' }),
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    };
  }
  if (url.includes('/big')) {
    return {
      ok: true,
      status: 200,
      headers: headers({ 'content-type': 'image/jpeg', 'content-length': String(11 * 1024 * 1024) }),
      arrayBuffer: async () => new ArrayBuffer(0),
    };
  }
  const extension = url.endsWith('.png') ? 'image/png' : 'image/jpeg';
  return {
    ok: true,
    status: 200,
    headers: headers({ 'content-type': extension, 'content-length': String(jpegBytes.length) }),
    arrayBuffer: async () => jpegArrayBuffer(),
  };
}

beforeEach(async () => {
  previousImagesDir = process.env.IMAGES_DIR;
  imagesDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fredy-gallery-'));
  process.env.IMAGES_DIR = imagesDir;
  vi.stubGlobal('fetch', stubFetch);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  if (previousImagesDir === undefined) {
    delete process.env.IMAGES_DIR;
  } else {
    process.env.IMAGES_DIR = previousImagesDir;
  }
  await fs.rm(imagesDir, { recursive: true, force: true });
});

describe('downloadListingImages', () => {
  it('stores images as <listingId>/NN.<ext> in gallery order', async () => {
    const stored = await downloadListingImages('listing-1', ['https://cdn.example/a.jpg', 'https://cdn.example/b.png']);

    expect(stored).toEqual(['listing-1/00.jpg', 'listing-1/01.png']);
    expect((await fs.stat(path.join(imagesDir, 'listing-1', '00.jpg'))).isFile()).toBe(true);
    expect((await fs.stat(path.join(imagesDir, 'listing-1', '01.png'))).isFile()).toBe(true);
  });

  it('dedupes repeat URLs and caps the gallery', async () => {
    const urls = Array.from({ length: MAX_GALLERY_IMAGES + 10 }, (_, index) => `https://cdn.example/p${index}.jpg`);
    const stored = await downloadListingImages('listing-2', [...urls, urls[0]]);

    expect(stored.length).toBe(MAX_GALLERY_IMAGES);
    expect(new Set(stored).size).toBe(MAX_GALLERY_IMAGES);
  });

  it('skips dead files instead of failing the gallery', async () => {
    const stored = await downloadListingImages('listing-3', [
      'https://cdn.example/404.jpg',
      'https://cdn.example/html.jpg',
      'https://cdn.example/big.jpg',
      'https://cdn.example/ok.jpg',
    ]);

    // Only the one real image lands; numbering counts stored files, not attempts.
    expect(stored).toEqual(['listing-3/00.jpg']);
  });

  it('stores nothing for an empty or unsafe id', async () => {
    expect(await downloadListingImages('listing-4', [])).toEqual([]);
    expect(await downloadListingImages('../escape', ['https://cdn.example/ok.jpg'])).toEqual([]);
    expect(await downloadListingImages('a/b', ['https://cdn.example/ok.jpg'])).toEqual([]);
  });
});

describe('deleteListingImages', () => {
  it('removes the listing directory and keeps its neighbours', async () => {
    await downloadListingImages('listing-5', ['https://cdn.example/ok.jpg']);
    await downloadListingImages('listing-6', ['https://cdn.example/ok.jpg']);

    await deleteListingImages(['listing-5']);

    await expect(fs.stat(path.join(imagesDir, 'listing-5'))).rejects.toThrow();
    expect((await fs.stat(path.join(imagesDir, 'listing-6', '00.jpg'))).isFile()).toBe(true);
  });

  it('ignores unsafe ids and missing directories', async () => {
    await expect(deleteListingImages(['../escape', 'never-there'])).resolves.toBeUndefined();
  });
});

describe('readListingImage', () => {
  it('reads a stored file with its mime type', async () => {
    await downloadListingImages('listing-7', ['https://cdn.example/ok.jpg']);

    const file = await readListingImage('listing-7/00.jpg');

    expect(file?.contentType).toBe('image/jpeg');
    expect(file?.buffer.equals(jpegBytes)).toBe(true);
  });

  it('refuses traversal, unknown types and missing files', async () => {
    expect(await readListingImage('../listing-7/00.jpg')).toBeNull();
    expect(await readListingImage('/absolute.jpg')).toBeNull();
    expect(await readListingImage('listing-7/00.bmp')).toBeNull();
    expect(await readListingImage('listing-7/99.jpg')).toBeNull();
  });

  it('resolves to the configured images directory', async () => {
    expect(await resolveImagesDir()).toBe(path.resolve(imagesDir));
  });
});
