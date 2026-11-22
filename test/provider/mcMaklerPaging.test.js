/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it } from 'vitest';
import { config } from '../../lib/provider/mcMakler.js';

/** One advert as the site's listing api answers it (recorded 2026-11-22). */
const advert = {
  id: '1070688',
  detailPath: '/expose/1070688',
  title: 'Baugrundstück in zweiter Reihe',
  ariaSummaryLabel: 'Baugrundstück in zweiter Reihe, 12621 Berlin, 249.000 €, Grundstücksfläche 674 m²',
  location: '12621 Berlin',
  priceLabel: '249.000 €',
  imageUrl: 'https://images.mcmakler.de/assets/expose_v2/a.JPG',
  stats: [{ ariaLabel: 'Grundstücksfläche 674 m²', kind: 'plot', label: 'Grundstück', unit: 'm²', value: '674' }],
};

/**
 * A browser whose one page answers the api with `answer`, recording what it was asked.
 *
 * @param {any} answer
 * @returns {{browser: any, paths: string[]}}
 */
function browserAnswering(answer) {
  const paths = [];
  const page = {
    goto: async () => {},
    waitForFunction: () => Promise.reject(new Error('no datadome here')),
    evaluate: async (_fn, path) => {
      paths.push(path);
      return answer;
    },
    isClosed: () => false,
    close: async () => {},
  };
  return { browser: { newPage: async () => page }, paths };
}

describe('mcMakler paging', () => {
  const search = 'https://www.mcmakler.de/immobilien?city=Berlin&sort=newest';

  it('reads a later page from the listing api, thirty adverts on', async () => {
    const { browser, paths } = browserAnswering({ body: { ok: true, listings: [advert], total: 49 } });
    const raw = await config.getListings(config.pageUrl(search, 2), browser);

    const query = new URLSearchParams(paths[0].split('?')[1]);
    expect(paths[0].startsWith('/immobilien/api/listings?')).toBe(true);
    expect(Object.fromEntries(query)).toEqual({ city: 'Berlin', sort: 'newest', skip: '30', limit: '30' });

    expect(config.normalize(raw[0])).toMatchObject({
      link: 'https://www.mcmakler.de/immobilien/expose/1070688',
      title: 'Baugrundstück in zweiter Reihe',
      price: 249000,
      size: 674,
      rooms: null,
      address: '12621 Berlin',
      image: advert.imageUrl,
    });
  });

  it('has no later page for a search without a place, which the site does not page either', async () => {
    const { browser, paths } = browserAnswering({ body: { ok: true, listings: [advert] } });
    expect(await config.getListings('https://www.mcmakler.de/immobilien?sort=newest&page=2', browser)).toEqual([]);
    expect(paths).toEqual([]);
  });

  it('fails a later page the api refuses, which the pipeline turns into the end of the walk', async () => {
    const { browser } = browserAnswering({ status: 403 });
    await expect(config.getListings(config.pageUrl(search, 2), browser)).rejects.toThrow(/did not answer page 2/);
  });
});
