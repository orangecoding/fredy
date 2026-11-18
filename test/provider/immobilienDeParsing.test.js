/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/services/logger.js', () => ({
  default: { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import logger from '../../lib/services/logger.js';
import * as provider from '../../lib/provider/immobilienDe.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'testFixtures');

/** @param {string} name @returns {string} */
const fixture = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');

describe('#immobilien.de search url', () => {
  // The legacy search still answers with a 200 and still renders results, it just drops every
  // `search.*` parameter on the way. Silently returning half of Germany is the failure mode this
  // whole translation exists to prevent, so these cases are the ones that matter most.
  it('translates a legacy url onto the rewritten search', () => {
    const translated = new URL(
      provider.toSearchUrl(
        'https://www.immobilien.de/Wohnen/Suchergebnisse-51797.html?search._digest=true&search._filter=wohnen' +
          '&search.flaeche_von=50&search.objektart=wohnung&search.preis_bis=1200&search.typ=mieten' +
          '&search.umkreis=15&sort_col=*created_ts&sort_dir=desc',
      ),
    );

    expect(translated.pathname).toBe('/suche');
    expect(Object.fromEntries(translated.searchParams)).toEqual({
      kategorie: 'wohnen',
      typ: 'mieten',
      objektart: 'wohnung',
      preis_bis: '1200',
      flaeche_von: '50',
      umkreis: '15',
    });
  });

  it('drops the old sort parameters, which the rewritten search does not read', () => {
    const translated = provider.toSearchUrl(
      'https://www.immobilien.de/Wohnen/Suchergebnisse-51797.html?search.typ=mieten&sort_col=*created_ts&sort_dir=desc',
    );

    expect(translated).not.toContain('sort_col');
    expect(translated).not.toContain('sort_dir');
  });

  it('keeps a parameter that is already in the new spelling, such as the merged in sort', () => {
    expect(
      provider.toSearchUrl('https://www.immobilien.de/Wohnen/Suchergebnisse-1.html?search.typ=mieten&sort=newest'),
    ).toContain('sort=newest');
  });

  it('falls back to the residential category when the legacy url named none', () => {
    expect(provider.toSearchUrl('https://www.immobilien.de/Wohnen/Suchergebnisse-1.html?search.typ=mieten')).toContain(
      'kategorie=wohnen',
    );
  });

  // District ids have no equivalent on the rewritten site, so this is the one filter that is lost.
  // Losing it quietly is what would turn a Düsseldorf job into a nationwide one without anybody
  // noticing, which is why it has to be said out loud once per run.
  it('says so when it has to drop a district search it cannot translate', () => {
    logger.warn.mockClear();
    const translated = provider.toSearchUrl(
      'https://www.immobilien.de/Wohnen/Suchergebnisse-1.html?search.typ=mieten&search.wo=district%3A2434%2C2695',
    );

    expect(translated).not.toContain('district');
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0][0]).toContain('district:2434,2695');
  });

  it('leaves a url that is already current alone', () => {
    const current = 'https://www.immobilien.de/suche?kategorie=wohnen&typ=mieten&ort=D%C3%BCsseldorf&sort=newest';
    expect(provider.toSearchUrl(current)).toBe(current);
  });

  it('hands back something unparsable rather than throwing on it', () => {
    expect(provider.toSearchUrl('not a url at all')).toBe('not a url at all');
  });
});

describe('#immobilien.de payload parsing', () => {
  const listings = provider.parseListings(fixture('immobilienDe.html'));

  it('reads the listings out of the flight payload', () => {
    expect(listings.length).toBeGreaterThan(0);
    expect(listings[0]).toHaveProperty('legacyId');
  });

  it('produces every field the provider declares as required', () => {
    const normalized = provider.config.normalize(listings[0]);
    for (const field of provider.config.requiredFieldNames) {
      expect(normalized, `missing ${field}`).toHaveProperty(field);
    }
    expect(normalized.link).toMatch(/^https:\/\/www\.immobilien\.de\/expose\/\d+$/);
  });

  it('carries the coordinates through, so the listing needs no geocoding', () => {
    const located = listings.find((entry) => entry.coordinates?.lat != null);
    const normalized = provider.config.normalize(located);

    expect(normalized.latitude).toBeTypeOf('number');
    expect(normalized.longitude).toBeTypeOf('number');
  });

  // React serializes `undefined` as this string, which is truthy and survives a null check, so an
  // unset field reaches the database looking like data unless it is turned back into nothing.
  it('turns the payload spelling of undefined back into nothing', () => {
    const normalized = provider.config.normalize({
      legacyId: 42,
      title: 'Wohnung',
      price: 700,
      stats: [
        { key: 'area', value: 60 },
        { key: 'rooms', value: 2 },
      ],
      address: '40219 Düsseldorf',
      images: ['https://example.org/1.jpg'],
      yearBuilt: '$undefined',
      floor: '$undefined',
      coordinates: '$undefined',
    });

    expect(normalized.buildYear).toBeNull();
    expect(normalized.latitude).toBeUndefined();
    expect(normalized.description).toBeNull();
  });

  // The card lists its figures as labelled stats rather than as fields of their own, so a reader
  // looking for `area` finds nothing and every listing arrives without a size.
  it('reads the size and the rooms out of the stats the card lists', () => {
    const normalized = provider.config.normalize({
      legacyId: 42,
      title: 'Wohnung',
      price: 1092,
      stats: [
        { key: 'area', value: 52 },
        { key: 'rooms', value: 2.5 },
        { key: 'floor', value: '3. OG' },
      ],
    });

    expect(normalized.size).toBe(52);
    expect(normalized.rooms).toBe(2.5);
  });

  it('has no size or rooms for a card whose stats leave them out', () => {
    const normalized = provider.config.normalize({ legacyId: 42, title: 'x', price: 700, stats: [] });

    expect(normalized.size).toBeNull();
    expect(normalized.rooms).toBeNull();
  });

  it('reports no price for a listing that is only available on request', () => {
    const normalized = provider.config.normalize({ legacyId: 42, title: 'x', price: 0, priceOnRequest: true });
    expect(normalized.price).toBeNull();
  });

  it('returns null instead of guessing when the page carries no payload', () => {
    expect(provider.parseListings('<html><body>nothing here</body></html>')).toBeNull();
    expect(provider.readExposePrice('<html></html>')).toBeNull();
  });
});

