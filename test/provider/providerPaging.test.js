/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { getProviders } from '../../lib/utils.js';
import { providerConfig } from '../utils.js';

/**
 * How every provider reaches result page N, for the job setting that reads more than one page.
 *
 * A provider either says how to address a page (`pageUrl`, or `readPages` for a portal whose pager
 * can only be clicked), or is listed here because its answer already is the whole result. A new
 * provider that does neither fails the first test: the job form would offer it a page count it
 * silently ignores.
 */

/**
 * The providers whose result is whole after one call, so the page count does not apply to them.
 * tecnocasa and tecnorete, deutscheWohnen and inberlinwohnen cannot sort by date and walk every
 * page themselves; betterhomes and zvgPortal answer the whole search in one response.
 */
const WHOLE_RESULT = ['betterhomes', 'deutscheWohnen', 'inberlinwohnen', 'tecnocasa', 'tecnorete', 'zvgPortal'];

/**
 * One search per provider and what its second and third page are, with a page number already in
 * the search where the portal takes one, so page 1 shows that it is dropped or reset.
 *
 * @type {Array<[string, string, string, string, string]>} id, search, page 1, page 2, page 3
 */
const PAGES = [
  [
    'immoscout',
    'https://api.mobile.immobilienscout24.de/search/list?searchType=region&geocodes=%2Fde%2Fberlin%2Fberlin&sorting=-firstactivation',
    'https://api.mobile.immobilienscout24.de/search/list?searchType=region&geocodes=%2Fde%2Fberlin%2Fberlin&sorting=-firstactivation',
    'https://api.mobile.immobilienscout24.de/search/list?searchType=region&geocodes=%2Fde%2Fberlin%2Fberlin&sorting=-firstactivation&pagenumber=2',
    'https://api.mobile.immobilienscout24.de/search/list?searchType=region&geocodes=%2Fde%2Fberlin%2Fberlin&sorting=-firstactivation&pagenumber=3',
  ],
  [
    'kleinanzeigen',
    'https://www.kleinanzeigen.de/s-immobilien/duesseldorf/anzeige:angebote/seite:4/wohnung/k0c195l2068r5',
    'https://www.kleinanzeigen.de/s-immobilien/duesseldorf/anzeige:angebote/wohnung/k0c195l2068r5',
    'https://www.kleinanzeigen.de/s-immobilien/duesseldorf/anzeige:angebote/seite:2/wohnung/k0c195l2068r5',
    'https://www.kleinanzeigen.de/s-immobilien/duesseldorf/anzeige:angebote/seite:3/wohnung/k0c195l2068r5',
  ],
  [
    'kleinanzeigen',
    'https://www.kleinanzeigen.de/s-wohnung-mieten/berlin/c203l3331',
    'https://www.kleinanzeigen.de/s-wohnung-mieten/berlin/c203l3331',
    'https://www.kleinanzeigen.de/s-wohnung-mieten/berlin/seite:2/c203l3331',
    'https://www.kleinanzeigen.de/s-wohnung-mieten/berlin/seite:3/c203l3331',
  ],
  [
    'wgGesucht',
    'https://www.wg-gesucht.de/wg-zimmer-in-Duesseldorf.30.0.1.4.html?sort_column=0',
    'https://www.wg-gesucht.de/wg-zimmer-in-Duesseldorf.30.0.1.0.html?sort_column=0',
    'https://www.wg-gesucht.de/wg-zimmer-in-Duesseldorf.30.0.1.1.html?sort_column=0',
    'https://www.wg-gesucht.de/wg-zimmer-in-Duesseldorf.30.0.1.2.html?sort_column=0',
  ],
  [
    'imaxx',
    'https://www.imaxx.de/immobilien/page/4/?post_type=immomakler_object&im_order=datedesc',
    'https://www.imaxx.de/immobilien/?post_type=immomakler_object&im_order=datedesc',
    'https://www.imaxx.de/immobilien/page/2/?post_type=immomakler_object&im_order=datedesc',
    'https://www.imaxx.de/immobilien/page/3/?post_type=immomakler_object&im_order=datedesc',
  ],
  [
    'idealista',
    'https://www.idealista.it/affitto-case/roma-roma/lista-4.htm',
    'https://www.idealista.it/affitto-case/roma-roma/',
    'https://www.idealista.it/affitto-case/roma-roma/lista-2.htm',
    'https://www.idealista.it/affitto-case/roma-roma/lista-3.htm',
  ],
  [
    'gratka',
    'https://gratka.pl/nieruchomosci/domy/krakow?page=4&sort=newest',
    'https://gratka.pl/nieruchomosci/domy/krakow?sort=newest',
    'https://gratka.pl/nieruchomosci/domy/krakow?page=2&sort=newest',
    'https://gratka.pl/nieruchomosci/domy/krakow?page=3&sort=newest',
  ],
  [
    'domiporta',
    'https://www.domiporta.pl/dom/sprzedam/krakow?PageNumber=4',
    'https://www.domiporta.pl/dom/sprzedam/krakow?PageNumber=1',
    'https://www.domiporta.pl/dom/sprzedam/krakow?PageNumber=2',
    'https://www.domiporta.pl/dom/sprzedam/krakow?PageNumber=3',
  ],
  [
    'subito',
    'https://www.subito.it/annunci-lazio/affitto/appartamenti/roma/?order=datedesc&o=4',
    'https://www.subito.it/annunci-lazio/affitto/appartamenti/roma/?order=datedesc',
    'https://www.subito.it/annunci-lazio/affitto/appartamenti/roma/?order=datedesc&o=2',
    'https://www.subito.it/annunci-lazio/affitto/appartamenti/roma/?order=datedesc&o=3',
  ],
  [
    'regionalimmobilien24',
    'https://www.regionalimmobilien24.de/rostock/rostock/kaufen/haus/-/-/-/?rd=5',
    'https://www.regionalimmobilien24.de/rostock/rostock/kaufen/haus/-/-/-/?rd=5',
    'https://www.regionalimmobilien24.de/rostock/rostock/kaufen/haus/-/-/-/?rd=5&p=2',
    'https://www.regionalimmobilien24.de/rostock/rostock/kaufen/haus/-/-/-/?rd=5&p=3',
  ],
];

