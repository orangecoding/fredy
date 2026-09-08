/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';

import {
  PRICE_SUSPICION_PCT,
  SCAM_OVERRIDES,
  SCAM_SCORE_THRESHOLD,
  SCAM_SIGNALS,
  SIGNAL_PHRASES,
  SIGNAL_WEIGHTS,
  detectScamSignals,
  normalizeText,
  scamScore,
  scamVerdict,
} from '../../../lib/services/listings/scamSignals.js';

/**
 * A listing carrying a description and, optionally, the price comparison feature one stored.
 *
 * @param {string} description
 * @param {Object} [extra]
 * @returns {Object}
 */
const listing = (description, extra = {}) => ({
  title: 'Schöne 2-Zimmer-Wohnung',
  description,
  ...extra,
});

/** A listing priced the given percentage away from its local median. */
const pricedAt = (percent, description = 'Schöne Wohnung in guter Lage.') =>
  listing(description, { market_median_sqm: 15, price_per_sqm: 15 * (1 + percent / 100) });

describe('text normalisation', () => {
  it('spells out the umlauts the phrase lists are written with', () => {
    expect(normalizeText('Schlüssel')).toBe('schluessel');
    expect(normalizeText('MÖGLICH')).toBe('moeglich');
    expect(normalizeText('Straße')).toBe('strasse');
    expect(normalizeText('Gründen')).toBe('gruenden');
  });

  it('collapses whitespace so a line break cannot hide a phrase', () => {
    expect(normalizeText('ohne\n  Besichtigung')).toBe('ohne besichtigung');
  });

  it('has nothing to say about what is not text', () => {
    expect(normalizeText(null)).toBe('');
    expect(normalizeText(undefined)).toBe('');
    expect(normalizeText(42)).toBe('');
  });
});

describe('phrase lists', () => {
  it('are already normalised, or they could never match', () => {
    // A phrase written with an umlaut would be compared against a haystack that has none, and would
    // silently never fire. Nothing about that failure is visible at runtime.
    for (const [signal, phrases] of Object.entries(SIGNAL_PHRASES)) {
      for (const phrase of phrases) {
        expect({ signal, phrase, normalised: normalizeText(phrase) }).toEqual({
          signal,
          phrase,
          normalised: phrase,
        });
      }
    }
  });

  it('cover every signal that is not the price one', () => {
    const textSignals = SCAM_SIGNALS.filter((signal) => signal !== 'priceFarBelowMarket');
    expect(Object.keys(SIGNAL_PHRASES).sort()).toEqual(textSignals.sort());
  });
});

describe('detecting signals', () => {
  it('finds money asked for before a viewing', () => {
    expect(detectScamSignals(listing('Die Kaution ist per Vorkasse zu leisten.'))).toEqual(['advancePayment']);
    expect(detectScamSignals(listing('A reservation fee is required to hold the flat.'))).toEqual(['advancePayment']);
  });

  it('finds keys promised by post whichever way the umlaut is spelled', () => {
    expect(detectScamSignals(listing('Den Schlüssel per Post senden wir Ihnen zu.'))).toEqual(['keysByPost']);
    expect(detectScamSignals(listing('Den Schluessel per Post senden wir Ihnen zu.'))).toEqual(['keysByPost']);
  });

  it('finds payment routes that cannot be reversed', () => {
    expect(detectScamSignals(listing('Zahlung bitte via Western Union.'))).toEqual(['moneyTransferService']);
    expect(detectScamSignals(listing('Payment in Bitcoin only.'))).toEqual(['moneyTransferService']);
  });

  it('finds the landlord who cannot be there', () => {
    expect(detectScamSignals(listing('Ich befinde mich im Ausland und kann nicht kommen.'))).toEqual([
      'landlordAbroad',
    ]);
    expect(detectScamSignals(listing('I am currently abroad for work.'))).toEqual(['landlordAbroad']);
  });

  it('finds a viewing being refused', () => {
    expect(detectScamSignals(listing('Die Vermietung erfolgt ohne Besichtigung.'))).toEqual(['noViewing']);
    expect(detectScamSignals(listing('Eine Besichtigung ist leider nicht möglich.'))).toEqual(['noViewing']);
  });

  it('reads the title as well as the description', () => {
    expect(detectScamSignals({ title: 'Wohnung ohne Besichtigung zu vergeben', description: null })).toEqual([
      'noViewing',
    ]);
  });

  it('reports several signals in a stable order', () => {
    const found = detectScamSignals(pricedAt(-60, 'Ich bin im Ausland, Zahlung per Western Union, ohne Besichtigung.'));
    expect(found).toEqual(['moneyTransferService', 'landlordAbroad', 'noViewing', 'priceFarBelowMarket']);
  });

  it('has nothing to say about an ordinary listing', () => {
    expect(
      detectScamSignals(
        listing(
          'Helle 2-Zimmer-Wohnung mit Balkon. Die Kaution beträgt drei Kaltmieten. ' +
            'Besichtigung nach Terminvereinbarung. Bitte melden Sie sich per E-Mail.',
        ),
      ),
    ).toEqual([]);
    expect(detectScamSignals({})).toEqual([]);
    expect(detectScamSignals(null)).toEqual([]);
  });

  it('does not read an ordinary deposit or an ordinary appointment as a scam', () => {
    // Both sentences appear in a large share of honest German ads. Matching either would put a
    // fraud warning on half the database.
    expect(detectScamSignals(listing('Die Kaution beträgt zwei Nettokaltmieten.'))).toEqual([]);
    expect(detectScamSignals(listing('Besichtigung erst nach Terminvereinbarung möglich.'))).toEqual([]);
  });
});

