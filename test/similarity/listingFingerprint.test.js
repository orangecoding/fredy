/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import {
  buildFingerprint,
  candidateBlockKeys,
  descriptionSketch,
  isLikelyDuplicate,
  jaccard,
  normalizeText,
  parseAddress,
  stripAddressSuffix,
  titleTokens,
} from '../../lib/services/similarity-check/listingFingerprint.js';

/** Broker copy, pasted verbatim into every portal - which is what makes it a usable signal. */
const BROKER_COPY =
  'Diese ansprechende Wohnung befindet sich im zweiten Obergeschoss eines gepflegten Mehrfamilienhauses ' +
  'und ueberzeugt durch ihren durchdachten Grundriss. Der Balkon nach Sueden laedt zum Verweilen ein. ' +
  'Die Kueche ist voll ausgestattet, das Bad verfuegt ueber eine bodengleiche Dusche.';

/**
 * The same flat as the three portals actually publish it: three headlines, three address formats,
 * and two different meanings of "price" (ImmoScout is queried for the total rent, Immowelt reports
 * the Kaltmiete).
 */
const immoscout = {
  jobId: 'job-1',
  provider: 'immoscout',
  title: 'Helle 3-Zimmer-Wohnung mit Balkon in Stadtamhof',
  address: 'Stadtamhof, Regensburg',
  price: 1450,
  size: 78,
  rooms: 3,
  description: BROKER_COPY,
};

const immowelt = {
  jobId: 'job-1',
  provider: 'immowelt',
  title: '3-Zimmer-Wohnung mit Balkon, Regensburg-Stadtamhof',
  address: '93059 Stadtamhof, Regensburg',
  price: 1180,
  size: 78,
  rooms: 3,
  description: BROKER_COPY,
};

const kleinanzeigen = {
  jobId: 'job-1',
  provider: 'kleinanzeigen',
  title: '3 Zimmer Wohnung mit Balkon in Regensburg Stadtamhof',
  address: '93059 Regensburg - Stadtamhof',
  price: 1180,
  size: 78,
  rooms: 3,
  description: null,
};

const duplicateOf = (a, b) => isLikelyDuplicate(buildFingerprint(a), buildFingerprint(b));

