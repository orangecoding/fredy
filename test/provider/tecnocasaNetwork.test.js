/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// The walk paces itself between pages. Waiting it out would cost this file a minute of real time
// for what the fetch mock answers instantly, and the pace is the portal's business rather than
// something a test has an opinion about.
vi.mock('../../lib/utils.js', async (importOriginal) => ({
  ...(await importOriginal()),
  sleep: () => Promise.resolve(),
}));

const { config: tecnocasa } = await import('../../lib/provider/tecnocasa.js');
const { config: tecnorete } = await import('../../lib/provider/tecnorete.js');
const { pageUrl, readComponentData, normalize } = await import('../../lib/services/tecnocasa/network.js');

/**
 * The page walk both brands of the Tecnocasa group read their searches with.
 *
 * The platform offers no ordering, so a new advert lands wherever it lands and the walk is the only
 * thing that finds one past the first fifteen. A search over a town runs to thirty pages and a
 * search over a province to a hundred and fifty, which is what makes both ends of the walk worth
 * pinning: that it reads every page, and that it stops.
 */

/** How the platform numbers its result pages: a path segment, never a query parameter. */
const SEARCH_URL = 'https://www.tecnocasa.it/annunci/immobili/lombardia/brescia/erbusco.html';

/**
 * A search page as the platform serves one: a page of adverts and the shape of the whole search,
 * both bound onto the same component.
 *
 * @param {number} page the page this document is
 * @param {number} totalPages how many pages the search is spread over
 * @param {number} [perPage] how many adverts the page carries
 * @returns {string} the html
 */
function searchPage(page, totalPages, perPage = 15) {
  const estates = Array.from({ length: perPage }, (_, index) => ({
    id: (page - 1) * 15 + index + 1,
    title: 'Trilocale in vendita',
    detail_url: `https://www.tecnocasa.it/vendita/appartamenti/brescia/erbusco/${(page - 1) * 15 + index + 1}.html`,
    price: '€ 170.000',
    surface: '75 Mq',
    rooms: '3 locali',
    subtitle: 'Erbusco, Via Verdi - Zocco',
  }));
  const pagination = { current_page: page, total_pages: totalPages, items_per_page: 15, total_items: totalPages * 15 };
  const escape = (value) => JSON.stringify(value).replaceAll('"', '&quot;');

  return `<html><body><estates-index :estates="${escape(estates)}" :pagination="${escape(pagination)}"></estates-index></body></html>`;
}

/**
 * Serve a search of `totalPages` pages, recording which urls were asked for.
 *
 * @param {number} totalPages
 * @returns {{fetch: any, asked: string[]}}
 */
function serveSearch(totalPages) {
  /** @type {string[]} */
  const asked = [];
  const fetchMock = vi.fn(async (url) => {
    const urlStr = String(url);
    asked.push(urlStr);
    const page = Number(/\/pag-(\d+)$/.exec(new URL(urlStr).pathname)?.[1] ?? 1);
    if (page > totalPages) return { ok: true, status: 200, text: async () => '<html><body></body></html>' };
    return { ok: true, status: 200, text: async () => searchPage(page, totalPages, page === totalPages ? 13 : 15) };
  });
  return { fetch: fetchMock, asked };
}

