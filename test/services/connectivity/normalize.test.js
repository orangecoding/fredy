/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';

import {
  normalizeGerman,
  normalizeSwiss,
  AVAILABILITY_THRESHOLD_PERCENT,
} from '../../../lib/services/connectivity/normalize.js';

/**
 * Turning two national registers into one answer.
 *
 * Both of them describe an area rather than a building, in units of their own - Germany a
 * percentage of households per 100m cell, Switzerland a class number per 250m square - so this is
 * where most of the ways to be subtly wrong live. The fixtures are trimmed copies of real answers
 * from both services.
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
});