describe('provider paging', () => {
  /** @type {Map<string, any>} */
  let providers;

  beforeAll(async () => {
    providers = new Map((await getProviders()).map((provider) => [provider.metaInformation.id, provider]));
  });

  it('gives every provider a way to reach page N, or lists it as reading its whole result', () => {
    for (const [id, provider] of providers) {
      const { pageUrl, readPages } = provider.config;
      const pageable = typeof pageUrl === 'function' || typeof readPages === 'function';
      expect(pageable || WHOLE_RESULT.includes(id), `${id} declares neither pageUrl nor readPages`).toBe(true);
      expect(pageable && WHOLE_RESULT.includes(id), `${id} pages but is listed as reading its whole result`).toBe(
        false,
      );
      expect(typeof pageUrl === 'function' && typeof readPages === 'function', `${id} declares both`).toBe(false);
    }
  });

  it('keeps pageUrl on the run-scoped config', () => {
    for (const [id, provider] of providers) {
      if (typeof provider.config.pageUrl !== 'function' || providerConfig[id] == null) continue;
      const runConfig = provider.createConfig(providerConfig[id], []);
      expect(typeof runConfig.pageUrl, id).toBe('function');
    }
  });

  it.each(PAGES)('addresses the pages of a %s search', (id, search, first, second, third) => {
    const { pageUrl } = providers.get(id).config;
    expect(pageUrl(search, 1)).toBe(first);
    expect(pageUrl(search, 2)).toBe(second);
    expect(pageUrl(search, 3)).toBe(third);
  });

  it('leaves a first page that names no page exactly as it was written', () => {
    const untouched = 'https://immo.swp.de/suchergebnisse?l=M%C3%BCnchen&r=0km&pf=&s=most_recently_updated_first';
    expect(providers.get('immoswp').config.pageUrl(untouched, 1)).toBe(untouched);
  });
});