describe('listingFingerprint', () => {
  describe('normalizeText', () => {
    it('folds umlauts, drops punctuation and lowercases', () => {
      expect(normalizeText('Prüfeninger Straße 12/A')).toBe('pruefeninger strasse 12 a');
      expect(normalizeText('Schöne 3-Zimmer-Wohnung, groß!')).toBe('schoene 3 zimmer wohnung gross');
    });

    it('returns an empty string for non-strings', () => {
      expect(normalizeText(null)).toBe('');
      expect(normalizeText(undefined)).toBe('');
      expect(normalizeText(42)).toBe('');
    });
  });

  describe('stripAddressSuffix', () => {
    it('removes parenthesized suffixes and leaves everything else alone', () => {
      expect(stripAddressSuffix('Main 1 (Mitte)')).toBe('Main 1');
      expect(stripAddressSuffix('Main 1')).toBe('Main 1');
      expect(stripAddressSuffix(null)).toBe(null);
    });
  });

  describe('parseAddress', () => {
    it('reads street, house number and postcode out of a full address line', () => {
      const parsed = parseAddress('Prüfeninger Straße 12, 93049 Regensburg');
      expect(parsed.street).toBe('pruefeningerstr 12');
      expect(parsed.precise).toBe(true);
      expect(parsed.zip).toBe('93049');
      expect([...parsed.locality]).toEqual(['regensburg']);
    });

    it('marks a house number range as not door-precise', () => {
      // Normalization would turn "102-110" into two tokens, so the range is read off the raw text.
      const range = parseAddress('Mindener Straße 102-110, 40227 Düsseldorf');
      expect(range.street).toBe('mindenerstr 102');
      expect(range.precise).toBe(false);

      // A city written with a dash after the postcode is not a range.
      expect(parseAddress('Prüfeninger Straße 12, 93049 Regensburg - Stadtamhof').precise).toBe(true);
    });

    it('reads the compound and the split spelling of a street the same way', () => {
      expect(parseAddress('Prüfeningerstr. 12, 93049 Regensburg').street).toBe('pruefeningerstr 12');
      expect(parseAddress('Prüfeninger Straße 12, 93049 Regensburg').street).toBe('pruefeningerstr 12');
      expect(parseAddress('Prüfeningerstrasse 12').street).toBe('pruefeningerstr 12');
    });

    it('does not invent a street when no house number follows', () => {
      // "Stadtamhof" ends like a street name would; without a number it is a district.
      expect(parseAddress('Stadtamhof, Regensburg').street).toBe(null);
      expect(parseAddress('Prüfeninger Straße, Regensburg').street).toBe(null);
    });

    it('finds the same locality words whichever way a portal formats the line', () => {
      const scout = parseAddress('Stadtamhof, Regensburg');
      const welt = parseAddress('93059 Stadtamhof, Regensburg');
      const klein = parseAddress('93059 Regensburg - Stadtamhof');

      expect(jaccard(scout.locality, welt.locality)).toBe(1);
      expect(jaccard(welt.locality, klein.locality)).toBe(1);
      expect(welt.zip).toBe('93059');
      expect(scout.zip).toBe(null);
    });

    it('survives an empty or missing address', () => {
      expect(parseAddress(null)).toEqual({ street: null, precise: false, zip: null, locality: new Set() });
      expect(parseAddress('')).toEqual({ street: null, precise: false, zip: null, locality: new Set() });
    });

    // Austria and Switzerland write four digits. Without them every Viennese address was the
    // locality {wien} and nothing else.
    it('reads a four-digit postcode when the address has no German one', () => {
      expect(parseAddress('1030 Wien, Landstraße').zip).toBe('1030');
      expect(parseAddress('8001 Zürich').zip).toBe('8001');
    });

    it('still prefers a German postcode over a four-digit house number', () => {
      expect(parseAddress('Industriestraße 1234, 93049 Regensburg').zip).toBe('93049');
    });
  });

  describe('titleTokens', () => {
    it('drops the boilerplate every second German listing carries', () => {
      expect([...titleTokens('Schöne 3-Zimmer-Wohnung mit Balkon in Stadtamhof')]).toEqual(['balkon', 'stadtamhof']);
    });

    it('leaves headlines that share nothing but boilerplate with no overlap', () => {
      const a = titleTokens('Helle 3-Zimmer-Wohnung mit Balkon in Stadtamhof');
      const b = titleTokens('Moderne 3-Zimmer-Wohnung mit Terrasse in Kumpfmühl');
      expect(jaccard(a, b)).toBe(0);
    });
  });

  describe('descriptionSketch', () => {
    it('scores identical broker copy as identical', () => {
      const a = descriptionSketch(BROKER_COPY);
      const b = descriptionSketch(BROKER_COPY);
      expect(a.length).toBeGreaterThan(0);
      expect(a).toEqual(b);
    });

    it('returns nothing for text too short to shingle', () => {
      expect(descriptionSketch('kurz')).toEqual([]);
      expect(descriptionSketch(null)).toEqual([]);
    });
  });

  describe('buildFingerprint', () => {
    it('pins size and rooms to a shared grid so SQLite and the scrapers agree', () => {
      const fromScraper = buildFingerprint({ jobId: 'j', size: 77.6, rooms: 2.4 });
      const fromDatabase = buildFingerprint({ jobId: 'j', size: 78, rooms: '2.5' });
      expect(fromScraper.size).toBe(fromDatabase.size);
      expect(fromScraper.rooms).toBe(fromDatabase.rooms);
      expect(fromScraper.blockKey).toBe(fromDatabase.blockKey);
    });

    it('has no bucket when size or rooms is missing', () => {
      expect(buildFingerprint({ jobId: 'j', size: null, rooms: 3 }).blockKey).toBe(null);
      expect(buildFingerprint({ jobId: 'j', size: 60, rooms: null }).blockKey).toBe(null);
      expect(candidateBlockKeys(buildFingerprint({ jobId: 'j' }))).toEqual([]);
    });

    it('probes the neighbouring size buckets so the tolerance is reachable', () => {
      expect(candidateBlockKeys(buildFingerprint({ jobId: 'j', size: 78, rooms: 3 }))).toEqual([
        'j|3|77',
        'j|3|78',
        'j|3|79',
      ]);
    });
  });

  describe('isLikelyDuplicate', () => {
    // Two different Viennese flats, one per Austrian portal: same size, rooms and price, but two
    // districts. They used to meet on the locality "wien" alone and the second was never notified.
    it('keeps two flats with different postcodes apart', () => {
      const willhaben = {
        jobId: 'job-at',
        provider: 'willhaben',
        title: 'Schöne Wohnung',
        address: '1030 Wien, Landstraße',
        price: 1010,
        size: 50.4,
        rooms: 2,
        description: '',
      };
      const scoutAt = { ...willhaben, provider: 'immoscoutAt', address: '1200 Wien', price: 1000, size: 50 };

      expect(duplicateOf(willhaben, scoutAt)).toBe(false);
    });

    it('matches the same flat across all three portals', () => {
      expect(duplicateOf(immoscout, immowelt)).toBe(true);
      expect(duplicateOf(immoscout, kleinanzeigen)).toBe(true);
      expect(duplicateOf(immowelt, kleinanzeigen)).toBe(true);
    });

    it('matches even though the portals report different kinds of rent', () => {
      // 1450 total vs 1180 cold: the price signal cannot fire here, the headline carries the match.
      expect(immoscout.price).not.toBe(immowelt.price);
      expect(duplicateOf(immoscout, immowelt)).toBe(true);
    });

    it('matches on street and house number alone when both portals give one', () => {
      const a = { ...immoscout, address: 'Prüfeninger Straße 12, 93049 Regensburg', title: 'Wohnung' };
      const b = {
        ...immowelt,
        address: 'Prüfeningerstr. 12, 93049 Regensburg',
        title: 'Ganz anders betitelt',
        description: null,
        price: 999,
      };
      expect(duplicateOf(a, b)).toBe(true);
    });

    it('keeps two different flats apart when only size, rooms and district agree', () => {
      const other = {
        ...immowelt,
        title: 'Dachgeschoss-Maisonette mit Galerie',
        price: 1700,
        description: 'Ein voellig anderes Objekt mit Galerie und Dachterrasse ueber zwei Ebenen im Altbau.',
      };
      expect(duplicateOf(immoscout, other)).toBe(false);
    });

    it('never collapses two listings from the same provider', () => {
      // Two units in one new-build: same size, same rooms, same copy, same portal.
      const twin = { ...immoscout, title: `${immoscout.title} - Whg. 4` };
      expect(duplicateOf(immoscout, twin)).toBe(false);
    });

    it('requires size and rooms on both sides', () => {
      expect(duplicateOf({ ...immoscout, size: null }, immowelt)).toBe(false);
      expect(duplicateOf(immoscout, { ...immowelt, rooms: null })).toBe(false);
    });

    it('tolerates a square metre of disagreement but not more', () => {
      expect(duplicateOf(immoscout, { ...immowelt, size: 79 })).toBe(true);
      expect(duplicateOf(immoscout, { ...immowelt, size: 81 })).toBe(false);
    });

    it('gives a micro-apartment no square metre of slack', () => {
      // A square metre is rounding on a 78 m² flat and 4% of a 25 m² studio - and buildings full of
      // studios are exactly where near-identical units sit next to each other.
      const studioA = { ...immoscout, size: 26, rooms: 1, title: 'Mikroapartment mit Vollausstattung' };
      const studioB = { ...immowelt, size: 27, rooms: 1, title: 'Mikroapartment mit Vollausstattung' };
      expect(duplicateOf(studioA, studioB)).toBe(false);
      expect(duplicateOf(studioA, { ...studioB, size: 26 })).toBe(true);
    });

    it('does not treat a house number spanning a complex as a door', () => {
      // "Mindener Straße 102-110" is fifty micro-apartments, not one address.
      const complexA = {
        ...immoscout,
        address: 'Mindener Straße 102-110, 40227 Düsseldorf',
        title: 'Stylisches Studio-Apartment',
        description: null,
        price: 935,
      };
      const complexB = {
        ...immowelt,
        address: 'Mindener Straße 102-110, 40227 Düsseldorf',
        title: 'Erdgeschoss-Wohnung mit eigener Terrasse',
        description: null,
        price: 839,
      };
      expect(duplicateOf(complexA, complexB)).toBe(false);

      // The same pair at one door still matches on the address alone.
      const doorA = { ...complexA, address: 'Mindener Straße 104, 40227 Düsseldorf' };
      const doorB = { ...complexB, address: 'Mindener Straße 104, 40227 Düsseldorf' };
      expect(duplicateOf(doorA, doorB)).toBe(true);
    });

    it('treats a different room count as a different flat', () => {
      expect(duplicateOf(immoscout, { ...immowelt, rooms: 2 })).toBe(false);
    });

    it('never crosses jobs', () => {
      expect(duplicateOf(immoscout, { ...immowelt, jobId: 'job-2' })).toBe(false);
    });

    it('refuses to match on size and rooms alone when the places do not line up', () => {
      const elsewhere = { ...immowelt, address: '10115 Berlin - Mitte', title: immoscout.title };
      expect(duplicateOf(immoscout, elsewhere)).toBe(false);
    });

    it('lets the advertising copy carry the match when nothing else does', () => {
      const a = { ...immoscout, title: 'Wohnung A', price: 1450 };
      const b = { ...immowelt, title: 'Objekt B', price: 1180 };
      // Same district, same copy, unrelated headlines and incomparable prices.
      expect(duplicateOf(a, b)).toBe(true);
      expect(duplicateOf({ ...a, description: null }, { ...b, description: null })).toBe(false);
    });

    it('lets the asking price carry the match when it is the same number', () => {
      const a = { ...immoscout, title: 'Wohnung A', price: 1180, description: null };
      const b = { ...immowelt, title: 'Objekt B', price: 1180, description: null };
      expect(duplicateOf(a, b)).toBe(true);
    });
  });
});

