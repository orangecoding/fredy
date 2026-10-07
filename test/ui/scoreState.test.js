/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';

import { isScoredListing, isRiskAssessed, riskPoints } from '../../ui/src/services/scores/scoreState.js';

/**
 * Score-display state: grey dash means "never computed", color means a genuine verdict.
 * The score columns default to 0, so one column alone cannot tell those apart - the
 * row-level rule has to.
 */
describe('ui scoreState', () => {
  describe('isScoredListing', () => {
    it('treats default zeros without GREIX data as unscored', () => {
      expect(isScoredListing({ price: 195000, investor_score: 0, owner_score: 0, greix_cagr: null })).toBe(false);
      expect(isScoredListing({ price: 195000, investor_score: null, owner_score: null })).toBe(false);
      expect(isScoredListing(null)).toBe(false);
      expect(isScoredListing(undefined)).toBe(false);
    });

    it('treats a genuine zero verdict (GREIX data present) as scored', () => {
      expect(isScoredListing({ price: 195000, investor_score: 0, owner_score: 0, greix_cagr: 0.0498 })).toBe(true);
    });

    it('treats nonzero legs as scored', () => {
      expect(isScoredListing({ price: 195000, investor_score: 13.4, owner_score: 0, greix_cagr: null })).toBe(true);
      expect(isScoredListing({ price: 195000, investor_score: 0, owner_score: 34.4, greix_cagr: 0.0498 })).toBe(true);
    });

    it('never scores a listing without a price', () => {
      expect(isScoredListing({ price: 0, investor_score: 13.4, owner_score: 34.4, greix_cagr: 0.0498 })).toBe(false);
      expect(isScoredListing({ price: null, investor_score: 13.4, owner_score: 34.4 })).toBe(false);
    });
  });

  describe('riskPoints', () => {
    it('maps raw risk (low is safe) to points (high is good)', () => {
      expect(riskPoints(0)).toBe(0);
      expect(riskPoints(null)).toBe(0);
      expect(riskPoints(3)).toBe(15);
      expect(riskPoints(7)).toBe(10);
      expect(riskPoints(15)).toBe(5);
      expect(riskPoints(25)).toBe(0);
    });
  });

  describe('isRiskAssessed', () => {
    it('treats the unassessed default as unassessed', () => {
      expect(isRiskAssessed({ asset_risk_score: 0 })).toBe(false);
      expect(isRiskAssessed({ asset_risk_score: null })).toBe(false);
      expect(isRiskAssessed({})).toBe(false);
      expect(isRiskAssessed(null)).toBe(false);
    });

    it('treats any measured value as assessed', () => {
      expect(isRiskAssessed({ asset_risk_score: 3 })).toBe(true);
      expect(isRiskAssessed({ asset_risk_score: 25 })).toBe(true);
    });
  });
});
