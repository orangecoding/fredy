/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';

import {
  SCAM_OVERRIDES as backendOverrides,
  SCAM_SCORE_THRESHOLD as backendThreshold,
  SCAM_SIGNALS as backendSignals,
  SIGNAL_WEIGHTS as backendWeights,
  scamVerdict as backendVerdict,
} from '../../lib/services/listings/scamSignals.js';
import {
  SCAM_OVERRIDES as frontendOverrides,
  SCAM_SCORE_THRESHOLD as frontendThreshold,
  SCAM_SIGNALS as frontendSignals,
  SIGNAL_WEIGHTS as frontendWeights,
  scamVerdict as frontendVerdict,
} from '../../ui/src/services/listings/scamSignals.js';

/**
 * The frontend may not import out of lib/ - a lint rule enforces it, because server code is free to
 * grow a Node built-in and break the Vite build far from the cause. So the weighing is written
 * twice, and this is what stops the copies drifting.
 *
 * Drift here would be visible and wrong in the same breath: the server stores the signals, and the
 * browser decides from them whether to paint the warning. A threshold that moved on one side only
 * means a listing the API considers suspicious shows no chip, or the reverse.
 *
 * The phrase lists are deliberately *not* duplicated. Nothing in the browser reads a description, so
 * there is no second copy of them to drift.
 */
const CASES = [
  [[], null],
  [['advancePayment'], null],
  [['keysByPost'], null],
  [['moneyTransferService'], null],
  [['landlordAbroad'], null],
  [['noViewing'], null],
  [['priceFarBelowMarket'], null],
  [['landlordAbroad', 'noViewing'], null],
  [['landlordAbroad', 'priceFarBelowMarket'], null],
  [['advancePayment', 'keysByPost', 'priceFarBelowMarket'], null],
  [[], 'scam'],
  [[], 'safe'],
  [['advancePayment'], 'safe'],
  [['priceFarBelowMarket'], 'scam'],
  // Shapes a stored column can actually arrive in.
  [null, null],
  [undefined, null],
  [['somethingNobodyDefined'], null],
];

describe('the scam verdict stays in sync between the frontend copy and lib/', () => {
  it('agrees on the signals, their weights and the threshold', () => {
    expect(frontendSignals).toEqual(backendSignals);
    expect(frontendWeights).toEqual(backendWeights);
    expect(frontendThreshold).toBe(backendThreshold);
    expect(frontendOverrides).toEqual(backendOverrides);
  });

  it.each(CASES)('agrees on %s with override %s', (signals, override) => {
    expect(frontendVerdict(signals, override)).toEqual(backendVerdict(signals, override));
  });

  it('actually decides rather than answering the same thing throughout', () => {
    // A copy that called everything suspicious would pass every equality check above only if the
    // original did too. This is what makes the agreement meaningful.
    expect(frontendVerdict(['advancePayment']).suspicious).toBe(true);
    expect(frontendVerdict(['priceFarBelowMarket']).suspicious).toBe(false);
    expect(frontendVerdict([], 'scam').suspicious).toBe(true);
    expect(frontendVerdict(['advancePayment'], 'safe').suspicious).toBe(false);
  });
});
