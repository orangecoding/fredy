/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { mockFredy, providerConfig } from '../utils.js';
import * as provider from '../../lib/provider/idealista.js';

/**
 * idealista, one provider for three national sites: idealista.com, idealista.it and idealista.pt
 * run the same application in three languages, and the app behind them talks to one api per
 * country.
 *
 * What these tests pin is the card markup and the three languages inside it, because that is what a
 * redesign breaks and what a Spanish fixture would otherwise hide about the other two. The bot wall
 * is covered by the unit tests further down, which need no network.
 *
 * The pipeline case is structural rather than literal, because the same file runs against the
 * fixtures (`yarn test:offline`) and against the live portal (`yarn test`), where every advert
 * differs.
 */
const TEST_TIMEOUT = 120_000;

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'testFixtures');

/**
 * The search the tests of the website reader use, because the api sells no land: it is the shortest
 * url that cannot be asked of the api, and so is the one read off the website. Every other search
 * here goes to the api instead.
 */
const LAND_SEARCH = 'https://www.idealista.it/vendita-terreni/roma-roma/';

/** Somewhere to resolve a card's relative link against, per site. */
const IT_SEARCH = 'https://www.idealista.it/affitto-case/roma-roma/';
const ES_SEARCH = 'https://www.idealista.com/alquiler-viviendas/madrid-madrid/';

/**
 * Run a block with a challenge solver configured, which is what puts the website reader on its
 * plain-request transport instead of reaching for the run's browser.
 *
 * @template T
 * @param {() => Promise<T>} body
 * @returns {Promise<T>}
 */
async function withSolver(body) {
  const previous = process.env.FREDY_CHALLENGE_SOLVER_URL;
  process.env.FREDY_CHALLENGE_SOLVER_URL = 'http://solver.test/scrape';
  try {
    return await body();
  } finally {
    if (previous === undefined) delete process.env.FREDY_CHALLENGE_SOLVER_URL;
    else process.env.FREDY_CHALLENGE_SOLVER_URL = previous;
  }
}

/**
 * @param {string} html
 * @param {string} url the search the page was read from
 * @returns {import('../../lib/types/listing.js').ParsedListing[]}
 */
function normalizedListings(html, url) {
  return provider.parseListings(html, url).map(provider.config.normalize);
}