describe('the tecnocasa group page walk', () => {
  /** @type {any} */
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('reads every page the search counts, not just the first', async () => {
    const served = serveSearch(33);
    globalThis.fetch = served.fetch;

    const estates = await tecnocasa.getListings(SEARCH_URL);

    // Thirty-two full pages and a last one of thirteen, which is what 493 adverts come to.
    expect(estates).toHaveLength(493);
    expect(served.asked).toHaveLength(33);
  });

  /**
   * `pages_uri` on the page names a window of seven pages around the current one, so past the
   * seventh page the walk has nothing to copy and has to write the url itself.
   */
  it('numbers a page in the path and leaves the query alone', () => {
    const mapSearch = `${SEARCH_URL}?view=45.84,10.28,45.42,9.65&polygon_id=i-XsP6ABNLpcvVsah6jg`;

    expect(pageUrl(mapSearch, 1)).toBe(mapSearch);
    expect(pageUrl(mapSearch, 12)).toBe(
      'https://www.tecnocasa.it/annunci/immobili/lombardia/brescia/erbusco.html/pag-12?view=45.84,10.28,45.42,9.65&polygon_id=i-XsP6ABNLpcvVsah6jg',
    );
  });

  // A user pastes whatever their browser showed, which is the second page as readily as the first.
  it('starts from page one even when the url pasted into the job was not', () => {
    expect(pageUrl(`${SEARCH_URL}/pag-7`, 1)).toBe(SEARCH_URL);
    expect(pageUrl(`${SEARCH_URL}/pag-7`, 3)).toBe(`${SEARCH_URL}/pag-3`);
    expect(pageUrl(`${SEARCH_URL}/pag-7/`, 3)).toBe(`${SEARCH_URL}/pag-3`);
  });

  // The site answers `…/erbusco.html/` but answers `…/erbusco.html//pag-2` with a 404.
  it('numbers a page behind a trailing slash without doubling it', () => {
    expect(pageUrl(`${SEARCH_URL}/`, 2)).toBe(`${SEARCH_URL}/pag-2`);
  });

  // The fragment is the page's own anchor, and the hub pages link searches with one on the end.
  it('drops the fragment the site links its searches with', () => {
    expect(pageUrl(`${SEARCH_URL}#seo-hub`, 1)).toBe(SEARCH_URL);
  });

  /**
   * The whole of what a search *is* - the contract and the sector in the path, the town or the
   * drawn area, and every filter the form sets - is left exactly as it was pasted, which is what
   * lets a url shape this module has never seen still read correctly. These are the shapes the site
   * generates today.
   *
   * @type {[string, string][]}
   */
  const shapes = [
    // Renting rather than buying: the contract is the first path segment.
    [
      'https://www.tecnorete.it/affitto/immobili/lombardia/brescia/brescia.html?min_price=500&max_rooms=3',
      'https://www.tecnorete.it/affitto/immobili/lombardia/brescia/brescia.html/pag-2?min_price=500&max_rooms=3',
    ],
    // A commercial search, whose path carries a literal plus that must survive being reassembled.
    [
      'https://www.tecnorete.it/annunci+commerciali/immobili/lombardia/brescia/brescia.html',
      'https://www.tecnorete.it/annunci+commerciali/immobili/lombardia/brescia/brescia.html/pag-2',
    ],
    // An area rather than a town.
    [
      'https://www.tecnorete.it/annunci/immobili/campania/napoli/aree/penisola-sorrentina.html',
      'https://www.tecnorete.it/annunci/immobili/campania/napoli/aree/penisola-sorrentina.html/pag-2',
    ],
    // A shape drawn on the map, which names no place in the path at all.
    [
      'https://www.tecnorete.it/annunci/immobili/mappa.html?polygon_id=7rn0P6ABacG5UbvaG7NV',
      'https://www.tecnorete.it/annunci/immobili/mappa.html/pag-2?polygon_id=7rn0P6ABacG5UbvaG7NV',
    ],
  ];

  it.each(shapes)('walks %s without touching what it searches for', (url, second) => {
    expect(pageUrl(url, 1)).toBe(url);
    expect(pageUrl(url, 2)).toBe(second);
  });

  it('stops rather than walking a province out to its end', async () => {
    const served = serveSearch(150);
    globalThis.fetch = served.fetch;

    const estates = await tecnocasa.getListings(SEARCH_URL);

    expect(served.asked.length).toBeLessThanOrEqual(40);
    expect(estates).toHaveLength(served.asked.length * 15);
  });

  /**
   * A page past the last one comes back as the search served over again rather than as an error,
   * so a walk that trusted the page count alone would report the same adverts twice.
   */
  it('ends on a page that repeats the one before it', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, text: async () => searchPage(1, 9) }));

    const estates = await tecnocasa.getListings(SEARCH_URL);

    expect(estates).toHaveLength(15);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('gives up on a search url the portal answers with no adverts', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, text: async () => '<html><body></body></html>' }));

    expect(await tecnocasa.getListings(SEARCH_URL)).toEqual([]);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('gives up when the portal refuses the request', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      text: async () => '',
    }));

    expect(await tecnocasa.getListings(SEARCH_URL)).toEqual([]);
  });
});

