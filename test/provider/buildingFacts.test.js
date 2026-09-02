/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

vi.mock('../../lib/services/extractor/puppeteerExtractor.js', () => ({ default: vi.fn() }));
vi.mock('../../lib/services/immowelt/immoweltBff.js', () => ({
  searchClassifieds: vi.fn(),
  fetchExposeHtml: vi.fn(),
}));
vi.mock('../../lib/services/logger.js', () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import puppeteerExtractor from '../../lib/services/extractor/puppeteerExtractor.js';
import { fetchExposeHtml } from '../../lib/services/immowelt/immoweltBff.js';
import { config as immoscoutConfig } from '../../lib/provider/immoscout.js';
import { config as immoweltConfig } from '../../lib/provider/immowelt.js';
import { config as kleinanzeigenConfig } from '../../lib/provider/kleinanzeigen.js';
import { config as sparkasseConfig } from '../../lib/provider/sparkasse.js';
import { config as engelVoelkersConfig } from '../../lib/provider/engelVoelkers.js';
import { config as wgGesuchtConfig } from '../../lib/provider/wgGesucht.js';

/**
 * Every provider's path to the Baujahr and the energy efficiency class, against the real payloads.
 * The extractors themselves are covered in `test/utils/buildingFacts.test.js`; what is tested here
 * is the wiring - which of the three sources each provider reads, and that it reads the one its
 * exposé actually carries.
 */
const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../testFixtures');
const readFixture = async (name) => readFile(path.join(FIXTURES_DIR, name), 'utf-8');

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('immoscout', () => {
  beforeEach(async () => {
    const detail = JSON.parse(await readFixture('immoscout_detail.json'));
    vi.stubGlobal('fetch', async () => ({ ok: true, status: 200, json: async () => detail }));
  });

  it('reads the Baujahr and the class its label picture names', async () => {
    const enriched = await immoscoutConfig.fetchDetails({
      link: 'https://www.immobilienscout24.de/expose/168963883',
    });

    // The exposé states "Baujahr: 1950" next to "Baujahr laut Energieausweis: 2025".
    expect(enriched.buildYear).toBe(1950);
    // Stated as `.../energy-efficiency-labels/C.png` and nowhere as text.
    expect(enriched.energyClass).toBe('C');
  });
});

describe('immowelt', () => {
  it('reads both facts out of the energy section', async () => {
    fetchExposeHtml.mockResolvedValue(await readFixture('immowelt_detail_serverstate.html'));

    const enriched = await immoweltConfig.fetchDetails({ id: '1', link: 'https://www.immowelt.de/expose/abc' }, null);

    expect(enriched.buildYear).toBe(2026);
    expect(enriched.energyClass).toBe('A+');
  });
});

describe('sparkasse', () => {
  it('reads both facts out of the attribute tables', async () => {
    const html = await readFixture('sparkasse_detail.html');

    const enriched = await sparkasseConfig.fetchDetails({ id: '1', link: 'https://x' }, null, async () => html);

    expect(enriched.buildYear).toBe(1993);
    expect(enriched.energyClass).toBe('E');
  });
});

describe('engelVoelkers', () => {
  it('reads the class the payload states as a range', async () => {
    puppeteerExtractor.mockResolvedValue(await readFixture('engelVoelkers_detail.html'));

    const enriched = await engelVoelkersConfig.fetchDetails({ id: '1', link: 'https://x' }, null);

    expect(enriched.energyClass).toBe('D');
  });
});

describe('kleinanzeigen', () => {
  it('reads the Baujahr off the attribute list when the ad states one', async () => {
    puppeteerExtractor.mockResolvedValue(await readFixture('kleinanzeigen_detail.html'));

    const enriched = await kleinanzeigenConfig.fetchDetails(
      { id: 'a', link: '/s-anzeige/schoene-wohnung/1234-203-2462' },
      null,
    );

    expect(enriched.buildYear).toBe(1968);
  });

  it('reports no Baujahr for an ad whose attribute list leaves it out', async () => {
    // Half of Kleinanzeigen's private ads never fill the field in, and reading a year out of the
    // next attribute along would be worse than saying nothing.
    puppeteerExtractor.mockResolvedValue(
      (await readFixture('kleinanzeigen_detail.html')).replaceAll('Baujahr', 'Bauart'),
    );

    const enriched = await kleinanzeigenConfig.fetchDetails(
      { id: 'a', link: '/s-anzeige/schoene-wohnung/1234-203-2462' },
      null,
    );

    expect(enriched.buildYear).toBeNull();
  });

  it('falls back to the ad text for the class the attribute list never carries', async () => {
    puppeteerExtractor.mockResolvedValue(await readFixture('kleinanzeigen_detail.html'));

    const enriched = await kleinanzeigenConfig.fetchDetails(
      { id: 'a', link: '/s-anzeige/schoene-wohnung/1234-203-2462' },
      null,
    );

    // No Kleinanzeigen ad states the energy class as an attribute; sellers who give one write it
    // into the ad text, which is the only place this can come from.
    expect(enriched.energyClass).toBe('E');
  });
});

describe('providers without a field of their own', () => {
  it('reads both facts out of the description wgGesucht renders', async () => {
    puppeteerExtractor.mockResolvedValue(
      '<html><body><div id="freitext_0">Altbau, Baujahr 1904. Energieeffizienzklasse D.</div></body></html>',
    );

    const enriched = await wgGesuchtConfig.fetchDetails({ id: '1', link: 'https://www.wg-gesucht.de/1.html' }, null);

    expect(enriched).toMatchObject({ buildYear: 1904, energyClass: 'D' });
  });
});
