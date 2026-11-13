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

/**
 * The recorded exposé with figures of the "Kosten" panel replaced, keyed by their label.
 *
 * @param {Record<string, string>} costs For example `{ 'Miete:': '1.150€' }`.
 * @returns {string}
 */
const withCosts = (costs) =>
  Object.entries(costs).reduce(
    (html, [label, value]) =>
      html.replace(
        new RegExp(`(class="section_panel_detail">\\s*${label}[\\s\\S]*?class="section_panel_value">)[^<]*`),
        `$1${value}`,
      ),
    fixture('wgGesucht_detail.html'),
  );

const LISTING = { id: 'x', link: 'https://www.wg-gesucht.de/wg-zimmer-in-Duesseldorf-Innenstadt.10468197.html' };

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
    // "Sonstige Kosten" stays "n.a.", so a sum of the stated charges would come to 200.
    puppeteerExtractor.mockResolvedValue(withCosts({ 'Miete:': '1.150€', 'Nebenkosten:': '200€' }));
    const enriched = await config.fetchDetails({ ...LISTING, price: 1400, chargesIncluded: true }, null);

    expect(enriched).toMatchObject({ price: 1400, chargesIncluded: true, charges: 250 });
  });

  it('reads charges of nothing where the advert states them as nothing', async () => {
    puppeteerExtractor.mockResolvedValue(withCosts({ 'Miete:': '1.400€', 'Nebenkosten:': '0€' }));
    const enriched = await config.fetchDetails({ ...LISTING, price: 1400, chargesIncluded: true }, null);

    expect(enriched.charges).toBe(0);
  });

  it('leaves the charges unknown where the panel states none', async () => {
    puppeteerExtractor.mockResolvedValue(
      withCosts({ 'Miete:': '1.400€', 'Nebenkosten:': 'n.a.', 'Sonstige Kosten:': 'n.a.' }),
    );
    const enriched = await config.fetchDetails({ ...LISTING, price: 1400, chargesIncluded: true }, null);

    expect(enriched.charges).toBeUndefined();
  });

  it('leaves the charges unknown where the panel states no Miete within the Gesamtmiete', async () => {
    for (const miete of ['n.a.', '1.500€']) {
      puppeteerExtractor.mockResolvedValue(withCosts({ 'Miete:': miete, 'Nebenkosten:': '250€' }));
      const enriched = await config.fetchDetails({ ...LISTING, price: 1400, chargesIncluded: true }, null);

      expect({ miete, charges: enriched.charges }).toEqual({ miete, charges: undefined });
    }
  });

  it('reads the charges when a listing is added by its URL', async () => {
    puppeteerExtractor.mockResolvedValue(withCosts({ 'Miete:': '499€', 'Nebenkosten:': '100€' }));
    const listing = await config.fetchListingByUrl(LISTING.link, null);

    expect(listing).toMatchObject({ price: 599, chargesIncluded: true, charges: 100 });
  });
});