describe('#immobilien.de empty search', () => {
  /** @param {unknown} data @returns {string} a page streaming `data` as its only flight chunk */
  const flightPage = (data) => `<script>self.__next_f.push([1, ${JSON.stringify(JSON.stringify(data))}])</script>`;

  // The empty search is recognised by metadata that sits after `results` in the props object. A
  // hand-built payload keeps that order by construction, so only the recorded page proves the site
  // still serializes it that way.
  it('recognises a recorded search with no matches as an empty result', () => {
    expect(provider.parseListings(fixture('immobilienDe_empty.html'))).toEqual([]);
  });

  it('does not take recommended listings for hits when the search itself found none', () => {
    const page = flightPage([{ results: [], resultsFailed: false, totalCount: 0 }, { results: [{ legacyId: 42 }] }]);
    expect(provider.parseListings(page)).toEqual([]);
  });

  it('does not take recommended listings for hits when the search failed', () => {
    const page = flightPage([{ results: [], resultsFailed: true, totalCount: 0 }, { results: [{ legacyId: 42 }] }]);
    expect(provider.parseListings(page)).toBeNull();
  });

  it('reports a failed search as unreadable rather than as empty', () => {
    expect(provider.parseListings(flightPage({ results: [], resultsFailed: true, totalCount: 0 }))).toBeNull();
  });

  it('reports a search that counts matches but ships none as unreadable', () => {
    expect(provider.parseListings(flightPage({ results: [], resultsFailed: false, totalCount: 3 }))).toBeNull();
  });

  // Other widgets on the page name their arrays `results` as well, so an empty one alone says
  // nothing about the search.
  it('does not mistake an unrelated empty results array for an empty search', () => {
    expect(provider.parseListings(flightPage({ results: [] }))).toBeNull();
  });

  it('keeps looking for the listings past an unrelated empty results array', () => {
    expect(provider.parseListings(flightPage([{ results: [] }, { results: [{ legacyId: 42 }] }]))).toEqual([
      { legacyId: 42 },
    ]);
  });

  it('does not accept search metadata that never closes', () => {
    const truncated = `<script>self.__next_f.push([1, ${JSON.stringify('{"results":[],"resultsFailed":false,"totalCount":0')}])</script>`;
    expect(provider.parseListings(truncated)).toBeNull();
  });

  // A chunk that will not unescape is dropped from the payload, and losing one with an odd number of
  // quotes leaves the search props unparseable. The recommendations inside them must not take over.
  it('does not report recommended listings when the search metadata will not parse', () => {
    const broken = `<script>self.__next_f.push([1, ${JSON.stringify('{"results":[],"resultsFailed":false,"totalCount":0,"seo":"a"k":1,"relax":{"results":[{"legacyId":7}]}}')}])</script>`;
    expect(provider.parseListings(broken)).toBeNull();
  });
});

describe('#immobilien.de expose price', () => {
  // An exposé ends with a carousel of other flats from the same agent, each a complete listing
  // object in the same payload. Reading the first price in the document reported one of those - a
  // 458.000 € house while enriching a 395 € room - so this asserts the figure belongs to the page.
  it('reads the price of the exposé rather than of the flats advertised beside it', () => {
    const detail = fixture('immobilienDe_detail.html');
    const [ownListing] = provider.parseListings(fixture('immobilienDe.html'));

    expect(provider.readExposePrice(detail)).toBe(ownListing.price);
  });
});
