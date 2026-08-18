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

  // The block immowelt heads with "Sonstiges" is where the terms people blacklist for - WBS,
  // Tauschwohnung, provision notes - are spelled out. Reading only the first two blocks stored a
  // description that looked complete and silently passed the blacklist.
  it('reads the third description block, which has no box of its own on the page', async () => {
    const html = `<html><body>
      <div data-testid="cdp-main-description-expandable-text">Helle 3-Zimmer-Wohnung</div>
      <div data-testid="cdp-location-description-expandable-text">Zentrale Lage</div>
      <div data-testid="cdp-additional-description-expandable-text">WBS erforderlich</div>
    </body></html>`;

    expect((await enrich(html)).description).toBe('Helle 3-Zimmer-Wohnung\n\nZentrale Lage\n\nWBS erforderlich');
  });
});

describe('#immowelt extractExposeDescription', () => {
  const serverStateHtml = fs.readFileSync(path.join(FIXTURES, 'immowelt_detail_serverstate.html'), 'utf8');

  it('reads every block out of the server state of a real exposé', () => {
    const description = provider.extractExposeDescription(serverStateHtml);

    expect(description).toContain('In Massivbauweise entstehen 2 nebeneinanderliegende Mehrfamilienhäuser');
    expect(description).toContain('Südlich der Christian-Rath-Straße');
    expect(description).toContain('Zukunftsorientiertes Wohnen mittels hoher Energieeffizienz');
    expect(description).toContain('Weitere Informationen');
  });

  // The state is not truncated at the "show more" cut the markup applies, so it is the longer read
  // of the two whenever a page carries both.
  it('prefers the server state over the rendered markup', () => {
    expect(provider.extractExposeDescription(serverStateHtml)).not.toContain('DOM FALLBACK MARKER');
  });

  it('falls back to the rendered markup when the page carries no server state', () => {
    const html = `<html><body>
      <div data-testid="cdp-main-description-expandable-text">Nur im Markup</div>
    </body></html>`;

    expect(provider.extractExposeDescription(html)).toBe('Nur im Markup');
  });

  it('turns the line breaks of the server state into real ones', () => {
    expect(provider.extractExposeDescription(serverState({ description: { texts: [{ text: 'A<br>B' }] } }))).toBe(
      'A\nB',
    );
  });

  it('reads the individual sections when the exposé carries no headlined texts', () => {
    const html = serverState({
      mainDescription: { description: 'Zum Objekt' },
      areaDescription: { description: 'Zur Lage' },
      extendedInfoDescription: { description: 'Sonstiges' },
    });

    expect(provider.extractExposeDescription(html)).toBe('Zum Objekt\n\nZur Lage\n\nSonstiges');
  });

  // A description ending on a bracketed aside used to end the state's string literal early and
  // lose the entire payload, because the literal was matched with a lazy regex.
  it('survives a description that contains the end of the JSON.parse call', () => {
    const html = serverState({ description: { texts: [{ text: 'Stellplatz (optional, 50 €");' }] } });

    expect(provider.extractExposeDescription(html)).toBe('Stellplatz (optional, 50 €");');
  });

  it('returns null for an exposé that could not be loaded at all', () => {
    expect(provider.extractExposeDescription(null)).toBeNull();
    expect(provider.extractExposeDescription('<html><body>nothing here</body></html>')).toBeNull();
  });

  /**
   * Build a page carrying `sections` the way immowelt's shell embeds it: a JSON document inside a
   * JavaScript string literal.
   *
   * @param {object} sections the `classified.sections` of the exposé
   * @returns {string} the page source
   */
  function serverState(sections) {
    const payload = JSON.stringify({ app_cldp: { data: { classified: { sections } } } });
    return `<html><head><script id="__UFRN_LIFECYCLE_SERVERREQUEST__">window["__UFRN_LIFECYCLE_SERVERREQUEST__"]=JSON.parse(${JSON.stringify(payload)});</script></head><body></body></html>`;
  }
});
