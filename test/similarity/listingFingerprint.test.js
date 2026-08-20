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
