/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { mockFredy, providerConfig } from '../utils.js';
import * as provider from '../../lib/provider/idealista.js';
import { launchBrowser, closeBrowser } from '../../lib/services/extractor/puppeteerExtractor.js';

/**
 * idealista, the first provider Fredy ships for southern Europe, and the first that is three
 * national sites at once: idealista.com, idealista.it and idealista.pt run the same application in
 * three languages.
 *
 * The pipeline case below is structural, because this file runs against the fixture
 * (`yarn test:offline`) and against the live site (`yarn test`). What cannot be asserted that way -
 * that an Italian "3 locali" and a Portuguese "T2" are both read as three and two rooms, that a
 * multi-word property type is stripped off the address in full - is driven through the parser with
 * the markup those sites serve, so a Spanish fixture cannot hide a regression in the other two.
 */
const TEST_TIMEOUT = 180_000;

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'testFixtures');
const SEARCH_URL = providerConfig.idealista.url;

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

/**
 * @param {string} html
 * @param {string} [url]
 * @returns {import('../../lib/types/listing.js').ParsedListing[]}
 */
function normalizedListings(html, url = SEARCH_URL) {
  return provider.parseListings(html, url).map(provider.config.normalize);
}

describe('#idealista provider testsuite()', () => {
  /** @type {any} */
  let browser;
  /** @type {any[]} */
  let listings;

  beforeAll(async () => {
    browser = await launchBrowser(SEARCH_URL, {});

    const Fredy = await mockFredy();
    const runConfig = provider.createConfig(providerConfig.idealista, []);
    const job = { id: 'idealista', notificationAdapter: null, spatialFilter: null, specFilter: null };

    const fredy = new Fredy(runConfig, job, provider.metaInformation.id, similarityCache, browser);
    listings = await fredy.execute();
  }, TEST_TIMEOUT);

  afterAll(async () => {
    await closeBrowser(browser);
  });

  it('gets past DataDome and finds listings', () => {
    expect(listings).toBeInstanceOf(Array);
    expect(listings.length).toBeGreaterThan(0);
  });

  it('carries a price, a living area and an address on every listing', () => {
    for (const listing of listings) {
      expect(typeof listing.price, `price of ${listing.id}`).toBe('number');
      expect(listing.price, `price of ${listing.id}`).toBeGreaterThan(0);
      expect(typeof listing.size, `size of ${listing.id}`).toBe('number');
      expect(listing.size, `size of ${listing.id}`).toBeGreaterThan(0);
      expect(listing.address, `address of ${listing.id}`).toBeTruthy();
    }
  });

  it('links to the listing page on the site the search came from', () => {
    for (const listing of listings) {
      expect(listing.link, `link of ${listing.id}`).toMatch(/^https:\/\/www\.idealista\.(com|it|pt)\/\w+\/\d+\//);
    }
  });

  /**
   * "Piso en Calle de Toledo, Palacio, Madrid" is a title, not an address, and Nominatim answers
   * nothing for it. What has to survive the pipeline is the part after the property type.
   */
  it('geocodes an address rather than a headline', () => {
    for (const listing of listings) {
      expect(listing.address, `address of ${listing.id}`).not.toMatch(/^(Piso|Ático|Estudio|Casa|Chalet)\s+en\s/i);
    }
  });

  it('declares the three countries the sites cover', () => {
    expect(provider.metaInformation.countries).toEqual(['es', 'it', 'pt']);
  });
});

describe('#idealista search page parsing', () => {
  it('reads every card of the recorded search page', () => {
    const html = fs.readFileSync(path.join(FIXTURES, 'idealista.html'), 'utf8');
    const parsed = normalizedListings(html);

    expect(parsed.length).toBeGreaterThan(0);
    for (const listing of parsed) {
      expect(listing.id, 'every card needs an id to be deduplicated by').toBeTruthy();
      expect(listing.price, `price of ${listing.link}`).toBeGreaterThan(0);
      expect(listing.size, `size of ${listing.link}`).toBeGreaterThan(0);
    }
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

    expect(normalizedListings(page).map((listing) => listing.rooms)).toEqual([3, 3, 1, 2]);
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

    const [listing] = normalizedListings(page);
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

    expect(normalizedListings(page)[0].price).toBe(3_000_000);
  });

  /**
   * The property type is stripped through the preposition that follows it. Portugal's "Moradia em
   * banda" carries a preposition inside the type itself, so splitting on the first one handed the
   * geocoder "banda em Rua …".
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

    expect(normalizedListings(page).map((listing) => listing.address)).toEqual([
      'Rua do Sol, Alvalade, Lisboa',
      'Calle de la Virgen, Aravaca, Madrid',
    ]);
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

    expect(normalizedListings(page).map((listing) => listing.link)).toEqual(['https://www.idealista.com/inmueble/1/']);
  });

  it('keeps a listing that was advertised without photos', () => {
    const page = searchPage(`
      <article class="item" data-element-id="7">
        <picture class="item-multimedia item-multimedia_no-pictures"><div class="no-pics"><h3>Senza foto</h3></div></picture>
        <a href="/immobile/7/" class="item-link" title="Bilocale in Via Affori, 83, Milano">Bilocale</a>
        <div class="price-row"><span class="item-price">1.100€/mese</span></div>
        <div class="item-detail-char"><span class="item-detail">2 locali</span><span class="item-detail">55 m²</span></div>
      </article>`);

    const [listing] = normalizedListings(page, 'https://www.idealista.it/affitto-case/milano-milano/');
    expect(listing.image).toBeNull();
    expect(listing.link).toBe('https://www.idealista.it/immobile/7/');
  });

  // A reduction has to reach the user, and the id is the only thing that decides whether a listing
  // counts as seen before.
  it('changes a listing id when its price changes', () => {
    const card = (price) =>
      searchPage(
        cardMarkup({ id: '1', title: 'Piso en Calle de Toledo, Palacio, Madrid', price, details: ['3 hab.', '92 m²'] }),
      );

    expect(normalizedListings(card('1.400€/mes'))[0].id).not.toBe(normalizedListings(card('1.300€/mes'))[0].id);
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
