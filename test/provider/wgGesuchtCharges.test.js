/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import puppeteerExtractor from '../../lib/services/extractor/puppeteerExtractor.js';
import { parse } from '../../lib/services/extractor/parser/parser.js';
import { config } from '../../lib/provider/wgGesucht.js';

/**
 * WG-Gesucht quotes the Gesamtmiete on its result cards, and Fredy reads a rent without
 * `chargesIncluded` as a Kaltmiete, so without the flag a 1.400 € Gesamtmiete would be shown as a
 * 1.400 € cold rent with estimated Nebenkosten on top. The advert's "Kosten" panel states the Miete,
 * which gives the charges in the Gesamtmiete.
 */

vi.mock('../../lib/services/extractor/puppeteerExtractor.js', () => ({ default: vi.fn() }));

const fixture = (name) => fs.readFileSync(path.resolve('test/testFixtures', name), 'utf8');

/** The recorded exposé with the "Kosten" panel's Miete replaced. */
const withMiete = (miete) =>
  fixture('wgGesucht_detail.html').replace(
    /(Miete:\s*<\/span>\s*<\/div>\s*<div class="col-xs-6">\s*<span class="section_panel_value">\s*)799€/,
    `$1${miete}`,
  );

const LISTING = { id: 'x', link: 'https://www.wg-gesucht.de/wg-zimmer-in-Duesseldorf-Derendorf.14247424.html' };

beforeEach(() => {
  puppeteerExtractor.mockReset();
});

describe('wg-gesucht rent', () => {
  it('marks every search result as a rent with the charges in it', () => {
    const normalized = parse(config.crawlContainer, config.crawlFields, fixture('wgGesucht.html')).map((card) =>
      config.normalize(card),
    );

    expect(normalized.length).toBeGreaterThan(0);
    expect(normalized.every((listing) => listing.chargesIncluded === true)).toBe(true);
  });

  it('takes the charges as the Gesamtmiete less the stated Miete', async () => {
    puppeteerExtractor.mockResolvedValue(withMiete('1.150€'));
    const enriched = await config.fetchDetails({ ...LISTING, price: 1400, chargesIncluded: true }, null);

    expect(enriched).toMatchObject({ price: 1400, chargesIncluded: true, charges: 250 });
  });

  it('reads no charges into a Gesamtmiete that is all Miete', async () => {
    puppeteerExtractor.mockResolvedValue(fixture('wgGesucht_detail.html'));
    const enriched = await config.fetchDetails({ ...LISTING, price: 799, chargesIncluded: true }, null);

    expect(enriched.charges).toBe(0);
  });

  it('leaves the charges unknown where the panel states no Miete within the Gesamtmiete', async () => {
    for (const miete of ['n.a.', '1.500€']) {
      puppeteerExtractor.mockResolvedValue(withMiete(miete));
      const enriched = await config.fetchDetails({ ...LISTING, price: 1400, chargesIncluded: true }, null);

      expect({ miete, charges: enriched.charges }).toEqual({ miete, charges: undefined });
    }
  });

  it('reads the charges when a listing is added by its URL', async () => {
    puppeteerExtractor.mockResolvedValue(fixture('wgGesucht_detail.html'));
    const listing = await config.fetchListingByUrl(LISTING.link, null);

    expect(listing).toMatchObject({ price: 799, chargesIncluded: true, charges: 0 });
  });
});