/**
 * The French portals quote a rent per advert either charges comprises or hors charges, and the
 * providers store what each one states: leboncoin and Bien'ici the rent without the charges where
 * the advert gives them, SeLoger the headline its card shows. Compared as bare numbers, the same
 * flat on two of them was two flats.
 */
describe('isLikelyDuplicate, rents with and without the charges', () => {
  // The recorded flat near rue de Wattignies, Paris 12e: 1 190 € charges comprises, 50 € of it
  // charges, on leboncoin and on SeLoger at once.
  const leboncoin = {
    jobId: 'job-fr',
    provider: 'leboncoin',
    title: 'Appartement 2 pièces 37 m²',
    address: 'Nation - Picpus, 75012 Paris',
    price: 1140,
    chargesIncluded: false,
    charges: 50,
    size: 37,
    rooms: 2,
    description: null,
  };
  const seloger = {
    jobId: 'job-fr',
    provider: 'seloger',
    title: 'Appartement à louer',
    address: '75012 Vallée de Fécamp, Paris',
    price: 1190,
    chargesIncluded: true,
    size: 37,
    rooms: 2,
    description: null,
  };

  it('compares the two rents on the basis both portals know', () => {
    expect(duplicateOf(leboncoin, seloger)).toBe(true);
  });

  it('keeps apart two flats whose rents differ on that basis', () => {
    expect(duplicateOf(leboncoin, { ...seloger, price: 1290 })).toBe(false);
  });

  it('compares the rents without the charges where both sides know those', () => {
    const bienici = { ...seloger, provider: 'bienici', price: 1190, charges: 45 };
    expect(duplicateOf({ ...leboncoin, charges: 5, price: 1145 }, bienici)).toBe(true);
  });

  // A rent whose basis nobody stated is compared as the bare number it always was.
  it('leaves a rent of unknown basis to the bare comparison', () => {
    const unknown = { ...seloger, chargesIncluded: undefined };
    expect(duplicateOf(leboncoin, unknown)).toBe(false);
    expect(duplicateOf(leboncoin, { ...unknown, price: 1140 })).toBe(true);
  });
});

