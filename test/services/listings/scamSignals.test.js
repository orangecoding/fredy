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

  it('strips the accents Italian, Spanish and Portuguese are written with', () => {
    expect(normalizeText('è')).toBe('e');
    expect(normalizeText('señal')).toBe('senal');
    expect(normalizeText('caução')).toBe('caucao');
    expect(normalizeText('possível')).toBe('possivel');
  });

  it('spells out an umlaut that arrived decomposed, rather than flattening it', () => {
    // The same word in the two forms Unicode allows, the second built from a bare 'u' plus a
    // combining diaeresis so no editor can quietly normalise the distinction away. Without the NFC
    // pass that one slips past the umlaut replacements and comes out as 'schlussel', which matches
    // nothing in the lists and fails silently.
    expect(normalizeText('Schl\u00fcssel')).toBe('schluessel');
    expect(normalizeText('Schlu\u0308ssel')).toBe('schluessel');
  });

  it('breaks an elision into the two words it stands for', () => {
    // Italian writes "all'estero", never "al estero", so a list without this would have to carry a
    // separate entry for every contraction a landlord might reach for.
    expect(normalizeText("Mi trovo all'estero")).toBe('mi trovo all estero');
    expect(normalizeText('Mi trovo all’estero')).toBe('mi trovo all estero');
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

  it('reads the same fraud in Italian, Spanish and Portuguese', () => {
    // The portals behind these are casa, subito, tecnocasa, tecnorete and the three idealista
    // sites. The same four stories, told in the language the advert is written in.
    expect(detectScamSignals(listing("Mi trovo all'estero. Caparra prima della visita, chiavi per posta."))).toEqual([
      'advancePayment',
      'keysByPost',
      'landlordAbroad',
    ]);
    expect(
      detectScamSignals(listing('Estoy en el extranjero. Fianza antes de la visita y llaves por correo.')),
    ).toEqual(['advancePayment', 'keysByPost', 'landlordAbroad']);
    expect(detectScamSignals(listing('Estou no estrangeiro. Sinal antes da visita, chaves pelo correio.'))).toEqual([
      'advancePayment',
      'keysByPost',
      'landlordAbroad',
    ]);
  });

  it('reads an accent and an elision the way the portal wrote them', () => {
    // Accents get typed, dropped and mangled in turn, and Italian elides by default. A list written
    // without either has to match all of those spellings, or it matches the tidy half of the web.
    expect(detectScamSignals(listing('La visita non è possibile.'))).toEqual(['noViewing']);
    expect(detectScamSignals(listing('La visita non e possibile.'))).toEqual(['noViewing']);
    expect(detectScamSignals(listing("Mi trovo all'estero."))).toEqual(['landlordAbroad']);
    expect(detectScamSignals(listing('Mi trovo all estero.'))).toEqual(['landlordAbroad']);
    expect(detectScamSignals(listing('Se requiere señal antes de la visita.'))).toEqual(['advancePayment']);
    expect(detectScamSignals(listing('Exige-se caução antes da visita.'))).toEqual(['advancePayment']);
  });

  it('leaves the standard clause about paying rent in advance alone', () => {
    // The trap this list fell into once. Rent is payable before the month it covers in every one of
    // these countries - German law writes it down in section 556b BGB - so an advert quoting the
    // clause is quoting the law, not confessing. Only money wanted before a viewing is a signal,
    // and the difference matters because this signal is heavy enough to warn on its own.
    expect(detectScamSignals(listing('Die Miete ist monatlich im Voraus zu zahlen.'))).toEqual([]);
    expect(detectScamSignals(listing('Rent is payable monthly in advance.'))).toEqual([]);
    expect(detectScamSignals(listing('Monthly payment in advance, as per the tenancy agreement.'))).toEqual([]);
    expect(detectScamSignals(listing('Pagamento anticipato del canone mensile.'))).toEqual([]);
    expect(detectScamSignals(listing('El alquiler se paga por adelantado cada mes.'))).toEqual([]);
    expect(detectScamSignals(listing('Pagamento antecipado da renda mensal.'))).toEqual([]);

    // The same money, asked for at the one moment no tenancy asks for it.
    expect(detectScamSignals(listing('Pagamento prima della visita.'))).toEqual(['advancePayment']);
    expect(detectScamSignals(listing('Se requiere pago antes de la visita.'))).toEqual(['advancePayment']);
    expect(detectScamSignals(listing('Pagamento antes da visita.'))).toEqual(['advancePayment']);
  });

  it('does not read a walk-in welcome as a viewing being refused', () => {
    // "sin visita previa" and "sem visita previa" say you need no appointment, which is the
    // opposite of the signal and common in honest Spanish and Portuguese adverts.
    expect(detectScamSignals(listing('Se puede ver sin visita previa concertada.'))).toEqual([]);
    expect(detectScamSignals(listing('Visitas sem visita previa marcada.'))).toEqual([]);
    expect(detectScamSignals(listing('Spese di agenzia a carico del conduttore.'))).toEqual([]);
    expect(detectScamSignals(listing('Gastos de agencia no incluidos. Fianza de dos meses.'))).toEqual([]);
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
