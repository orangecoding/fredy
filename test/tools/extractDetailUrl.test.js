/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractFirstDetailUrl } from '../../tools/testFixtures/extractDetailUrl.js';

/** Run-scoped provider config, built per test via createConfig(). */
let runConfig;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '..', 'testFixtures');
const TEST_PROVIDER_PATH = path.join(__dirname, '..', 'provider', 'testProvider.json');

const testProviderConfig = JSON.parse(readFileSync(TEST_PROVIDER_PATH, 'utf-8'));

/**
 * Providers whose list page fixture is html based and whose detail page fixture is derived from it.
 * These are exactly the selector shapes that used to break the fixture downloader:
 *  - kleinanzeigen: attribute containing a dash (`.aditem@data-href`)
 *  - wgGesucht: selector that only resolves correctly when scoped to the crawl container (`a@href`)
 *
 * Immowelt and immobilien.de used to be here too. Neither reads its listings out of the markup any
 * more - immowelt asks its search BFF, immobilien.de reads the payload its Next.js pages ship - so
 * neither has a crawl container to extract anything from, and the downloader reaches their detail
 * pages through `detailUrlFromGetListings` instead.
 */
const providersWithDetailPages = ['kleinanzeigen', 'wgGesucht', 'sparkasse'];

describe('extractFirstDetailUrl', () => {
  for (const providerName of providersWithDetailPages) {
    it(`finds the detail url in the ${providerName} list fixture`, async () => {
      const provider = await import(`../../lib/provider/${providerName}.js`);
      runConfig = provider.createConfig(testProviderConfig[providerName], [], []);

      const html = readFileSync(path.join(FIXTURES_DIR, `${providerName}.html`), 'utf-8');
      const detailUrl = extractFirstDetailUrl(html, runConfig);

      expect(detailUrl).toBeTruthy();
      expect(detailUrl).toMatch(/^https?:\/\//);
      expect(detailUrl).not.toBe(runConfig.url);
    });
  }

  it('returns null when the crawl container matches nothing', async () => {
    const provider = await import('../../lib/provider/kleinanzeigen.js');
    runConfig = provider.createConfig(testProviderConfig.kleinanzeigen, [], []);

    expect(extractFirstDetailUrl('<html><body>nothing here</body></html>', runConfig)).toBeNull();
  });

  it('returns null for an incomplete provider config', () => {
    expect(extractFirstDetailUrl('<html></html>', {})).toBeNull();
    expect(extractFirstDetailUrl('', { crawlContainer: 'a', crawlFields: {} })).toBeNull();
  });
});
