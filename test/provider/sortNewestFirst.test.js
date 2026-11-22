/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it } from 'vitest';
import sortByDate from '../../lib/services/queryStringMutator.js';
import { config as engelVoelkers } from '../../lib/provider/engelVoelkers.js';
import { config as kleinanzeigen } from '../../lib/provider/kleinanzeigen.js';
import { config as ohneMakler } from '../../lib/provider/ohneMakler.js';

/**
 * Three portals that stopped answering a run with their newest adverts first, checked live on
 * 2026-11-22: Engel & Völkers swapped the old `CREATED_AT_DESC` for its smart sort, and
 * Kleinanzeigen and ohne-makler.net default to a recommended or relevance order. A run reads the
 * first page or pages only, so in any other order an advert posted today can sit too far back to be
 * read at all.
 *
 * Each case is the url the pipeline asks for: the sort applied to the job's search, then the page.
 *
 * @param {import('../../lib/types/providerConfig.js').ProviderConfig} config
 * @param {string} url the job's search url
 * @param {number} page
 * @returns {URL}
 */
const requested = (config, url, page) => new URL(config.pageUrl(sortByDate(url, config.sortByDateParam), page));

describe('sort by date', () => {
  it('asks Engel & Völkers for "Neueste zuerst" in place of the sort a pasted search carries', () => {
    const url = requested(
      engelVoelkers,
      'https://www.engelvoelkers.com/de/de/propertysearch?businessArea%5B%5D=residential&placeIds%5B%5D=ChIJAVkDPzdOqEcRcDteW0YgIQQ&propertyMarketingType%5B%5D=sale&sortingOptions%5B%5D=SALES_PRICE_DESC',
      2,
    );

    expect(url.searchParams.getAll('sortingOptions[]')).toEqual(['PUBLISHED_AT_DESC']);
    expect(url.searchParams.get('placeIds[]')).toBe('ChIJAVkDPzdOqEcRcDteW0YgIQQ');
    expect(url.searchParams.get('propertyMarketingType[]')).toBe('sale');
    expect(url.searchParams.get('page')).toBe('2');
  });

  it('asks Kleinanzeigen for "Neueste" and keeps it on every page', () => {
    const search = 'https://www.kleinanzeigen.de/s-wohnung-mieten/berlin/preis:500:1500/dachterrasse/k0c203l3331';

    const first = requested(kleinanzeigen, search, 1);
    expect(first.pathname).toBe('/s-wohnung-mieten/berlin/preis:500:1500/dachterrasse/k0c203l3331');
    expect(first.searchParams.get('sortingField')).toBe('SORTING_DATE');

    const second = requested(kleinanzeigen, search, 2);
    expect(second.pathname).toBe('/s-wohnung-mieten/berlin/preis:500:1500/seite:2/dachterrasse/k0c203l3331');
    expect(second.searchParams.get('sortingField')).toBe('SORTING_DATE');
  });

  it('asks Kleinanzeigen for "Neueste" over a sort a pasted search carries in its path', () => {
    // The site lets the query parameter win over the segment, so the segment can stay as pasted.
    const url = requested(
      kleinanzeigen,
      'https://www.kleinanzeigen.de/s-wohnung-mieten/berlin/sortierung:preis/c203l3331',
      1,
    );

    expect(url.searchParams.getAll('sortingField')).toEqual(['SORTING_DATE']);
  });

  it('asks ohne-makler.net for "Neueste zuerst" in place of the sort a pasted search carries', () => {
    const url = requested(
      ohneMakler,
      'https://www.ohne-makler.net/immobilien/wohnung-mieten/berlin/berlin/?sort=price_asc&price_max=1500',
      2,
    );

    expect(url.searchParams.getAll('sort')).toEqual(['date_desc']);
    expect(url.searchParams.get('price_max')).toBe('1500');
    expect(url.searchParams.get('page')).toBe('2');
  });
});
