/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeAll } from 'vitest';
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
      expect(listing.link).toContain('button=showZvg&zvg_id=');
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
});