describe('the price signal', () => {
  it('fires only well under the local median', () => {
    expect(detectScamSignals(pricedAt(PRICE_SUSPICION_PCT - 1))).toEqual(['priceFarBelowMarket']);
    expect(detectScamSignals(pricedAt(PRICE_SUSPICION_PCT))).toEqual(['priceFarBelowMarket']);
    expect(detectScamSignals(pricedAt(PRICE_SUSPICION_PCT + 5))).toEqual([]);
    expect(detectScamSignals(pricedAt(-20))).toEqual([]);
  });

  it('says nothing without a benchmark to compare against', () => {
    // A listing Fredy could not place, or one in an area too thin to have a median, has nothing to
    // be suspiciously cheap against.
    expect(detectScamSignals(listing('Schön.', { price_per_sqm: 3, market_median_sqm: null }))).toEqual([]);
    expect(detectScamSignals(listing('Schön.', { price_per_sqm: null, market_median_sqm: 15 }))).toEqual([]);
  });

  it('never accuses a bargain on its own', () => {
    // The whole point of Fredy is finding flats under the market. If a low price alone crossed the
    // threshold, the best find in the list would carry a fraud warning.
    const bargain = detectScamSignals(pricedAt(-70));
    expect(bargain).toEqual(['priceFarBelowMarket']);
    expect(scamVerdict(bargain).suspicious).toBe(false);
  });
});

describe('scoring', () => {
  it('adds up the weights', () => {
    expect(scamScore(['advancePayment'])).toBe(3);
    expect(scamScore(['landlordAbroad', 'noViewing'])).toBe(4);
    expect(scamScore([])).toBe(0);
    expect(scamScore(null)).toBe(0);
    expect(scamScore(['somethingElse'])).toBe(0);
  });

  it('lets any single phrase with no innocent reading warn on its own', () => {
    for (const signal of ['advancePayment', 'keysByPost', 'moneyTransferService']) {
      expect(SIGNAL_WEIGHTS[signal]).toBeGreaterThanOrEqual(SCAM_SCORE_THRESHOLD);
      expect(scamVerdict([signal]).suspicious).toBe(true);
    }
  });

  it('needs two of the weaker signals to agree', () => {
    for (const signal of ['landlordAbroad', 'noViewing', 'priceFarBelowMarket']) {
      expect(SIGNAL_WEIGHTS[signal]).toBeLessThan(SCAM_SCORE_THRESHOLD);
      expect(scamVerdict([signal]).suspicious).toBe(false);
    }
    expect(scamVerdict(['landlordAbroad', 'priceFarBelowMarket']).suspicious).toBe(true);
  });
});

describe('the user overruling the detector', () => {
  it('warns about a listing nothing fired on when the user says so', () => {
    expect(scamVerdict([], SCAM_OVERRIDES.SCAM)).toEqual({
      suspicious: true,
      score: 0,
      signals: [],
      source: 'user',
    });
  });

  it('stops warning about a listing everything fired on when the user says so', () => {
    const signals = ['advancePayment', 'keysByPost'];
    expect(scamVerdict(signals, SCAM_OVERRIDES.SAFE)).toEqual({
      suspicious: false,
      score: 6,
      signals,
      source: 'user',
    });
  });

  it('keeps the signals visible either way, so a dismissal can be reconsidered', () => {
    expect(scamVerdict(['advancePayment'], SCAM_OVERRIDES.SAFE).signals).toEqual(['advancePayment']);
  });

  it('hands the listing back to the detector once the override is cleared', () => {
    expect(scamVerdict(['advancePayment'], null).source).toBe('signals');
    expect(scamVerdict(['advancePayment'], null).suspicious).toBe(true);
  });
});
