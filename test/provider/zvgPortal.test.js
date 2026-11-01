/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { mockFredy, providerConfig } from '../utils.js';
import * as provider from '../../lib/provider/zvgPortal.js';

/**
 * The ZVG-Portal lists forced-sale auctions in a server-rendered table and is searched by a form
 * POST. Assertions are structural, so the file runs against the fixture (`yarn test:offline`) and
 * against the live portal (`yarn test`).
 */
const TEST_TIMEOUT = 120_000;

describe('#zvgPortal provider testsuite()', () => {
  /** @type {any[]} */
  let listings;

  beforeAll(async () => {
    const Fredy = await mockFredy();
    const runConfig = provider.createConfig(providerConfig.zvgPortal, []);
    const job = {
      id: 'zvgPortal',
      notificationAdapter: null,
      spatialFilter: null,
      specFilter: null,
    };
    const fredy = new Fredy(runConfig, job, provider.metaInformation.id, similarityCache, undefined);
    listings = await fredy.execute();
  }, TEST_TIMEOUT);

  it('finds auctions', () => {
    expect(listings).toBeInstanceOf(Array);
    expect(listings.length).toBeGreaterThan(0);
  });

  it('carries address, a detail link and the court value as price', () => {
    for (const listing of listings) {
      expect(listing.address, `address of ${listing.id}`).toBeTruthy();
      expect(listing.link).toContain('zvg_id=');
      expect(listing.title).toContain('Zwangsversteigerung');
      if (listing.price != null) expect(listing.price).toBeGreaterThan(1000);
    }
  });
});

describe('#zvgPortal parseResults()', () => {
  const html = `<table><tr><td>Aktenzeichen</td><td><a href=index.php?button=showZvg&zvg_id=7&land_abk=sh><nobr>0063 K 0001/2026&nbsp;(Detailansicht)</nobr></a></td></tr>
    <tr><td>Objekt/Lage</td><td><strong>Einfamilienhaus<!--Lage-->:</strong> Musterweg 1, 22880 Wedel</td></tr>
    <tr><td>Verkehrswert in &#128;</td><td><strong>475.000,00</strong></td></tr>
    <tr><td>Termin</td><td>Freitag, 27. November 2026, 10:00 Uhr</td></tr></table>`;

  it('reads one auction from its label/value rows', () => {
    const [row] = provider.parseResults(html);
    expect(row).toMatchObject({
      zvgId: '7',
      landAbk: 'sh',
      fileNumber: '0063 K 0001/2026',
      kind: 'Einfamilienhaus',
      address: 'Musterweg 1, 22880 Wedel',
    });
    const listing = provider.config.normalize(row);
    expect(listing.price).toBe(475000);
    expect(listing.title).toBe('Zwangsversteigerung Einfamilienhaus, Freitag, 27. November 2026, 10:00 Uhr');
  });

  it('takes the first amount of an auction of several objects, and skips cancelled dates', () => {
    const multi = html.replace('475.000,00', 'Objekt 1: 129.000,00 € Objekt 2: 31.000,00 €');
    expect(provider.config.normalize(provider.parseResults(multi)[0]).price).toBe(129000);
    const cancelled = html.replace(
      'Freitag, 27. November 2026, 10:00 Uhr',
      'Der Termin Freitag, 27. November 2026 wurde aufgehoben.',
    );
    expect(provider.parseResults(cancelled)).toEqual([]);
  });
});

describe('#zvgPortal search request', () => {
  const row = (
    id,
    address,
  ) => `<tr><td>Aktenzeichen</td><td><a href=index.php?button=showZvg&zvg_id=${id}&land_abk=nw><nobr>K ${id}&nbsp;(Detailansicht)</nobr></a></td></tr>
    <tr><td>Objekt/Lage</td><td><strong>Einfamilienhaus:</strong> ${address}</td></tr>
    <tr><td>Termin</td><td>Freitag, 27. November 2026, 10:00 Uhr</td></tr>`;

  afterEach(() => vi.restoreAllMocks());

  it('sends the object types as obj_arr[], the field the portal filters on', () => {
    const { body } = provider.parseSearchUrl(
      'https://www.zvg-portal.de/index.php?button=Suchen&land_abk=nw&obj_arr=3,15,16',
    );
    expect(body.getAll('obj_arr[]')).toEqual(['3', '15', '16']);
    expect(body.has('obj_liste')).toBe(false);
    expect(body.get('land_abk')).toBe('nw');
  });

  it('keeps only addresses whose postcode starts with a plz_prefix, ignoring house numbers', async () => {
    const html = `<table>${row(1, 'Seydlitzstr. 48 a, 58840 Plettenberg')}${row(2, 'Wintersheide 4 - 14, 33689 Bielefeld')}${row(3, 'Hauptstr. 1, 44137 Dortmund')}</table>`;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(html));
    const found = await provider.config.getListings(
      'https://www.zvg-portal.de/index.php?button=Suchen&land_abk=nw&plz_prefix=4',
    );
    expect(found.map((r) => r.zvgId)).toEqual(['3']);
  });

  it('survives a plz_prefix that is no valid regular expression', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(`<table>${row(1, 'Hauptstr. 1, 22880 Wedel')}</table>`),
    );
    const found = await provider.config.getListings(
      'https://www.zvg-portal.de/index.php?button=Suchen&land_abk=sh&plz_prefix=2(',
    );
    expect(found).toEqual([]);
  });
});

describe('#zvgPortal fetchDetails()', () => {
  afterEach(() => vi.restoreAllMocks());
  const detail = (place) =>
    `<html><body>Beschreibung: Einfamilienhaus, Wohnfläche ca. 120 qm Verkehrswert: 300.000 EUR Ort der Versteigerung: ${place}</body></html>`;
  const stored = {
    link: 'https://www.zvg-portal.de/index.php?button=Termine%20suchen&land_abk=nw&zvg_id=7',
    description: 'Einfamilienhaus',
    size: null,
  };

  it('gives the same description when run again on its own result', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response(detail('Saal 1 Informationen zum Termin')),
    );
    const once = await provider.config.fetchDetails(stored);
    const twice = await provider.config.fetchDetails(once);
    expect(once.size).toBe(120);
    expect(twice.description).toBe(once.description);
  });

  it('reads the place of the auction when the page has no court link and continues with GeoServer', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(detail('Saal 2 GeoServer: Karte')));
    const listing = await provider.config.fetchDetails(stored);
    expect(listing.description).toContain('Ort der Versteigerung: Saal 2');
  });
});
