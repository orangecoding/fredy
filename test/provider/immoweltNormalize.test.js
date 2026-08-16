/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it, vi } from 'vitest';

/** What the stubbed transport hands back, swapped per test case. */
const transport = vi.hoisted(() => ({ html: null }));

// The provider reaches immowelt through the BFF transport, which only works inside a browser page.
// Stubbing it keeps these cases about the parsing and mapping, which is all that is under test.
vi.mock('../../lib/services/immowelt/immoweltBff.js', () => ({
  IMMOWELT_ORIGIN: 'https://www.immowelt.de',
  searchClassifieds: async () => [],
  fetchExposeHtml: async () => transport.html,
  releaseSession: async () => {},
}));

const provider = await import('../../lib/provider/immowelt.js');

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'testFixtures');

/** @returns {any[]} the recorded `/classifiedList` payload */
function readClassifieds() {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, 'immowelt_classifieds.json'), 'utf8'));
}

describe('#immowelt normalize', () => {
  const classifieds = readClassifieds();
  const [mitte, spandau] = classifieds.map((entry) => provider.config.normalize(entry));

  it('produces every field the provider declares as required', () => {
    for (const listing of [mitte, spandau]) {
      for (const field of provider.config.requiredFieldNames) {
        expect(listing, `missing ${field}`).toHaveProperty(field);
      }
    }
  });

  it('uses the advertiser headline as the title, not the generic category', () => {
    expect(mitte.title).toBe('Moderne 2-Zimmer-Wohnung mit Balkon im Herzen von Berlin Mitte');
    expect(mitte.title).not.toBe('Wohnung zur Miete');
  });

  // `rawData.price` on this listing is 1454.6 - immowelt's *estimated warm rent* - while the card
  // and the exposé title both show 1.250 € Kaltmiete. Reading rawData would invent a 16% price
  // rise on the first probe for every listing that carries such an estimate.
  it('reads the headline Kaltmiete, not the estimated warm rent sitting in rawData', () => {
    expect(mitte.price).toBe(1250);
    expect(classifieds[0].rawData.price).toBe(1454.6);
  });

  it('reads rooms and size off the key facts', () => {
    expect(mitte.rooms).toBe(2);
    expect(mitte.size).toBe(93);
    expect(spandau.rooms).toBe(4);
    expect(spandau.size).toBe(85);
  });

  it('links to the exposé', () => {
    expect(mitte.link).toBe('https://www.immowelt.de/expose/ba8557a2-c888-46e4-954e-581a68116662');
  });

  it('takes the first gallery image', () => {
    expect(mitte.image).toContain('mms.immowelt.de');
  });

  // "10178 Mitte" alone geocodes to whichever Mitte the geocoder likes best; the city has to come
  // along or the map pin lands in another federal state.
  it('appends the city when immowelt only names the borough', () => {
    expect(mitte.address).toBe('10178 Mitte, Berlin');
    expect(spandau.address).toBe('13599 Spandau, Berlin');
  });

  it('builds a street address when the advertiser published one', () => {
    const withStreet = structuredClone(classifieds[0]);
    withStreet.location.address.street = 'Aldebaranstraße';
    withStreet.location.address.houseNumber = '13';
    withStreet.location.isAddressPublished = true;

    expect(provider.config.normalize(withStreet).address).toBe('Aldebaranstraße 13, 10178 Mitte, Berlin');
  });

  it('never yields an empty address, so the pipeline always has something to geocode', () => {
    const withoutAddress = structuredClone(classifieds[0]);
    withoutAddress.location = {};
    withoutAddress.tracking = {};

    expect(provider.config.normalize(withoutAddress).address).toBe('NO ADDRESS FOUND');
  });

  it('gives two listings with the same id but different prices different hashes', () => {
    const cheaper = structuredClone(classifieds[0]);
    cheaper.hardFacts.price.value = '1.100 €';

    expect(provider.config.normalize(cheaper).id).not.toBe(mitte.id);
  });

  it('survives a payload that carries none of the optional blocks', () => {
    const sparse = { id: 'ABC', url: 'https://www.immowelt.de/expose/abc' };
    const listing = provider.config.normalize(sparse);

    expect(listing.id).toBeTypeOf('string');
    expect(listing.price).toBeNull();
    expect(listing.size).toBeNull();
    expect(listing.rooms).toBeNull();
    expect(listing.title).toBe('');
  });
});

describe('#immowelt fetchDetails', () => {
  const detailHtml = fs.readFileSync(path.join(FIXTURES, 'immowelt_detail.html'), 'utf8');

  /**
   * @param {string|null} html what the stubbed transport returns for the exposé
   * @returns {Promise<any>} the enriched listing
   */
  async function enrich(html) {
    transport.html = html;
    const runConfig = provider.createConfig({ url: 'https://www.immowelt.de/classified-search' }, []);
    return runConfig.fetchDetails(
      { id: 'x', link: 'https://www.immowelt.de/expose/ba8557a2-c888-46e4-954e-581a68116662', description: 'short' },
      {},
    );
  }

  it('replaces the truncated card description with the full exposé text', async () => {
    const enriched = await enrich(detailHtml);

    expect(enriched.description).toContain('Ein besonderes Highlight ist der Balkon');
    expect(enriched.description).not.toBe('short');
  });

  it('appends the location paragraph, which the card payload has no equivalent of', async () => {
    const enriched = await enrich(detailHtml);
    expect(enriched.description).toContain('S Hackescher Markt');
  });

  it('keeps the listing untouched when the exposé cannot be read', async () => {
    expect((await enrich(null)).description).toBe('short');
  });

  it('keeps the listing untouched when the exposé no longer carries the description element', async () => {
    expect((await enrich('<html><body>nothing here</body></html>')).description).toBe('short');
  });
});