describe('the two brands of the tecnocasa group', () => {
  /**
   * Both providers are built from one factory. Sharing the template object rather than a copy of it
   * would let a run of one brand carry the other one's url and blacklist, which is the failure the
   * stateless rule exists for.
   */
  it('read through the same platform without sharing a config object', () => {
    expect(tecnorete).not.toBe(tecnocasa);
    expect(tecnorete.getListings).not.toBe(tecnocasa.getListings);
    expect(tecnorete.requiredFieldNames).toEqual(tecnocasa.requiredFieldNames);
    expect(tecnorete.sortByDateParam).toBeNull();
    expect(tecnocasa.sortByDateParam).toBeNull();
  });

  // Same application, same payload names: the reader is written against tecnocasa's fields and has
  // to find tecnorete's in the same places.
  it('normalize a tecnorete advert with the reader written for tecnocasa', () => {
    const advert = {
      id: 61262118,
      title: 'Trilocale in vendita',
      detail_url: 'https://www.tecnorete.it/vendita/appartamenti/roma/roma/61262118.html',
      price: '€ 375.000',
      surface: '116 Mq',
      rooms: '3 locali',
      subtitle: 'Roma, Via Edoardo Amaldi - Fonte Laurentina',
      images: [{ url: { card: 'https://cdn-media.medialabtc.it/it/card.jpeg' } }],
    };

    expect(tecnorete.normalize(advert)).toMatchObject({
      title: 'Trilocale in vendita',
      link: 'https://www.tecnorete.it/vendita/appartamenti/roma/roma/61262118.html',
      price: 375000,
      size: 116,
      rooms: 3,
      // The card writes the town first and files the street under a quarter; Nominatim answers that
      // whole line with nothing.
      address: 'Via Edoardo Amaldi, Roma',
    });
  });
});

describe('reading an advert off a card', () => {
  /**
   * The card writes the place in one of three shapes, and the quarter the agency files a street
   * under is in none of them an address Nominatim answers. The third shape is what an advert whose
   * owner does not want the address published comes back as: a town and a quarter, no street.
   *
   * @type {[string, string|null][]}
   */
  const subtitles = [
    ['Roma, Via Casilina - Casilina', 'Via Casilina, Roma'],
    ['Erbusco, Via Iseo', 'Via Iseo, Erbusco'],
    ['Brescia - Mompiano', 'Brescia'],
    ['Rovato', 'Rovato'],
    ['', null],
  ];

  it.each(subtitles)('read the place off %s as an address the geocoder answers', (subtitle, address) => {
    expect(normalize({ id: 1, subtitle }).address).toBe(address);
  });

  // The same id under two prices has to hash differently, which is what makes a price change a
  // listing the pipeline has not seen.
  it('hash an advert on its price as well as its id', () => {
    const advert = { id: 1, title: 'Trilocale in vendita', price: '€ 375.000' };
    const cheaper = { ...advert, price: '€ 350.000' };

    expect(normalize(advert).id).not.toBe(normalize(cheaper).id);
  });
});

describe('reading a bound property off a page', () => {
  /**
   * The component's element name carries a version the platform bumps on its own schedule, so the
   * lookup goes by the property. `tagPrefix` is what keeps that from matching the sticky bottom bar,
   * which an advert page hands the same record to.
   */
  it('picks the component the record belongs to rather than the first one handed it', () => {
    const html = `<html><body>
      <estate-sticky-bar :estate="${'{&quot;numeric_price&quot;:1}'}"></estate-sticky-bar>
      <estate-show-v1 :estate="${'{&quot;numeric_price&quot;:375000}'}"></estate-show-v1>
    </body></html>`;

    expect(readComponentData(html, ':estate', 'estate-show')?.numeric_price).toBe(375000);
  });

  it('answers a page that carries no such component with null', () => {
    expect(readComponentData('<html><body></body></html>', ':estates')).toBeNull();
    expect(readComponentData(null, ':estates')).toBeNull();
  });

  it('answers unparseable json with null rather than throwing', () => {
    expect(readComponentData('<estates-index :estates="{not json"></estates-index>', ':estates')).toBeNull();
  });
});

describe('enriching an advert off its own page', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * A detail page as the platform serves one: the whole record bound onto the show component.
   *
   * @param {any} estate the record the page carries
   * @returns {string} the html
   */
  function detailPage(estate) {
    const escape = (value) => JSON.stringify(value).replaceAll('"', '&quot;');
    return `<html><body><estate-show-v1 :estate="${escape(estate)}"></estate-show-v1></body></html>`;
  }

  const ADVERT_PAGE = 'https://www.tecnocasa.it/vendita/appartamenti/brescia/erbusco/1.html';
  const listing = () => ({ id: 'a', link: ADVERT_PAGE, title: 'Trilocale in vendita' });

  it('reads the date the advert was published or last edited on', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        detailPage({ last_published_at: '2026-04-14 10:50:40', description: '<p>Cucina abitabile.</p>' }),
    }));

    expect((await tecnocasa.fetchDetails(listing())).publishedAt).toBe(Date.UTC(2026, 3, 14, 10, 50, 40));
  });

  // A date the page does not stamp is not a date to invent: the listing keeps the order it had.
  it('leaves a listing the page names no date on without one', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => detailPage({ description: '<p>Cucina abitabile.</p>' }),
    }));

    expect((await tecnocasa.fetchDetails(listing())).publishedAt).toBeUndefined();
  });
});