/**
 * Every language's listing headlines carry the same few filler words - the property type, "bright",
 * "quiet", "with", "near the centre". The German ones were always noise to the title check; left in
 * for the other languages, they let two different flats that share a postcode, a size and a room
 * count vouch for each other through words that say nothing about either.
 */
describe('isLikelyDuplicate, headlines in the other languages', () => {
  const pair = (provider, title, other) => [
    { jobId: 'job-x', provider, title, address: '75011 Paris', price: 850, size: 20, rooms: 1, description: null },
    {
      jobId: 'job-x',
      provider: `${provider}-other`,
      title: other,
      address: '75011 Paris',
      price: 990,
      size: 20,
      rooms: 1,
      description: null,
    },
  ];

  it.each([
    ['french', 'Studio meublé proche métro', 'Studio meublé proche gare'],
    ['french', 'Appartement lumineux avec balcon', 'Appartement calme avec balcon'],
    ['italian', 'Bilocale arredato con balcone', 'Bilocale luminoso con balcone'],
    ['spanish', 'Piso luminoso con terraza', 'Piso reformado con terraza'],
    ['portuguese', 'Apartamento mobilado com varanda', 'Apartamento remodelado com varanda'],
  ])('does not take the filler of %s headlines for the same flat', (_, first, second) => {
    expect(duplicateOf(...pair('a', first, second))).toBe(false);
  });

  it('still reads a distinctive shared headline as the same flat', () => {
    expect(
      duplicateOf(...pair('a', 'Studio rue Oberkampf vue Sacré-Cœur', 'Studio vue Sacré-Cœur, rue Oberkampf')),
    ).toBe(true);
  });
});
