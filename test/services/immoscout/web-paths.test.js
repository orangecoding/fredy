/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import {
  DEFAULT_PARAMS_BY_TYPE,
  listKnownWebPaths,
  resolveWebPath,
} from '../../../lib/services/immoscout/web-paths.js';
import { describe, expect, it } from 'vitest';

describe('#immoscout web path resolution', () => {
  describe('base paths', () => {
    // Every base path ImmoScout serves, and the type the mobile API answers it with.
    it.each([
      ['wohnung-mieten', 'apartmentrent'],
      ['wohnung-kaufen', 'apartmentbuy'],
      ['haus-mieten', 'houserent'],
      ['haus-kaufen', 'housebuy'],
      ['anlageimmobilie', 'investment'],
      ['grundstueck-kaufen', 'livingbuysite'],
      ['garage-kaufen', 'garagebuy'],
      ['garage-mieten', 'garagerent'],
      ['wg-zimmer', 'flatshareroom'],
      ['wohnen-auf-zeit', 'shorttermaccommodation'],
      ['seniorenwohnen', 'assistedliving'],
      ['zwangsversteigerung', 'compulsoryauction'],
    ])('should resolve %s to %s without any filter', (slug, realType) => {
      expect(resolveWebPath(slug)).toEqual({ realType, params: {} });
    });
  });

  describe('apartment slugs', () => {
    // The web UI folds a single filter into the path. Both suffixes exist for each slug below.
    it.each([
      ['souterrainwohnung', { apartmenttypes: ['halfbasement'] }],
      ['erdgeschosswohnung', { apartmenttypes: ['groundfloor'] }],
      ['hochparterrewohnung', { apartmenttypes: ['raisedgroundfloor'] }],
      ['etagenwohnung', { apartmenttypes: ['apartment'] }],
      ['loft', { apartmenttypes: ['loft'] }],
      ['maisonette', { apartmenttypes: ['maisonette'] }],
      ['terrassenwohnung', { apartmenttypes: ['terracedflat'] }],
      ['penthouse', { apartmenttypes: ['penthouse'] }],
      ['dachgeschosswohnung', { apartmenttypes: ['roofstorey'] }],
      ['wohnung-mit-garage', { equipment: ['parking'] }],
      ['wohnung-mit-einbaukueche', { equipment: ['builtinkitchen'] }],
      ['wohnung-mit-keller', { equipment: ['cellar'] }],
      ['wohnung-mit-balkon', { equipment: ['balcony'] }],
      ['wohnung-mit-garten', { equipment: ['garden'] }],
      ['barrierefreie-wohnung', { equipment: ['handicappedaccessible'] }],
      ['neubauwohnung', { newbuilding: true }],
      ['altbauwohnung', { fulltext: 'altbau' }],
      ['wohnung-von-privat', { fulltext: 'privat' }],
    ])('should resolve %s for both suffixes', (slug, params) => {
      expect(resolveWebPath(`${slug}-mieten`)).toEqual({ realType: 'apartmentrent', params });
      expect(resolveWebPath(`${slug}-kaufen`)).toEqual({ realType: 'apartmentbuy', params });
    });
  });

  describe('house slugs', () => {
    // "Haus kaufen" plus the Garage filter arrives as "haus-mit-garage-kaufen" and never as
    // "haus-kaufen?equipment=parking". Unmapped, such a path has no real estate type at all and the
    // job dies on "Real estate type not found" (#378).
    it.each([
      ['haus-mit-garage', { equipment: ['parking'] }],
      ['haus-mit-keller', { equipment: ['cellar'] }],
      ['einfamilienhaus', { buildingtypes: ['singlefamilyhouse'] }],
      ['doppelhaushaelfte', { buildingtypes: ['semidetachedhouse'] }],
      ['reihenhaus', { buildingtypes: ['terracehouse'] }],
      ['bungalow', { buildingtypes: ['bungalow'] }],
      ['mehrfamilienhaus', { buildingtypes: ['multifamilyhouse'] }],
      ['bauernhaus', { buildingtypes: ['farmhouse'] }],
      ['villa', { buildingtypes: ['villa'] }],
      ['neubauhaus', { newbuilding: true }],
    ])('should resolve %s for both suffixes', (slug, params) => {
      expect(resolveWebPath(`${slug}-mieten`)).toEqual({ realType: 'houserent', params });
      expect(resolveWebPath(`${slug}-kaufen`)).toEqual({ realType: 'housebuy', params });
    });
  });

  describe('whole slugs', () => {
    it.each([
      ['luxushaus-kaufen', 'housebuy', { luxurypromotion: true }],
      ['luxuswohnung-kaufen', 'apartmentbuy', { luxurypromotion: true }],
      ['guenstiges-haus-kaufen', 'housebuy', { price: '-100000.0' }],
      ['guenstige-wohnung-kaufen', 'apartmentbuy', { price: '-100000.0' }],
      ['guenstige-wohnung-mieten', 'apartmentrent', { price: '-400.0', pricetype: 'rentpermonth' }],
      ['studentenwohnung-mieten', 'apartmentrent', { price: '-350.0', pricetype: 'rentpermonth' }],
      ['moeblierte-wohnung-mieten', 'apartmentrent', { fulltext: 'möbliert' }],
      ['provisionsfreies-haus-kaufen', 'housebuy', { freeofcourtageonly: true }],
      ['provisionsfreie-wohnung-kaufen', 'apartmentbuy', { freeofcourtageonly: true }],
      ['haus-bauen', 'housebuy', { newhomebuilder: true }],
      ['besondere-immobilien', 'housebuy', { buildingtypes: ['specialrealestate'] }],
      ['wohnung-kaufen-mit-balkon', 'apartmentbuy', { equipment: ['balcony'] }],
      ['eigentumswohnung-mit-garten', 'apartmentbuy', { equipment: ['garden'] }],
    ])('should resolve %s to %s', (slug, realType, params) => {
      expect(resolveWebPath(slug)).toMatchObject({ realType, params });
    });

    // Registering the counterpart of a one-sided slug would invent a search the website does not
    // offer - each of these answers 410 on ImmoScout.
    it.each([
      'luxushaus-mieten',
      'luxuswohnung-mieten',
      'guenstiges-haus-mieten',
      'provisionsfreie-wohnung-mieten',
      'provisionsfreies-haus-mieten',
      'moeblierte-wohnung-kaufen',
      'studentenwohnung-kaufen',
      'besondere-immobilien-mieten',
      'haus-bauen-mieten',
      'altbauhaus-kaufen',
      'haus-mit-garten-kaufen',
      'wohnung-mit-terrasse-mieten',
      'gewerbeflaeche-mieten',
    ])('should not resolve %s', (slug) => {
      expect(resolveWebPath(slug)).toBeNull();
    });

    // These two carry no filter of their own, they only differ from the apartmentrent default.
    it('should override the type default for bestandswohnung-mieten', () => {
      expect(resolveWebPath('bestandswohnung-mieten')).toEqual({
        realType: 'apartmentrent',
        params: {},
        defaults: { exclusioncriteria: ['swapflat', 'projectlisting'] },
      });
    });

    it('should clear the type default for mietwohnungen-mit-tauschwohnungen', () => {
      expect(resolveWebPath('mietwohnungen-mit-tauschwohnungen')).toEqual({
        realType: 'apartmentrent',
        params: {},
        defaults: { exclusioncriteria: [] },
      });
    });
  });

  describe('generated slugs', () => {
    // Room counts up to five are an exact range, six is open ended.
    it.each([
      ['1-zimmer-wohnung-mieten', 'apartmentrent', '1.0-1.5'],
      ['2-zimmer-wohnung-mieten', 'apartmentrent', '2.0-2.5'],
      ['3-zimmer-wohnung-kaufen', 'apartmentbuy', '3.0-3.5'],
      ['4-zimmer-wohnung-mieten', 'apartmentrent', '4.0-4.5'],
      ['5-zimmer-wohnung-kaufen', 'apartmentbuy', '5.0-5.5'],
      ['6-zimmer-wohnung-mieten', 'apartmentrent', '6.0-'],
      ['6-zimmer-wohnung-kaufen', 'apartmentbuy', '6.0-'],
    ])('should resolve %s to %s with numberofrooms %s', (slug, realType, numberofrooms) => {
      expect(resolveWebPath(slug)).toEqual({ realType, params: { numberofrooms } });
    });

    it('should resolve a max warmrent path to price plus pricetype', () => {
      expect(resolveWebPath('wohnung-bis-800-euro-warm')).toEqual({
        realType: 'apartmentrent',
        params: { price: '-800', pricetype: 'calculatedtotalrent' },
      });
    });

    // ImmoScout stops at six rooms, publishes no warm rent page for houses, and the mobile API
    // rejects calculatedtotalrent for houserent - so neither may be invented.
    it.each([
      '7-zimmer-wohnung-mieten',
      '10-zimmer-wohnung-kaufen',
      '0-zimmer-wohnung-mieten',
      '3-zimmer-haus-mieten',
      '3-zimmer-wohnung-tauschen',
      'haus-bis-1500-euro-warm',
      'wohnung-bis-800-euro-kalt',
    ])('should not resolve %s', (slug) => {
      expect(resolveWebPath(slug)).toBeNull();
    });
  });

  describe('defaults', () => {
    // Rent apartment searches hide exchange flats; the website sends no default for anything else.
    it('should default apartment rent to excluding exchange flats', () => {
      expect(DEFAULT_PARAMS_BY_TYPE.apartmentrent).toEqual({ exclusioncriteria: ['swapflat'] });
    });

    it.each(['apartmentbuy', 'houserent', 'housebuy', 'investment', 'flatshareroom'])(
      'should give %s no default at all',
      (realType) => {
        expect(DEFAULT_PARAMS_BY_TYPE[realType]).toBeUndefined();
      },
    );
  });

  describe('listKnownWebPaths', () => {
    it('should list every literal path plus one example per generated pattern', () => {
      const paths = listKnownWebPaths();

      expect(paths).toEqual(expect.arrayContaining(['haus-kaufen', 'haus-mit-garage-kaufen', 'wg-zimmer']));
      expect(paths).toEqual(expect.arrayContaining(['3-zimmer-wohnung-mieten', 'wohnung-bis-800-euro-warm']));
      expect(new Set(paths).size).toBe(paths.length);
    });

    // The live sweep in the translator test is only worth anything if every listed path resolves.
    it('should only list paths that resolve', () => {
      expect(listKnownWebPaths().filter((path) => resolveWebPath(path) == null)).toEqual([]);
    });
  });
});
