/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';

import {
  normalizeGerman,
  normalizeSwiss,
  normalizeAustrian,
  normalizeSpanish,
  parseSpanishCoverage,
  parseSpanishOperators,
  AVAILABILITY_THRESHOLD_PERCENT,
} from '../../../lib/services/connectivity/normalize.js';

/**
 * Turning four national registers into one answer.
 *
 * Each of them describes an area rather than a building, in units of its own - Germany a
 * percentage of households per 100m cell, Switzerland a class number per 250m square, Austria the
 * providers' own offers per 100m cell, Spain the same per cadastral parcel - so this is where most
 * of the ways to be subtly wrong live. The fixtures are trimmed copies of real answers from all
 * four services.
 */
describe('services/connectivity/normalize', () => {
  describe('germany', () => {
    /**
     * The shares of a German cell, written the way the register does: cumulative, so `_100` means
     * "at least 100 Mbit/s" and the series can only fall as the class grows.
     *
     * @param {Record<string, number>} overrides Field name to percentage.
     * @returns {Record<string, number>}
     */
    function cell(overrides) {
      return { gem: '11000001', ...overrides };
    }

    it('reports the fastest class more than half the households can get', () => {
      const result = normalizeGerman(
        cell({
          down_fn_hh_alle_10: 100,
          down_fn_hh_alle_100: 100,
          down_fn_hh_alle_400: 82.5,
          down_fn_hh_alle_1000: 61.2,
        }),
        null,
      );

      expect(result.maxDownMbit).toBe(1000);
      expect(result.sharePercent).toBe(61.2);
    });

    it('steps down to the class that clears the threshold', () => {
      const result = normalizeGerman(
        cell({
          down_fn_hh_alle_100: 97.9,
          // Just under. A cell where a third of the households can get a gigabit is not a cell
          // where this flat can, and claiming otherwise is the whole failure mode here.
          down_fn_hh_alle_400: 33.1,
          down_fn_hh_alle_1000: 33.1,
        }),
        null,
      );

      expect(result.maxDownMbit).toBe(100);
      expect(result.sharePercent).toBe(97.9);
    });

    it('reports nothing at all when no class clears the threshold', () => {
      const result = normalizeGerman(cell({ down_fn_hh_alle_10: 12, down_fn_hh_alle_30: 4 }), null);

      expect(result.maxDownMbit).toBeNull();
      expect(result.sharePercent).toBeNull();
    });

    it('treats the threshold itself as covered', () => {
      const result = normalizeGerman(cell({ down_fn_hh_alle_100: AVAILABILITY_THRESHOLD_PERCENT }), null);

      expect(result.maxDownMbit).toBe(100);
    });

    it('separates a fibre cell from one the cable network makes fast', () => {
      // Berlin Mitte as the register actually reports it: gigabit over coax, fibre to under half
      // the households.
      const result = normalizeGerman(
        cell({
          down_fn_hh_alle_1000: 100,
          down_fn_hh_hfc_1000: 100,
          down_fn_hh_fttc_200: 100,
          down_fn_hh_ftthb_100: 45.36,
        }),
        null,
      );

      expect(result.maxDownMbit).toBe(1000);
      expect(result.fiber).toBe(false);
      expect(result.technologies.hfc.maxDownMbit).toBe(1000);
      expect(result.technologies.fttc.maxDownMbit).toBe(200);
      expect(result.technologies.ftthb.maxDownMbit).toBeNull();
    });

    it('calls it fibre once fibre reaches most of the cell', () => {
      const result = normalizeGerman(cell({ down_fn_hh_alle_1000: 88, down_fn_hh_ftthb_1000: 88 }), null);

      expect(result.fiber).toBe(true);
      expect(result.technologies.ftthb.maxDownMbit).toBe(1000);
    });

    it('reads an availability flag as a bitmask of own network and roaming', () => {
      const result = normalizeGerman(null, {
        beste_tech: '5g_sa',
        verf_4g: 1,
        verf_5g: 1,
        // Telekom on its own network, 1&1 through Vodafone's. Both are coverage; only one of them
        // is the operator's own, and a flat number would lose that.
        verf_5g_dt: 1,
        verf_5g_ee: 2,
      });

      expect(result.mobile.neutral['5g']).toBe(true);
      expect(result.mobile.operators.dt['5g']).toBe(true);
      expect(result.mobile.operators.ee['5g']).toBe(true);
      expect(result.mobile.roamingOnly).toEqual(['ee']);
    });

    it('does not call it roaming when the operator is also there in its own right', () => {
      const result = normalizeGerman(null, { beste_tech: '5g', verf_5g: 1, verf_5g_ee: 3 });

      expect(result.mobile.operators.ee['5g']).toBe(true);
      expect(result.mobile.roamingOnly).toEqual([]);
    });

    it('leaves out an operator that reaches the cell with nothing', () => {
      const result = normalizeGerman(null, { beste_tech: '4g', verf_4g: 1, verf_4g_dt: 1, verf_4g_vf: 0 });

      expect(Object.keys(result.mobile.operators)).toEqual(['dt']);
    });

    it('reads the register saying there is no mobile coverage at all', () => {
      const result = normalizeGerman(null, { beste_tech: 'keine', verf_2g: 0, verf_4g: 0, verf_5g: 0 });

      expect(result.mobile.bestTech).toBeNull();
      expect(Object.values(result.mobile.neutral).every((value) => value === false)).toBe(true);
    });

    it('has nothing to say about a place neither half of the register knows', () => {
      expect(normalizeGerman(null, null)).toBeNull();
    });

    it('tells a missing figure apart from a zero one', () => {
      // The register leaves a field out when it has no figure, and returns 0 when it has one and it
      // is nobody. Coercing the first into the second would report "no coverage" for a cell nobody
      // has surveyed.
      const missing = normalizeGerman(cell({}), null);
      const zero = normalizeGerman(cell({ down_fn_hh_alle_10: 0 }), null);

      expect(missing.technologies.ftthb.sharePercent).toBeNull();
      expect(zero.maxDownMbit).toBeNull();
    });
  });

  describe('switzerland', () => {
    it('turns a class number into the band of buildings it stands for', () => {
      // Zürich as the service actually answers: every speed layer in the top band.
      const result = normalizeSwiss({
        'ch.bakom.downlink100': 4,
        'ch.bakom.downlink1000': 4,
        'ch.bakom.anschlussart-glasfaser': 4,
      });

      expect(result.maxDownMbit).toBe(1000);
      expect(result.sharePercent).toBe(95);
      expect(result.fiber).toBe(true);
    });

    it('stops at the last class most of the square can get', () => {
      const result = normalizeSwiss({
        'ch.bakom.downlink30': 4,
        'ch.bakom.downlink100': 3,
        // Band 2 is >10-50 %, which is not most of the square.
        'ch.bakom.downlink300': 2,
        'ch.bakom.downlink1000': 1,
      });

      expect(result.maxDownMbit).toBe(100);
    });

    it('does not attribute the cable network speed to fibre', () => {
      // The Swiss register says a square is served by fibre without saying how fast, so the
      // headline speed cannot be carried across - it may well be coax.
      const result = normalizeSwiss({ 'ch.bakom.downlink1000': 4, 'ch.bakom.anschlussart-glasfaser': 4 });

      expect(result.technologies.ftthb.maxDownMbit).toBeNull();
      expect(result.technologies.ftthb.sharePercent).toBe(95);
    });

    it('counts operators instead of naming them', () => {
      const result = normalizeSwiss({ 'ch.bakom.mobilnetz-4g': 3, 'ch.bakom.mobilnetz-5g': 2 });

      expect(result.mobile.neutral['4g']).toBe(true);
      expect(result.mobile.neutral['5g']).toBe(true);
      expect(result.mobile.operatorCount).toBe(3);
      expect(result.mobile.operators).toEqual({});
    });

    it('reports a square no mobile network reaches', () => {
      const result = normalizeSwiss({ 'ch.bakom.mobilnetz-4g': 0, 'ch.bakom.mobilnetz-5g': 0 });

      expect(result.mobile.neutral['4g']).toBe(false);
      expect(result.mobile.bestTech).toBeNull();
      expect(result.mobile.operatorCount).toBe(0);
    });

    it('has nothing to say when no layer answered', () => {
      expect(normalizeSwiss({})).toBeNull();
      expect(normalizeSwiss(null)).toBeNull();
    });
  });

  describe('austria', () => {
    /** One fixed-line provider, written the way the register lists them. */
    const offer = (technik, download, upload = 50) => ({
      company: `${technik} AG`,
      company_short: `${technik} AG`,
      technik,
      download,
      upload,
    });

    it('reports the fastest offer anyone makes at the address', () => {
      const result = normalizeAustrian([offer('FTTH', 1000), offer('xDSL', 55)], null);

      expect(result.maxDownMbit).toBe(1000);
      expect(result.source).toBe('at-rtr');
    });

    it('leaves the household share empty rather than inventing one', () => {
      // The register publishes the offers themselves, so there is nothing to take a fraction of.
      // A share here would put a meter on the card measuring a number nobody reported.
      const result = normalizeAustrian([offer('FTTH', 1000)], null);

      expect(result.sharePercent).toBeNull();
      expect(result.technologies.ftthb.sharePercent).toBeNull();
    });

    it('sorts the technology names of the register into the three the card names', () => {
      const result = normalizeAustrian([offer('FTTB', 300), offer('DOCSIS 3.1', 1000), offer('xDSL', 55)], null);

      expect(result.technologies.ftthb.maxDownMbit).toBe(300);
      expect(result.technologies.hfc.maxDownMbit).toBe(1000);
      expect(result.technologies.fttc.maxDownMbit).toBe(55);
      expect(result.fiber).toBe(true);
    });

    it('keeps the fastest of two offers on the same technology', () => {
      const result = normalizeAustrian([offer('FTTH', 300), offer('FTTH', 1000)], null);

      expect(result.technologies.ftthb.maxDownMbit).toBe(1000);
    });

    it('counts a radio link towards the headline without calling it a line', () => {
      // The register files fixed wireless under "Festnetz", and for a farmhouse the hundred
      // megabits arriving by antenna is the answer. It is still not cable, so no chip lights up.
      const result = normalizeAustrian([offer('4G-FWA', 100)], null);

      expect(result.maxDownMbit).toBe(100);
      expect(result.fiber).toBe(false);
      expect(result.technologies.hfc.maxDownMbit).toBeNull();
      expect(result.technologies.fttc.maxDownMbit).toBeNull();
    });

    it('reads a cell the register knows and nobody serves', () => {
      const result = normalizeAustrian([], []);

      expect(result.maxDownMbit).toBeNull();
      expect(result.fiber).toBe(false);
      expect(result.mobile.bestTech).toBeNull();
    });

    it('counts the mobile operators instead of naming them', () => {
      // The register names all three, but the stored bitmask has room only for the four German
      // codes - so what survives is the count, with the denominator alongside it.
      const result = normalizeAustrian(null, [
        { technik: '5G', company_key: 'a1', download: 1000 },
        { technik: '4G', company_key: 'a1', download: 500 },
        { technik: '4G', company_key: 'drei', download: 420 },
      ]);

      expect(result.mobile.neutral['5g']).toBe(true);
      expect(result.mobile.neutral['4g']).toBe(true);
      expect(result.mobile.bestTech).toBe('5g');
      expect(result.mobile.operatorCount).toBe(2);
      expect(result.mobile.operatorTotal).toBe(3);
      expect(result.mobile.operators).toEqual({});
    });

    it('does not count one operator twice for having two technologies', () => {
      const result = normalizeAustrian(null, [
        { technik: '5G', company_key: 'magenta' },
        { technik: '4G', company_key: 'magenta' },
      ]);

      expect(result.mobile.operatorCount).toBe(1);
    });

    it('tells a cell with no coverage apart from a lookup that failed', () => {
      // An empty list is the register saying nobody is there, which is worth storing. Both halves
      // missing is the backend not answering, which is not.
      expect(normalizeAustrian([], null).mobile).toBeNull();
      expect(normalizeAustrian(null, null)).toBeNull();
    });
  });

  describe('spain', () => {
    /** One parcel, written the way the ministry's map packs a whole table into one column. */
    const parcel = (velocidad, ...entries) => ({ Velocidad: velocidad, Cobertura: entries.join('#') });

    it('unpacks the operators packed into one column', () => {
      expect(
        parseSpanishCoverage('A82018474;FTTH;1000;INFRAESTRUCTURA_PROPIA;NO#B87706305;DOCSIS3.1;500;X;SI'),
      ).toEqual([
        { operator: 'A82018474', technology: 'FTTH', downMbit: 1000 },
        { operator: 'B87706305', technology: 'DOCSIS3.1', downMbit: 500 },
      ]);
    });

    it('reads an empty column as nobody rather than as a nameless operator', () => {
      expect(parseSpanishCoverage('')).toEqual([]);
      expect(parseSpanishCoverage(null)).toEqual([]);
    });

    it('reads the mobile column, which packs the same name differently', () => {
      // A bare list of tax numbers, no technology and no speed. Read with the fixed-line parser it
      // comes back as one operator whose "technology" is the second operator - wrong in a way
      // nothing downstream can notice.
      expect(parseSpanishOperators('A80907397;A82009812;A82528548')).toEqual(['A80907397', 'A82009812', 'A82528548']);
      expect(parseSpanishOperators('')).toEqual([]);
      expect(parseSpanishOperators(null)).toEqual([]);
    });

    it('reports the fastest line reaching the block', () => {
      const result = normalizeSpanish({
        wired: [parcel(1000, 'A82018474;FTTH;1000;INFRAESTRUCTURA_PROPIA;NO')],
      });

      expect(result.maxDownMbit).toBe(1000);
      expect(result.fiber).toBe(true);
      expect(result.technologies.ftthb.maxDownMbit).toBe(1000);
      expect(result.source).toBe('es-setid');
    });

    it('has no copper to report, because the map has none', () => {
      // Spain is switching its copper off and the ministry stopped mapping it, so an empty `fttc`
      // is the data rather than a gap in the parsing.
      const result = normalizeSpanish({ wired: [parcel(500, 'A1;DOCSIS3.1;500;X;NO')] });

      expect(result.technologies.hfc.maxDownMbit).toBe(500);
      expect(result.technologies.fttc.maxDownMbit).toBeNull();
      expect(result.fiber).toBe(false);
    });

    it('folds the parcels a doorstep sits between into one answer', () => {
      const result = normalizeSpanish({
        wired: [parcel(300, 'A1;FTTH;300;X;NO'), parcel(1000, 'A2;FTTH;1000;X;NO')],
      });

      expect(result.maxDownMbit).toBe(1000);
    });

    it('takes the headline of the ministry when it beats the entries', () => {
      // `Velocidad` is already reconciled across the parcel's operators, and an entry whose own
      // speed column is blank must not drag the headline down with it.
      const result = normalizeSpanish({ wired: [parcel(1000, 'A1;FTTH;;X;NO')] });

      expect(result.maxDownMbit).toBe(1000);
      expect(result.fiber).toBe(true);
    });

    it('lets fixed wireless raise the headline without claiming a line', () => {
      const result = normalizeSpanish({ wired: [], fwa: [parcel(100, 'A1;FWA;100;X;NO')] });

      expect(result.maxDownMbit).toBe(100);
      expect(result.fiber).toBe(false);
      expect(result.technologies.hfc.maxDownMbit).toBeNull();
    });

    it('reads the three fields the fixed-wireless map writes instead of five', () => {
      // That map puts the operator's name where the wired one puts a technology, and over much of
      // rural Spain it records the operator and leaves the speed at zero. A zero there is "no
      // figure", not "no megabits", so nothing may be claimed off the back of it.
      const result = normalizeSpanish({
        wired: [],
        fwa: [
          {
            Velocidad: 0,
            Cobertura: 'A82009812;ORANGE ESPAGNE, S.A.U.;0#A78923125;TELEFÓNICA MÓVILES ESPAÑA, S.A.U.;0',
          },
        ],
      });

      expect(result.maxDownMbit).toBeNull();
      expect(result.fiber).toBe(false);
      // The operator name must not have been mistaken for a technology on the way through.
      expect(result.technologies.ftthb.maxDownMbit).toBeNull();
      expect(result.technologies.hfc.maxDownMbit).toBeNull();
      expect(result.technologies.fttc.maxDownMbit).toBeNull();
    });

    it('takes the speed the fixed-wireless map does carry', () => {
      const result = normalizeSpanish({ wired: [], fwa: [{ Velocidad: 0, Cobertura: 'A1;SOME OPERATOR, S.A.;300' }] });

      expect(result.maxDownMbit).toBe(300);
    });

    it('counts the mobile operators out of the four Spain has', () => {
      const result = normalizeSpanish({
        mobile4g: [{ COBERTURA: 'A80907397;A82009812;A82528548;A78923125' }],
        mobile5g: [{ COBERTURA: 'A82009812;A80907397' }],
      });

      expect(result.mobile.neutral['4g']).toBe(true);
      expect(result.mobile.neutral['5g']).toBe(true);
      expect(result.mobile.bestTech).toBe('5g');
      // Every operator on either map: an operator with 4G here and no 5G still has coverage here.
      expect(result.mobile.operatorCount).toBe(4);
      expect(result.mobile.operatorTotal).toBe(4);
    });

    it('counts an operator that is only on the 5G map as well', () => {
      // The larger of the two sets said two here, while three operators cover the place.
      const result = normalizeSpanish({
        mobile4g: [{ COBERTURA: 'A80907397;A82009812' }],
        mobile5g: [{ COBERTURA: 'A82528548' }],
      });

      expect(result.mobile.operatorCount).toBe(3);
    });

    it('reads a square only the older network reaches', () => {
      const result = normalizeSpanish({ mobile4g: [{ COBERTURA: 'A1' }], mobile5g: [] });

      expect(result.mobile.neutral['5g']).toBe(false);
      expect(result.mobile.bestTech).toBe('4g');
      expect(result.mobile.operatorCount).toBe(1);
    });

    it('tells a place with no coverage apart from a lookup that failed', () => {
      expect(normalizeSpanish({ wired: [], fwa: [], mobile4g: [], mobile5g: [] }).maxDownMbit).toBeNull();
      expect(normalizeSpanish({})).toBeNull();
      expect(normalizeSpanish()).toBeNull();
    });
  });
});
