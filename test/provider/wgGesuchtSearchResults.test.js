/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

vi.mock('../../lib/services/logger.js', () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { parse } from '../../lib/services/extractor/parser/parser.js';
import { config } from '../../lib/provider/wgGesucht.js';

/**
 * WG-Gesucht rebuilt its result list, and the provider found nothing at all afterwards: the cards
 * stopped being `.wgg_card` divs with a title link inside and became one `a.wgg-list-card` each,
 * so the crawl container matched nothing and every run ended as an empty page rather than an error.
 *
 * Written against the shape of the page rather than against particular ads, the same way the
 * Kleinanzeigen results are, so refreshing the fixture does not rewrite these cases. How many
 * listings the page holds is counted out of the raw HTML instead of through a selector.
 */
const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../testFixtures');

const html = await readFile(path.join(FIXTURES_DIR, 'wgGesucht.html'), 'utf-8');
const rows = parse(config.crawlContainer, config.crawlFields, html, 'wgGesucht.html') ?? [];

/**
 * How many listings the page links to, counted without going through a selector.
 *
 * The partner ads link off-site, and a pinned listing links back to the search, so only a link to a
 * listing's own page counts. A pinned listing shows up again further down at its own address.
 */
const listingsOnPage = new Set(
  [...html.matchAll(/href="\/wg-zimmer-in-[\w-]+\.(\d+)\.html"/g)].map((match) => match[1]),
).size;

/**
 * @param {string} field
 * @returns {number} How many results carry a value for it.
 */
const populated = (field) => rows.filter((row) => row[field] != null && row[field] !== '').length;

describe('wg-gesucht search results', () => {
  it('finds every listing the page holds', () => {
    // The bug itself: the container matched nothing, so this was 0 against a page of 26 listings.
    expect(listingsOnPage).toBeGreaterThan(10);
    expect(rows.length).toBe(listingsOnPage);
  });

  it('links every result to its own page', () => {
    // A pinned listing's card links to the search with an `asset_id`, which is no exposé at all.
    expect(rows.every((row) => /^\/wg-zimmer-in-[\w-]+\.\d+\.html$/.test(row.link))).toBe(true);
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
  });

  it('reads the figures and the text off every result', () => {
    for (const field of ['id', 'title', 'price', 'size', 'details', 'image']) {
      expect({ field, missing: rows.length - populated(field) }).toEqual({ field, missing: 0 });
    }
  });

  it('normalizes into what the pipeline stores', () => {
    const normalized = rows.map((row) => config.normalize(row));

    for (const listing of normalized) {
      expect(listing.link).toMatch(/^https:\/\/www\.wg-gesucht\.de\/wg-zimmer-in-/);
      expect({ id: listing.id, price: typeof listing.price }).toEqual({ id: listing.id, price: 'number' });
      expect({ id: listing.id, size: typeof listing.size }).toEqual({ id: listing.id, size: 'number' });
      // The subtitle reads "3er WG · Düsseldorf Oberbilk · Ellerstraße": the flat share's size, then
      // where it is. The address is the part after the first separator, without the separators.
      expect({ id: listing.id, rooms: typeof listing.rooms }).toEqual({ id: listing.id, rooms: 'number' });
      expect(listing.address).toMatch(/^Düsseldorf/);
      expect(listing.address).not.toMatch(/·/);
    }
  });
});