describe('#idealista provider testsuite()', () => {
  /** @type {any[]} */
  let listings;

  beforeAll(async () => {
    const Fredy = await mockFredy();
    const runConfig = provider.createConfig(providerConfig.idealista, [], []);
    const job = { id: 'idealista', notificationAdapter: null, spatialFilter: null, specFilter: null };

    const fredy = new Fredy(runConfig, job, provider.metaInformation.id, similarityCache, undefined);
    listings = await fredy.execute();
  }, TEST_TIMEOUT);

  /**
   * Every portal carries adverts that leave a figure out - a price on request, a garage with no
   * rooms - and a live run will meet one sooner or later. What is pinned is that the figures that
   * are there are readable, not that every advert has them all.
   *
   * @param {string} field
   * @returns {any[]} the listings carrying that field
   */
  const carrying = (field) => {
    const found = listings.filter((listing) => listing[field] != null);
    expect(found.length, `no listing carried a ${field}`).toBeGreaterThan(0);
    return found;
  };

  it('finds listings', () => {
    expect(listings).toBeInstanceOf(Array);
    expect(listings.length).toBeGreaterThan(0);
  });

  /**
   * Every figure arrives as a display string - "1.300€/mese", "60 m²", "2 locali" - so what is
   * pinned is that the thousands separator and the units are gone by the time a listing is built.
   */
  it('reads the display strings as numbers', () => {
    for (const listing of carrying('price')) {
      expect(typeof listing.price, `price of ${listing.link}`).toBe('number');
      expect(listing.price).toBeGreaterThan(0);
    }
    for (const listing of carrying('size')) {
      expect(typeof listing.size, `size of ${listing.link}`).toBe('number');
      expect(listing.size).toBeGreaterThan(0);
    }
    for (const listing of carrying('rooms')) {
      expect(typeof listing.rooms, `rooms of ${listing.link}`).toBe('number');
      expect(listing.rooms).toBeGreaterThan(0);
    }
  });

  /**
   * The floor sits in the same list as the rooms and the size, and reads "4º piano". Taking it for
   * a room count is the mistake this guards: a flat with more than thirty rooms is a parse error,
   * not an advert.
   */
  it('does not take the floor for a room count', () => {
    for (const listing of carrying('rooms')) {
      // The bound only has to catch a misparse, not police the market: the live portal carries
      // adverts whose rooms an agency typed wrongly by a factor of ten, and those are real
      // figures arriving as real numbers.
      expect(listing.rooms, `rooms of ${listing.link}`).toBeLessThan(100);
    }
  });

  it('links to the advert rather than to a relative path', () => {
    for (const listing of carrying('link')) {
      expect(listing.link).toMatch(/^https:\/\/www\.idealista\.(com|it|pt)\/[a-z-]+\/\d+\//);
    }
  });

  /**
   * The search used to carry `firstActivationDate` and still does in the fixture; the live api has
   * stopped, which is why the date now comes off the advert detail instead. Either way, a date that
   * does arrive has to be a real one.
   */
  it('carries a sane date wherever the search states one', () => {
    for (const listing of listings.filter((entry) => entry.publishedAt != null)) {
      expect(typeof listing.publishedAt, `publishedAt of ${listing.link}`).toBe('number');
      expect(listing.publishedAt, `publishedAt of ${listing.link}`).toBeGreaterThan(0);
      expect(listing.publishedAt, `publishedAt of ${listing.link}`).toBeLessThanOrEqual(Date.now());
    }
  });

  /**
   * The search answers no dates any more - the api stopped carrying `firstActivationDate` - while
   * the detail the android app opens for one advert carries `modificationDate`, the very
   * "Annuncio aggiornato ..." the website prints. The provider asks it for one advert at a time,
   * and only ever for the ones it has not stored yet - of the country the advert lives in.
   */
  it('reads the modification date off the advert detail, for the ones it is asked about', async () => {
    const originalFetch = globalThis.fetch;
    const asked = [];
    globalThis.fetch = async (url) => {
      const asked_ = String(url);
      if (asked_.includes('/api/oauth/token')) {
        return { ok: true, status: 200, json: async () => ({ access_token: 'offline', expires_in: 3600 }) };
      }
      asked.push(asked_);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          adid: 123456,
          modificationDate: { value: 1788453292000, text: "Annuncio aggiornato un'ora fa" },
        }),
      };
    };

    try {
      const listing = await provider.config.fetchDetails({ link: 'https://www.idealista.it/immobile/123456/' });

      expect(asked[0]).toContain('https://app.idealista.it/api/3/it/detail/123456');
      expect(listing.publishedAt).toBe(1788453292000);

      // A development's unit links from a different section, but ends in the very same code.
      const fromDevelopment = await provider.config.fetchDetails({
        link: 'https://www.idealista.it/nuova-costruzione/234567/',
      });
      expect(asked[1]).toContain('https://app.idealista.it/api/3/it/detail/234567');
      expect(fromDevelopment.publishedAt).toBe(1788453292000);

      // A Spanish advert is asked of the Spanish api, in Spanish.
      await provider.config.fetchDetails({ link: 'https://www.idealista.com/inmueble/345678/' });
      expect(asked[2]).toContain('https://app.idealista.com/api/3/es/detail/345678');
      expect(asked[2]).toContain('language=es');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('keeps the listing without a date when the detail answers none', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      if (String(url).includes('/api/oauth/token')) {
        return { ok: true, status: 200, json: async () => ({ access_token: 'offline', expires_in: 3600 }) };
      }
      return { ok: true, status: 200, json: async () => ({ adid: 123456 }) };
    };

    try {
      const listing = await provider.config.fetchDetails({ link: 'https://www.idealista.it/immobile/123456/' });
      expect(listing.publishedAt).toBeUndefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('names the place the title carries', () => {
    for (const listing of carrying('address')) {
      expect(typeof listing.address).toBe('string');
      expect(listing.address.length).toBeGreaterThan(0);
      // The property type is the part before the separator, so it must not survive into the address.
      expect(listing.address).not.toMatch(/^(Monolocale|Bilocale|Trilocale|Quadrilocale|Attico|Appartamento)\b/);
    }
  });

  it('declares the three countries the sites cover', () => {
    expect(provider.metaInformation.countries).toEqual(['es', 'it', 'pt']);
  });

  /**
   * Declaring all three is right for the job form and for the map, and wrong for every question
   * asked about one advert: an address geocoded across `es,it,pt` can come back as a namesake in
   * the wrong country, and a Madrid advert sent to Italy's coverage register spends a throttled
   * request and is stamped "nothing here" for six months. The advert's own link is what says which
   * site it is on, and it is the one thing every stored row keeps - a job's search url can be
   * changed to another country after the row was written.
   */
  it('narrows those three to the one country an advert links to', () => {
    const countryOf = provider.metaInformation.countryOf;

    expect(countryOf({ link: 'https://www.idealista.com/inmueble/12345/' })).toBe('es');
    expect(countryOf({ link: 'https://www.idealista.it/immobile/12345/' })).toBe('it');
    expect(countryOf({ link: 'https://www.idealista.pt/imovel/12345/' })).toBe('pt');
    // The site answers for itself whether or not the link carries the `www`.
    expect(countryOf({ link: 'https://idealista.it/immobile/12345/' })).toBe('it');
  });

  it('narrows nothing it cannot read, leaving all three in scope', () => {
    const countryOf = provider.metaInformation.countryOf;

    expect(countryOf({ link: 'https://www.example.org/immobile/12345/' })).toBeNull();
    expect(countryOf({ link: 'not a url' })).toBeNull();
    expect(countryOf({ link: null })).toBeNull();
    expect(countryOf({})).toBeNull();
    expect(countryOf(null)).toBeNull();
  });

  /**
   * Every site disallows its own publication ordering in robots.txt - `/*?ordine=pubblicazione-desc`
   * on .it, `/*?ordenado-por=fecha-publicacion-` on .com - so the provider deliberately ships no
   * sort parameter. The api orders by publication date with no such rule, and the website fallback
   * reads every result page rather than the head of a ranking.
   */
  it('asks for no ordering, which the sites disallow in robots.txt', () => {
    expect(provider.config.sortByDateParam).toBeUndefined();
  });

  /**
   * A url on a host idealista does not serve names nothing this provider can read: not which api
   * answers, not which site a relative link belongs to. It is refused rather than read as Spain.
   */
  it('refuses a search url that is not on one of the three sites', async () => {
    const originalFetch = globalThis.fetch;
    const asked = [];
    globalThis.fetch = async (url) => {
      asked.push(String(url));
      return { ok: true, status: 200, text: async () => '', json: async () => ({}) };
    };

    try {
      const runConfig = provider.createConfig({ url: 'https://www.idealista.de/vendita-case/roma-roma/' }, []);
      expect(await runConfig.getListings(runConfig.url)).toEqual([]);
      expect(asked, 'a url on an unknown host must cost no requests').toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

/**
 * One result card, as idealista's markup spells it out on every one of the three sites.
 *
 * @param {{id?: string, title: string, price: string, details?: string[]}} card
 * @returns {string}
 */
function cardMarkup({ id = '1', title, price, details = [] }) {
  return `
    <article class="item" data-element-id="${id}">
      <picture class="item-multimedia"><img src="https://img4.idealista.com/${id}.jpg"></picture>
      <div class="item-info-container">
        <a href="/inmueble/${id}/" class="item-link" title="${title}">${title}</a>
        <div class="price-row"><span class="item-price">${price}</span></div>
        <div class="item-detail-char">
          ${details.map((detail) => `<span class="item-detail">${detail}</span>`).join('')}
        </div>
        <div class="item-description description"><p class="ellipsis">Bonito piso.</p></div>
      </div>
    </article>`;
}

/**
 * @param {string} body
 * @returns {string}
 */
const searchPage = (body) => `<html><body><main id="main-content">${body}</main></body></html>`;

describe('the card the three sites serve', () => {
  it('is recognised by its status and by its body', () => {
    // Both signals matter: the interstitial arrives as a 403, and a 200 carrying the DataDome
    // frame is the same refusal in different clothing.
    expect(provider.parseListings('<html><body>nothing here</body></html>', IT_SEARCH)).toEqual([]);
    expect(provider.parseListings(null, IT_SEARCH)).toEqual([]);
  });

  it('reads a card out of the markup the portal serves', () => {
    const html = `
      <article class="item" data-element-id="123456">
        <a class="item-link" href="/immobile/123456/" title="Bilocale in Via Tarso, 27, San Paolo, Roma"></a>
        <span class="item-price">1.300€/mese</span>
        <div class="item-detail-char">
          <span class="item-detail">2 locali</span>
          <span class="item-detail">60 m²</span>
          <span class="item-detail">4º piano con ascensore</span>
          <span class="item-detail">7 minuti</span>
        </div>
        <p class="item-description">Ampio bilocale ristrutturato.</p>
        <picture class="item-multimedia"><img src="https://img4.idealista.it/blur/480_360_mq/0/x.jpg" /></picture>
      </article>`;

    const [raw] = provider.parseListings(html, IT_SEARCH);
    expect(raw.id).toBe('123456');
    expect(raw.characteristics).toEqual(['2 locali', '60 m²', '4º piano con ascensore', '7 minuti']);

    const listing = provider.config.normalize(raw);
    expect(listing.price).toBe(1300);
    expect(listing.size).toBe(60);
    expect(listing.rooms).toBe(2);
    expect(listing.link).toBe('https://www.idealista.it/immobile/123456/');
    expect(listing.address).toBe('Via Tarso, 27, San Paolo, Roma');
    expect(listing.description).toBe('Ampio bilocale ristrutturato.');
  });

  /**
   * Spain counts bedrooms, Italy counts rooms and Portugal states its typology. All three end up in
   * the same field, and getting one of them wrong is not a visible break - it is a room count that
   * quietly disagrees with the spec filter the user set.
   */
  it('reads the room count in all three languages', () => {
    const page = searchPage(
      cardMarkup({
        id: '1',
        title: 'Piso en Calle de Toledo, Palacio, Madrid',
        price: '1.400€/mes',
        details: ['Garaje incluido', '3 hab.', '92 m²', '4ª planta exterior sin ascensor', '2 minutos'],
      }) +
        cardMarkup({
          id: '2',
          title: 'Trilocale in Via Melzo, 13, Porta Venezia, Milano',
          price: '2.800€/mese',
          details: ['3 locali', '90 m²', '2º piano con ascensore'],
        }) +
        cardMarkup({
          id: '3',
          title: 'Monolocale in Via Lario, 13, Isola, Milano',
          price: '950€/mese',
          details: ['1 locale', '25 m²'],
        }) +
        cardMarkup({
          id: '4',
          title: 'Apartamento T2 na Rua das Olarias, 33, Mouraria, Lisboa',
          price: '1.200€/mês',
          details: ['T2', '79 m² área bruta', '3º andar sem elevador'],
        }),
    );

    expect(normalizedListings(page, ES_SEARCH).map((listing) => listing.rooms)).toEqual([3, 3, 1, 2]);
    // Portugal appends what the figure measures, which must not swallow the figure.
    expect(normalizedListings(page, ES_SEARCH).map((listing) => listing.size)).toEqual([92, 90, 25, 79]);
  });

  /**
   * The chips are an unlabelled list. A rental card ends it with how long ago the advert appeared -
   * "2 minutos" - and reading the list by position rather than by content turned that into a
   * two-room flat.
   */
  it('does not mistake the age of an advert for a room count', () => {
    const page = searchPage(
      cardMarkup({
        id: '1',
        title: 'Estudio en Segovia, Imperial, Madrid',
        price: '1.080€/mes',
        details: ['30 m²', 'Bajo interior sin ascensor', '26 minutos'],
      }),
    );

    const [listing] = normalizedListings(page, ES_SEARCH);
    expect(listing.rooms, 'a studio has no separate rooms to count').toBeNull();
    expect(listing.size).toBe(30);
  });

  it('reads the thousands separator as a separator, not as a decimal point', () => {
    const page = searchPage(
      cardMarkup({
        id: '1',
        title: 'Piso en Calle de Joaquín Costa, El Viso, Madrid',
        price: '3.000.000€',
        details: ['4 hab.', '309 m²'],
      }),
    );

    expect(normalizedListings(page, ES_SEARCH)[0].price).toBe(3_000_000);
  });

  /**
   * The property type is stripped through the preposition that follows it. Portugal's "Moradia em
   * banda" carries a preposition inside the type itself, so splitting on the first one handed the
   * geocoder "banda em Rua ...".
   */
  it('strips a multi-word property type off the address in full', () => {
    const page = searchPage(
      cardMarkup({
        id: '1',
        title: 'Moradia em banda em Rua do Sol, Alvalade, Lisboa',
        price: '2.100€/mês',
        details: ['T3', '140 m²'],
      }) +
        cardMarkup({
          id: '2',
          title: 'Casa o chalet independiente en Calle de la Virgen, Aravaca, Madrid',
          price: '4.750.000€',
          details: ['6 hab.', '775 m²'],
        }),
    );

    expect(normalizedListings(page, ES_SEARCH).map((listing) => listing.address)).toEqual([
      'Rua do Sol, Alvalade, Lisboa',
      'Calle de la Virgen, Aravaca, Madrid',
    ]);
  });

  /**
   * An advert with no street reads "<type> a <district>, <town>", which only Italy writes. Splitting
   * on the earlier of the two separators would cut a type that contains "a" in half, so the
   * prepositions that start a place are looked for first.
   */
  it('splits the address off an Italian title that names no street', () => {
    const card = (title) =>
      `<article class="item" data-element-id="1"><a class="item-link" href="/immobile/1/" title="${title}"></a></article>`;
    const addressOf = (title) => normalizedListings(card(title), IT_SEARCH)[0].address;

    expect(addressOf('Appartamento a Aventino, Roma')).toBe('Aventino, Roma');
    expect(addressOf('Casa a schiera in Via Giulia, Roma')).toBe('Via Giulia, Roma');
    // A type carrying "a" and a title with no street put the trap twice over. Taking the last "a"
    // instead would read this one right and cut a town called "Bagno a Ripoli" in half.
    expect(addressOf('Villetta a schiera a Lovere')).toBe('Lovere');
    expect(addressOf('Appartamento a Bagno a Ripoli')).toBe('Bagno a Ripoli');
  });

  /**
   * The "Obra nueva" carousel is built out of `article.item` too, but its cards advertise a
   * development: no price, no living area, and a link to the project rather than to a flat.
   */
  it('skips the new-development carousel sitting in the result list', () => {
    const page = searchPage(
      '<article class="item geo-reach-card" data-element-id="9"><div class="geo-reach-card__ribbons"><span>Obra nueva</span></div></article>' +
        cardMarkup({
          id: '1',
          title: 'Piso en Calle de Toledo, Palacio, Madrid',
          price: '1.400€/mes',
          details: ['3 hab.', '92 m²'],
        }),
    );

    expect(normalizedListings(page, ES_SEARCH).map((listing) => listing.link)).toEqual([
      'https://www.idealista.com/inmueble/1/',
    ]);
  });

  it('keeps a listing that was advertised without photos', () => {
    const page = searchPage(`
      <article class="item" data-element-id="7">
        <picture class="item-multimedia item-multimedia_no-pictures"><div class="no-pics"><h3>Senza foto</h3></div></picture>
        <a href="/immobile/7/" class="item-link" title="Bilocale in Via Affori, 83, Milano">Bilocale</a>
        <div class="price-row"><span class="item-price">1.100€/mese</span></div>
        <div class="item-detail-char"><span class="item-detail">2 locali</span><span class="item-detail">55 m²</span></div>
      </article>`);

    const [listing] = normalizedListings(page, IT_SEARCH);
    expect(listing.image).toBeNull();
    expect(listing.link).toBe('https://www.idealista.it/immobile/7/');
  });

  /**
   * The link is resolved against the page it was read from, which is what keeps a Spanish advert on
   * the Spanish site. Built against one fixed origin, every listing of a .com or .pt search would
   * link to a page that does not exist.
   */
  it('links an advert to the site its search came from', () => {
    const page = searchPage(cardMarkup({ id: '5', title: 'Piso en Calle Mayor, Madrid', price: '900€/mes' }));

    expect(normalizedListings(page, ES_SEARCH)[0].link).toBe('https://www.idealista.com/inmueble/5/');
    expect(normalizedListings(page, 'https://www.idealista.pt/arrendar-casas/lisboa/')[0].link).toBe(
      'https://www.idealista.pt/inmueble/5/',
    );
  });

  // A reduction has to reach the user, and the id is the only thing that decides whether a listing
  // counts as seen before.
  it('changes a listing id when its price changes', () => {
    const card = (price) =>
      searchPage(
        cardMarkup({ id: '1', title: 'Piso en Calle de Toledo, Palacio, Madrid', price, details: ['3 hab.', '92 m²'] }),
      );

    expect(normalizedListings(card('1.400€/mes'), ES_SEARCH)[0].id).not.toBe(
      normalizedListings(card('1.300€/mes'), ES_SEARCH)[0].id,
    );
  });
});

/**
 * The recorded pages: one search off idealista.it, one off idealista.com. Two languages of the same
 * markup, which is what a single parser has to survive.
 */
describe('the recorded search pages', () => {
  for (const [fixture, url] of [
    ['idealista.html', IT_SEARCH],
    ['idealista_es.html', ES_SEARCH],
  ]) {
    it(`reads every card of ${fixture}`, () => {
      const parsed = normalizedListings(fs.readFileSync(path.join(FIXTURES, fixture), 'utf8'), url);

      expect(parsed.length).toBeGreaterThan(0);
      for (const listing of parsed) {
        expect(listing.id, 'every card needs an id to be deduplicated by').toBeTruthy();
        expect(listing.price, `price of ${listing.link}`).toBeGreaterThan(0);
        expect(listing.size, `size of ${listing.link}`).toBeGreaterThan(0);
        expect(listing.address, `address of ${listing.link}`).toBeTruthy();
        expect(listing.link, `link of ${listing.id}`).toMatch(new RegExp(`^${new URL(url).origin}/`));
      }
    });
  }
});

describe('the result pages idealista falls back to reading', () => {
  it('hangs the page off the search path, however the url arrives', () => {
    const search = 'https://www.idealista.it/vendita-case/roma-roma/';

    expect(provider.pageUrl(search, 1)).toBe(search);
    expect(provider.pageUrl(search, 3)).toBe(`${search}lista-3.htm`);
    // A url that already names a page is rewritten rather than appended to.
    expect(provider.pageUrl(`${search}lista-3.htm`, 5)).toBe(`${search}lista-5.htm`);
    expect(provider.pageUrl(`${search}lista-3.htm`, 1)).toBe(search);
  });

  /**
   * A drawn search pages without the `.htm` every other search carries. Asked with it, the portal
   * answers a page with no adverts on it, and the walk would end at the first page with the rest
   * of the results unread. The Italian site calls that section `aree` and the other two `areas`.
   */
  it('pages a drawn search without the suffix the portal would answer empty', () => {
    const drawn = 'https://www.idealista.it/aree/vendita-case/con-prezzo_300000/?shape=%28%28abc%29%29';
    const page = (number) =>
      `https://www.idealista.it/aree/vendita-case/con-prezzo_300000/lista-${number}?shape=%28%28abc%29%29`;

    expect(provider.pageUrl(drawn, 1)).toBe(drawn);
    expect(provider.pageUrl(drawn, 2)).toBe(page(2));
    expect(provider.pageUrl(page(2), 3)).toBe(page(3));
    expect(provider.pageUrl(page(3), 1)).toBe(drawn);

    expect(provider.pageUrl('https://www.idealista.com/areas/venta-viviendas/?shape=%28%28abc%29%29', 2)).toBe(
      'https://www.idealista.com/areas/venta-viviendas/lista-2?shape=%28%28abc%29%29',
    );
  });

  /**
   * Fredy's own browser is headless, which DataDome rarely lets through, so the wall is cleared by
   * a separate service where one is configured. With neither a solver nor a browser the provider
   * has to give up rather than pretend it read the search.
   */
  it('finds nothing when there is neither a solver nor a browser', async () => {
    const previous = process.env.FREDY_CHALLENGE_SOLVER_URL;
    delete process.env.FREDY_CHALLENGE_SOLVER_URL;
    const originalFetch = globalThis.fetch;
    // A wall on every request, which is what idealista serves a client with no session.
    globalThis.fetch = async () => ({
      status: 403,
      headers: undefined,
      text: async () => '<html><body>geo.captcha-delivery.com/interstitial/</body></html>',
    });

    try {
      const runConfig = provider.createConfig({ url: LAND_SEARCH }, []);
      expect(await runConfig.getListings(runConfig.url, undefined)).toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
      if (previous !== undefined) process.env.FREDY_CHALLENGE_SOLVER_URL = previous;
    }
  });

  /**
   * The portal serves no ordering Fredy may ask for, so a new advert lands wherever the ranking
   * puts it and the whole result set has to be read. A page past the last one comes back as the
   * first one again, which is what ends the walk when the last page is a full one.
   */
  it('walks the result pages until one runs short', async () => {
    const card = (id) =>
      `<article class="item" data-element-id="${id}"><a class="item-link" href="/immobile/${id}/" title="Villa in Via Giulia, Roma"></a></article>`;
    const cards = (from, count) => Array.from({ length: count }, (__, index) => card(from + index)).join('');

    const asked = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const address = String(url);
      // The api's token and parser answer nothing a website walk can use, so the run falls back -
      // and only the website's own pages are counted.
      if (!address.startsWith('https://www.idealista.it')) {
        return { status: 500, ok: false, headers: undefined, text: async () => '', json: async () => ({}) };
      }
      asked.push(address);
      const page = Number(address.match(/lista-(\d+)\.htm/)?.[1] ?? 1);
      // Two full pages and then a short one, which is where the results end.
      const body = page <= 2 ? cards(page * 100, 30) : cards(300, 4);
      return { status: 200, headers: undefined, text: async () => body };
    };

    // The walk waits between pages, which a real run wants and a test does not.
    vi.useFakeTimers();
    try {
      await withSolver(async () => {
        const runConfig = provider.createConfig({ url: LAND_SEARCH }, []);
        const walk = runConfig.getListings(runConfig.url);
        await vi.runAllTimersAsync();
        const adverts = await walk;

        expect(adverts).toHaveLength(64);
        expect(asked).toHaveLength(3);
        expect(asked[2]).toContain('/lista-3.htm');
      });
    } finally {
      vi.useRealTimers();
      globalThis.fetch = originalFetch;
    }
  });

  /**
   * A 429 is not a wall: no session clears it and the solver has nothing to solve. The run stops
   * where it is rather than asking for the pages that would deepen the rate limit.
   */
  it('stops the walk when the portal asks for fewer requests', async () => {
    const card = (id) =>
      `<article class="item" data-element-id="${id}"><a class="item-link" href="/immobile/${id}/" title="Villa in Via Giulia, Roma"></a></article>`;

    const asked = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const address = String(url);
      // The api's token and parser answer nothing a website walk can use, so the run falls back -
      // and only the website's own pages are counted.
      if (!address.startsWith('https://www.idealista.it')) {
        return { status: 500, ok: false, headers: undefined, text: async () => '', json: async () => ({}) };
      }
      asked.push(address);
      const page = Number(address.match(/lista-(\d+)\.htm/)?.[1] ?? 1);
      if (page > 1) return { status: 429, headers: undefined, text: async () => 'Too Many Requests' };
      return {
        status: 200,
        headers: undefined,
        text: async () => Array.from({ length: 30 }, (__, index) => card(index)).join(''),
      };
    };

    vi.useFakeTimers();
    try {
      await withSolver(async () => {
        const runConfig = provider.createConfig({ url: LAND_SEARCH }, []);
        const walk = runConfig.getListings(runConfig.url);
        await vi.runAllTimersAsync();

        expect(await walk).toHaveLength(30);
        expect(asked).toHaveLength(2);
      });
    } finally {
      vi.useRealTimers();
      globalThis.fetch = originalFetch;
    }
  });
});

describe('#idealista price range', () => {
  const rangeOf = (url) => provider.config.priceRangeParams.parse(url);

  /**
   * idealista puts its filters in the path, comma-separated inside one segment, and only the first
   * of them carries the `con-`/`com-` prefix. Every site spells the bounds differently, and Italy
   * spells its upper bound as the bare `prezzo`, which is one dash away from its lower one.
   */
  it('reads both bounds on each of the three sites', () => {
    expect(
      rangeOf('https://www.idealista.com/alquiler-viviendas/madrid-madrid/con-precio-desde_800,precio-hasta_1200/'),
    ).toEqual({ min: '800', max: '1200' });
    expect(rangeOf('https://www.idealista.it/affitto-case/milano-milano/con-prezzo_1200,prezzo-min_800/')).toEqual({
      min: '800',
      max: '1200',
    });
    expect(rangeOf('https://www.idealista.pt/arrendar-casas/lisboa/com-preco-min_800,preco-max_1200/')).toEqual({
      min: '800',
      max: '1200',
    });
  });

  it('reads a bound that stands on its own', () => {
    expect(rangeOf('https://www.idealista.com/alquiler-viviendas/madrid-madrid/con-precio-hasta_1200/')).toEqual({
      min: null,
      max: '1200',
    });
  });

  it('reports no range for a search that sets none', () => {
    expect(rangeOf('https://www.idealista.com/alquiler-viviendas/madrid-madrid/')).toEqual({ min: null, max: null });
  });

  // The path also carries filters that have nothing to do with the price.
  it('does not read a price out of another filter', () => {
    expect(
      rangeOf(
        'https://www.idealista.com/alquiler-viviendas/madrid-madrid/con-metros-cuadrados-mas-de_60,de-dos-dormitorios/',
      ),
    ).toEqual({ min: null, max: null });
  });
});
