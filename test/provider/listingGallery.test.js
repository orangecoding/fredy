/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';
import { readGalleryImages } from '../../lib/provider/immoscout.js';
import { extractExposeImages } from '../../lib/provider/immowelt.js';
import { extractDetailImages } from '../../lib/provider/kleinanzeigen.js';
import { MAX_GALLERY_IMAGES } from '../../lib/services/listings/listingImages.js';

/**
 * Every provider's path to the exposé gallery, against the real payloads.
 *
 * "Enrich on click" pulls description plus gallery only; these are the URL lists the image
 * downloader works from, so what is tested here is that each extractor finds the photos its
 * portal hides in a different place, dedupes them, and caps the list.
 */
const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../testFixtures');
const readFixture = (name) => readFile(path.join(FIXTURES_DIR, name), 'utf-8');

describe('immoscout gallery', () => {
  it('reads the MEDIA/PICTURE entries in display order, largest JPEG first', async () => {
    const detailBody = JSON.parse(await readFixture('immoscout_detail.json'));

    const images = readGalleryImages(detailBody);

    expect(images.length).toBeGreaterThan(1);
    expect(images.length).toBeLessThanOrEqual(MAX_GALLERY_IMAGES);
    expect(new Set(images).size).toBe(images.length);
    for (const url of images) {
      expect(url).toContain('1500x1000');
    }
  });

  it('answers empty for a body without a MEDIA section', () => {
    expect(readGalleryImages({})).toEqual([]);
    expect(readGalleryImages(null)).toEqual([]);
  });
});

describe('immowelt gallery', () => {
  it('reads photos and floor plans from the exposé server state', async () => {
    const html = await readFixture('immowelt_detail_serverstate.html');

    const images = extractExposeImages(html);

    expect(images.length).toBeGreaterThan(0);
    expect(images.length).toBeLessThanOrEqual(MAX_GALLERY_IMAGES);
    expect(new Set(images).size).toBe(images.length);
    for (const url of images) {
      expect(url.startsWith('https://')).toBe(true);
    }
  });

  it('answers empty for a page without server state', () => {
    expect(extractExposeImages('<html></html>')).toEqual([]);
  });
});

describe('kleinanzeigen gallery', () => {
  it('dedupes the sized variants into full-size JPEGs', async () => {
    const html = await readFixture('kleinanzeigen_detail.html');
    const $ = cheerio.load(html);

    const images = extractDetailImages($);

    expect(images.length).toBeGreaterThan(0);
    expect(images.length).toBeLessThanOrEqual(MAX_GALLERY_IMAGES);
    expect(new Set(images).size).toBe(images.length);
    for (const url of images) {
      expect(url).toMatch(
        /^https:\/\/img\.kleinanzeigen\.de\/api\/v1\/prod-ads\/images\/(?:[0-9a-f]{2}\/)?[0-9a-f-]{36}\?rule=\$_59\.JPG$/i,
      );
    }
  });

  it('answers empty for a page without gallery images', () => {
    expect(extractDetailImages(cheerio.load('<html></html>'))).toEqual([]);
  });
});
