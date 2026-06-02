/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { shouldUseMultipart, buildPhotoFormData } from '../../lib/notification/adapter/telegramPhotoUploader.js';

describe('shouldUseMultipart', () => {
  it('returns true for .webp URL with query string', () => {
    expect(shouldUseMultipart('https://mms.immowelt.de/1/1/6/5/abc.webp?ci_seal=hash&w=525&h=394')).toBe(true);
  });

  it('returns true for .webp URL without query string', () => {
    expect(shouldUseMultipart('https://example.com/photo.webp')).toBe(true);
  });

  it('returns true for uppercase .WEBP extension', () => {
    expect(shouldUseMultipart('https://example.com/IMG.WEBP?x=1')).toBe(true);
  });

  it('returns false for .jpg URL with query string', () => {
    expect(shouldUseMultipart('https://mms.immowelt.de/a/b/c/d/xyz.jpg?ci_seal=hash&w=525&h=394')).toBe(false);
  });

  it('returns false for .jpeg URL', () => {
    expect(shouldUseMultipart('https://example.com/photo.jpeg')).toBe(false);
  });

  it('returns false for .png URL with query string', () => {
    expect(shouldUseMultipart('https://example.com/photo.png?w=100')).toBe(false);
  });

  it('returns false for .gif URL', () => {
    expect(shouldUseMultipart('https://example.com/photo.gif')).toBe(false);
  });

  it('returns false for null', () => {
    expect(shouldUseMultipart(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(shouldUseMultipart(undefined)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(shouldUseMultipart('')).toBe(false);
  });

  it('returns false for malformed URL', () => {
    expect(shouldUseMultipart('not a url')).toBe(false);
  });

  it('returns false for URL where webp is in the query but not the path', () => {
    expect(shouldUseMultipart('https://example.com/photo.jpg?format=webp')).toBe(false);
  });

  it('returns false for URL with no extension at all', () => {
    expect(shouldUseMultipart('https://example.com/photo')).toBe(false);
  });

  it('returns false for non-https schemes', () => {
    // file/data/ftp URLs should not be relevant; safer to skip multipart
    expect(shouldUseMultipart('http://example.com/photo.webp')).toBe(false);
  });
});

describe('buildPhotoFormData', () => {
  let mockFetch;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function makeImageResponse({ contentType = 'image/jpeg', bytes = new Uint8Array([0xff, 0xd8, 0xff]) } = {}) {
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    return {
      ok: true,
      status: 200,
      headers: {
        get: (h) =>
          h.toLowerCase() === 'content-type'
            ? contentType
            : h.toLowerCase() === 'content-length'
              ? String(bytes.byteLength)
              : null,
      },
      arrayBuffer: async () => buf,
    };
  }

  it('fetches image with Accept header that excludes webp so the CDN transcodes to JPEG', async () => {
    mockFetch.mockResolvedValueOnce(makeImageResponse());

    await buildPhotoFormData({
      chatId: '123',
      imageUrl: 'https://example.com/photo.webp',
      caption: 'hi',
      parseMode: 'HTML',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://example.com/photo.webp');
    expect(opts?.headers?.Accept || opts?.headers?.accept).toMatch(/image\/jpeg/);
    expect(opts?.headers?.Accept || opts?.headers?.accept).not.toMatch(/image\/webp/);
  });

  it('returns FormData containing chat_id, caption, parse_mode, and photo fields', async () => {
    mockFetch.mockResolvedValueOnce(makeImageResponse());

    const fd = await buildPhotoFormData({
      chatId: '12345',
      imageUrl: 'https://example.com/abc.webp',
      caption: 'My caption',
      parseMode: 'HTML',
    });

    expect(fd).toBeInstanceOf(FormData);
    expect(fd.get('chat_id')).toBe('12345');
    expect(fd.get('caption')).toBe('My caption');
    expect(fd.get('parse_mode')).toBe('HTML');
    const photo = fd.get('photo');
    expect(photo).toBeTruthy();
    // File-like (Blob); has a name and a size
    expect(typeof photo.name).toBe('string');
    expect(photo.size).toBeGreaterThan(0);
  });

  it('uses a .jpg filename (Telegram uses URL/filename extension for type detection)', async () => {
    mockFetch.mockResolvedValueOnce(makeImageResponse());

    const fd = await buildPhotoFormData({
      chatId: '1',
      imageUrl: 'https://example.com/source.webp',
      caption: 'c',
      parseMode: 'HTML',
    });

    const photo = fd.get('photo');
    expect(photo.name).toMatch(/\.jpg$/i);
  });

  it('includes message_thread_id when provided', async () => {
    mockFetch.mockResolvedValueOnce(makeImageResponse());

    const fd = await buildPhotoFormData({
      chatId: '1',
      imageUrl: 'https://example.com/source.webp',
      caption: 'c',
      parseMode: 'HTML',
      messageThreadId: 42,
    });

    expect(fd.get('message_thread_id')).toBe('42');
  });

  it('omits message_thread_id when not provided', async () => {
    mockFetch.mockResolvedValueOnce(makeImageResponse());

    const fd = await buildPhotoFormData({
      chatId: '1',
      imageUrl: 'https://example.com/source.webp',
      caption: 'c',
      parseMode: 'HTML',
    });

    expect(fd.get('message_thread_id')).toBeNull();
  });

  it('omits parse_mode when not provided (plain text mode)', async () => {
    mockFetch.mockResolvedValueOnce(makeImageResponse());

    const fd = await buildPhotoFormData({
      chatId: '1',
      imageUrl: 'https://example.com/source.webp',
      caption: 'c',
    });

    expect(fd.get('parse_mode')).toBeNull();
  });

  it('throws when the image fetch returns non-200', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      headers: { get: () => null },
      arrayBuffer: async () => new ArrayBuffer(0),
    });

    await expect(
      buildPhotoFormData({
        chatId: '1',
        imageUrl: 'https://example.com/gone.webp',
        caption: 'c',
        parseMode: 'HTML',
      }),
    ).rejects.toThrow(/404/);
  });

  it('throws when the image fetch throws (network error)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(
      buildPhotoFormData({
        chatId: '1',
        imageUrl: 'https://example.com/x.webp',
        caption: 'c',
        parseMode: 'HTML',
      }),
    ).rejects.toThrow(/ECONNREFUSED/);
  });

  it('throws when the image exceeds 10 MB (Telegram multipart limit)', async () => {
    // 11 MB
    const big = new Uint8Array(11 * 1024 * 1024);
    mockFetch.mockResolvedValueOnce(makeImageResponse({ bytes: big }));

    await expect(
      buildPhotoFormData({
        chatId: '1',
        imageUrl: 'https://example.com/huge.webp',
        caption: 'c',
        parseMode: 'HTML',
      }),
    ).rejects.toThrow(/size|large|10/i);
  });

  it('rejects early when content-length header advertises > 10 MB (avoids download)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {
        get: (h) => {
          const k = h.toLowerCase();
          if (k === 'content-type') return 'image/jpeg';
          if (k === 'content-length') return String(50 * 1024 * 1024);
          return null;
        },
      },
      arrayBuffer: async () => {
        throw new Error('should not be called - size check should reject first');
      },
    });

    await expect(
      buildPhotoFormData({
        chatId: '1',
        imageUrl: 'https://example.com/huge.webp',
        caption: 'c',
        parseMode: 'HTML',
      }),
    ).rejects.toThrow(/size|large|10/i);
  });

  it('accepts exactly 10 MB images (boundary)', async () => {
    const bytes = new Uint8Array(10 * 1024 * 1024);
    mockFetch.mockResolvedValueOnce(makeImageResponse({ bytes }));

    const fd = await buildPhotoFormData({
      chatId: '1',
      imageUrl: 'https://example.com/exact.webp',
      caption: 'c',
      parseMode: 'HTML',
    });

    expect(fd.get('photo').size).toBe(10 * 1024 * 1024);
  });

  it('coerces non-string chatId (number) to string in form data', async () => {
    mockFetch.mockResolvedValueOnce(makeImageResponse());

    const fd = await buildPhotoFormData({
      chatId: 999,
      imageUrl: 'https://example.com/x.webp',
      caption: 'c',
      parseMode: 'HTML',
    });

    expect(fd.get('chat_id')).toBe('999');
  });
});
