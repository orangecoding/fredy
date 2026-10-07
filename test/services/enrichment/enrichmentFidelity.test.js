/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { readFileSync } from 'fs';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { mietspiegelEstimate } from '../../../lib/services/enrichment/mietspiegel.js';
import { roughCommuteMinutes } from '../../../lib/services/enrichment/commute.js';
import { lookupGreix } from '../../../lib/services/enrichment/greixLookup.js';
import { calculateScores } from '../../../lib/services/enrichment/scorer.js';

const written = [];
vi.mock('../../../lib/services/storage/listingsStorage.js', () => ({
  updateListingScoresByLink: (link, scores) => {
    written.push({ link, scores });
    return { updated: 1, skipped: false };
  },
}));

const fixture = JSON.parse(readFileSync(new URL('../../testFixtures/enrichment-oracle.json', import.meta.url), 'utf8'));

describe('enrichment port fidelity (python oracle)', () => {
  describe('mietspiegel', () => {
    it('matches the lookup table exactly', () => {
      expect(mietspiegelEstimate(null)).toBe(6.0);
      expect(mietspiegelEstimate(25)).toBe(8.5);
      expect(mietspiegelEstimate(26)).toBe(8.0);
      expect(mietspiegelEstimate(40)).toBe(8.0);
      expect(mietspiegelEstimate(41)).toBe(7.5);
      expect(mietspiegelEstimate(60)).toBe(7.5);
      expect(mietspiegelEstimate(61)).toBe(7.0);
      expect(mietspiegelEstimate(90)).toBe(7.0);
      expect(mietspiegelEstimate(91)).toBe(6.5);
      expect(mietspiegelEstimate(120)).toBe(6.5);
      expect(mietspiegelEstimate(121)).toBe(6.0);
    });

    it('matches every table entry from the oracle', () => {
      for (const [area, expected] of Object.entries(fixture.mietspiegel)) {
        expect(mietspiegelEstimate(Number(area))).toBe(expected);
      }
    });
  });

  describe('commute', () => {
    it('returns null without a position', () => {
      expect(roughCommuteMinutes(null, 13.4)).toBeNull();
      expect(roughCommuteMinutes(52.5, null)).toBeNull();
    });

    it('matches the oracle within float noise', () => {
      // Potsdamer Platz to itself is zero distance; Wilmersdorf exercises the full formula.
      expect(roughCommuteMinutes(52.5244, 13.3884)).toBe(0);
      const wilmer = fixture.brw_points.find((p) => p.name === 'wilmersdorf');
      expect(Math.abs(roughCommuteMinutes(wilmer.lat, wilmer.lon) - fixture.commute.wilmersdorf)).toBeLessThan(1e-6);
    });
  });

  describe('greix', () => {
    // Interior points verified against the polygons, with the 2000-2025 CAGR
    // derived from GREIX.csv (2000 = 100 everywhere, span = 25 years).
    const regionPoints = [
      ['Berlin (Charlottenburg)', 52.499126, 13.28372, 0.04966065187064306],
      ['Berlin (Friedrichshain)', 52.524279, 13.423338, 0.047711694549370964],
      ['Berlin (Mitte)', 52.507069, 13.335011, 0.05210591871771997],
      ['Berlin (Nord)', 52.58645, 13.217686, 0.04166786706413461],
      ['Berlin (Ost)', 52.525774, 13.466312, 0.043606093086799635],
      ['Berlin (Prenzlauerberg)', 52.546985, 13.400609, 0.05019731644697423],
      ['Berlin (Schöneberg - Friedenau)', 52.467201, 13.322806, 0.048562023443845304],
      ['Berlin (Süd-Ost)', 52.401978, 13.363662, 0.04137254870726781],
      ['Berlin (Südwest)', 52.415878, 13.10251, 0.040260808314525276],
      ['Berlin (Tempelhof - Neukölln - Kreuzberg)', 52.44741, 13.361845, 0.05648312465234251],
      ['Berlin (Wedding - Gesundbrunnen)', 52.538707, 13.276647, 0.049756790804374784],
      ['Berlin (West)', 52.447574, 13.117941, 0.03841497642797842],
      ['Berlin (Wilmersdorf)', 52.468616, 13.299909, 0.049760532203547925],
    ];

    it('matches every region with its 2000-2025 CAGR', () => {
      expect(regionPoints).toHaveLength(13);
      for (const [region, lat, lon, cagr] of regionPoints) {
        const hit = lookupGreix(lat, lon);
        expect(hit.region).toBe(region);
        expect(hit.fromYear).toBe(2000);
        expect(hit.toYear).toBe(2025);
        expect(hit.indexBase).toBe(100);
        expect(Math.abs(hit.cagr - cagr)).toBeLessThan(1e-12);
      }
    });

    it('resolves the fixed landmarks', () => {
      // Potsdamer Platz sits in Mitte, the old Wilmersdorf flat in Wilmersdorf.
      expect(lookupGreix(52.5096, 13.376).region).toBe('Berlin (Mitte)');
      const wilmer = lookupGreix(52.4968872, 13.3225924);
      expect(wilmer.region).toBe('Berlin (Wilmersdorf)');
      expect(wilmer.greixName).toBe('Wilmersdorf');
    });

    it('returns nulls outside Berlin and without coordinates', () => {
      for (const [lat, lon] of [
        [53.5511, 9.9937],
        [52.52, 13.405 - 5],
        [null, 13.4],
        [52.5, null],
      ]) {
        const miss = lookupGreix(lat, lon);
        expect(miss.region).toBeNull();
        expect(miss.cagr).toBeNull();
      }
    });
  });

  describe('scorer', () => {
    const checkScores = (name, exact = false) => {
      const { input, expected } = fixture.scorer[name];
      const scores = calculateScores({ miete: input.miete, area: input.area, price: input.price, cagr: input.cagr });
      if (exact) {
        expect(scores.investorScore).toBe(expected.investor_score);
        expect(scores.ownerScore).toBe(expected.owner_score);
      } else {
        expect(Math.abs(scores.investorScore - expected.investor_score)).toBeLessThan(0.05);
        expect(Math.abs(scores.ownerScore - expected.owner_score)).toBeLessThan(0.05);
      }
    };

    it('scores the Wilmersdorf flat exactly 0/0 like production', () => {
      checkScores('wilmersdorf_zero', true);
    });

    it('matches guard-rail cases within rounding noise', () => {
      for (const name of ['healthy', 'nulls', 'price_zero', 'cagr_none', 'top_bands']) {
        checkScores(name);
      }
    });
  });

  describe('enrichListing', () => {
    let enrichListing;

    beforeAll(async () => {
      ({ enrichListing } = await import('../../../lib/services/enrichment/enrichListing.js'));
    });

    it('writes the full payload through the guarded writer', () => {
      written.length = 0;
      const scores = enrichListing({
        link: 'https://www.immobilienscout24.de/expose/170491270',
        area: 24,
        price: 195000,
        latitude: 52.4968872,
        longitude: 13.3225924,
      });
      // Cashflow and buy/rent score 0 (overpriced flat); growth carries Wilmersdorf's
      // 2000-2025 CAGR (~4.98%) to ~14.9 points on both axes.
      expect(scores.investorScore).toBe(14.9);
      expect(scores.ownerScore).toBe(14.9);
      expect(written).toHaveLength(1);
      expect(written[0].scores).toMatchObject({
        investor_score: 14.9,
        owner_score: 14.9,
        asset_risk_score: 0,
        isochronen_miete: 8.5,
        greix_region: 'Berlin (Wilmersdorf)',
      });
      expect(Math.abs(written[0].scores.greix_cagr - 0.049760532203547925)).toBeLessThan(1e-12);
      expect(written[0].scores).not.toHaveProperty('brw_value');
      expect(written[0].scores).not.toHaveProperty('brw_old');
      expect(written[0].scores).not.toHaveProperty('bezirk');
      expect(written[0].scores.commute_minutes).toBeGreaterThan(0);
    });

    it('returns null without a link and writes nothing', () => {
      written.length = 0;
      expect(enrichListing({ area: 50, price: 100000 })).toBeNull();
      expect(written).toHaveLength(0);
    });

    it('reads living space from `size` like stored rows do', () => {
      written.length = 0;
      const scores = enrichListing({
        link: 'https://www.immobilienscout24.de/expose/170491270',
        size: 24,
        price: 195000,
        latitude: 52.4968872,
        longitude: 13.3225924,
      });
      // Same flat as above, `size` instead of `area`: identical payload, with the
      // size-bracket rent (8.5) rather than the "area unknown" fallback (6.0).
      expect(scores.investorScore).toBe(14.9);
      expect(scores.ownerScore).toBe(14.9);
      expect(written).toHaveLength(1);
      expect(written[0].scores).toMatchObject({
        investor_score: 14.9,
        owner_score: 14.9,
        isochronen_miete: 8.5,
        greix_region: 'Berlin (Wilmersdorf)',
      });
    });
  });
});
