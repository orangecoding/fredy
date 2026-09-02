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
import { config } from '../../lib/provider/kleinanzeigen.js';

/**
 * Regression tests for https://github.com/orangecoding/fredy/issues/449 - a Kleinanzeigen job
 * stopped returning anything at all while the same search URL kept showing new ads in a browser.
 *
 * Kleinanzeigen rebuilt the search results page and dropped the `.ad-listitem` / `.aditem-main--*`
 * classes the provider was written against, so the crawl container matched nothing and every run
 * ended with an empty page rather than an error. Nothing said so: the suite was green throughout,
 * because the checked-in fixture still held the old markup, and a provider whose selectors have
 * rotted looks exactly like a search with no new results.
 *
 * Which is what these cases are for. They are written against the *shape* of an answer rather than
 * against particular ads, so refreshing the fixture does not rewrite them: how many results the
 * page holds is counted out of the raw HTML instead of through a selector, and every assertion
 * below is about a field being populated across the page rather than about what one listing says.
 * A selector that stops matching takes a field to null for every result at once, and that is
 * precisely what fails here.
 */
const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../testFixtures');

const html = await readFile(path.join(FIXTURES_DIR, 'kleinanzeigen.html'), 'utf-8');
const rows = parse(config.crawlContainer, config.crawlFields, html, 'kleinanzeigen.html') ?? [];

/** How many results the page actually holds, counted without going through a selector. */
const adsOnPage = new Set([...html.matchAll(/data-adid="(\d+)"/g)].map((match) => match[1])).size;

/**
 * @param {string} field
 * @returns {number} How many results carry a value for it.
 */
const populated = (field) => rows.filter((row) => row[field] != null && row[field] !== '').length;

describe('kleinanzeigen search results', () => {
  it('finds every ad the page holds', () => {
    // The bug itself: the container matched nothing, so this was 0 against a page of 25 ads.
    expect(adsOnPage).toBeGreaterThan(10);
    expect(rows.length).toBe(adsOnPage);
  });

  it('identifies every result', () => {
    // The three the pipeline refuses to store a listing without.
    for (const field of ['id', 'link', 'title']) {
      expect({ field, missing: rows.length - populated(field) }).toEqual({ field, missing: 0 });
    }
    expect(rows.every((row) => /^\/s-anzeige\//.test(row.link))).toBe(true);
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
  });

  it('reads the figures and the text off most results', () => {
    // Not every result carries every field - an ad may have no photo, and a service ad has no
    // living space - but a selector that has rotted takes its field to null across the whole page.
    for (const field of ['price', 'tags', 'description', 'address', 'image']) {
      expect({ field, populated: populated(field) > rows.length / 2 }).toEqual({ field, populated: true });
    }
  });

  it('reads the asking price rather than the one it was reduced from', () => {
    // A reduced ad shows the old price struck through next to the new one. A selector matching
    // both concatenates them into "450 €500 €", which parses as an absurd number.
    for (const row of rows) {
      expect({ price: row.price, euroSigns: (row.price?.match(/€/g) ?? []).length }).toEqual({
        price: row.price,
        euroSigns: row.price?.includes('€') ? 1 : 0,
      });
    }
  });

  it('takes the ad photo rather than the seller logo', () => {
    // Both are `<img>` inside the same article; the company logo is served from a different path.
    const logos = rows.filter((row) => row.image != null && !row.image.includes('/prod-ads/'));
    expect(logos).toEqual([]);
  });

  it('leaves the distance from the search centre out of the address', () => {
    // The location line continues with "(ca. 20 km)", which the old markup ran together with the
    // locality and which is not something the geocoder should be handed.
    const withDistance = rows.map((row) => row.address).filter((address) => /\(.*\bkm\)/.test(address ?? ''));
    expect(withDistance).toEqual([]);
  });

  it('normalizes into what the pipeline stores', () => {
    const normalized = rows.map((row) => config.normalize(row));

    expect(normalized.every((listing) => listing.link.startsWith('https://www.kleinanzeigen.de/'))).toBe(true);
    expect(normalized.filter((listing) => typeof listing.price === 'number').length).toBeGreaterThan(rows.length / 2);
    expect(normalized.filter((listing) => typeof listing.size === 'number').length).toBeGreaterThan(rows.length / 2);
    expect(normalized.filter((listing) => typeof listing.rooms === 'number').length).toBeGreaterThan(rows.length / 2);
    // Size and rooms are read off one tag line, and reading them by position once swapped them.
    for (const listing of normalized) {
      if (typeof listing.size === 'number' && typeof listing.rooms === 'number') {
        expect({ id: listing.id, sane: listing.size > listing.rooms }).toEqual({ id: listing.id, sane: true });
      }
    }
  });
});
