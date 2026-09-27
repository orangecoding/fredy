/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

import {
  affordabilityFilterHelp,
  listedPriceKey,
  rentCeilingFacts,
  rentIncludesCharges,
  verdictExplanation,
} from '../../ui/src/services/finance/rentBasis.js';

const localeDir = path.resolve('ui/src/locales');
const readLocale = (file) => JSON.parse(fs.readFileSync(path.join(localeDir, file), 'utf8'));
const localeFiles = fs.readdirSync(localeDir).filter((file) => file.endsWith('.json'));
const english = readLocale('en.json');

/** Hands the key back with its parameters, so the assertions are about keys and figures, not wording. */
const t = (key, params) =>
  params == null ? key : `${key}(${Object.entries(params).map(([name, value]) => `${name}=${value}`)})`;
const formatEuro = (value) => (value == null ? '–' : `${value} EUR`);
const ctx = { t, locale: 'de-DE', formatEuro };

/** 1120 cold is the affordable rent ceiling, 1400 the same ceiling warm; 1280 and 1600 the stretch pair. */
const THRESHOLDS = {
  buy: { affordableMaxPrice: 412000, stretchMaxPrice: 460000, purchasePriceThreshold: 30000 },
  rent: { affordableMaxRent: 1120, stretchMaxRent: 1280, warmAffordable: 1400, warmStretch: 1600, nebenkostenPct: 25 },
};

describe('rentIncludesCharges', () => {
  it('reads the flag the listings API hands over with every row', () => {
    expect(rentIncludesCharges({ charges_included: 1 })).toBe(true);
    expect(rentIncludesCharges({ charges_included: 0 })).toBe(false);
  });

  it('reads a rent nobody described as quoted without the charges, as the server does', () => {
    expect(rentIncludesCharges({ charges_included: null })).toBe(false);
    expect(rentIncludesCharges({})).toBe(false);
    expect(rentIncludesCharges(null)).toBe(false);
  });
});

describe('verdictExplanation', () => {
  it('quotes the cold ceiling for a rent quoted without the charges', () => {
    expect(verdictExplanation('affordable', { dealType: 'rent', chargesIncluded: false }, THRESHOLDS)).toEqual({
      key: 'listings.rentAffordabilityTooltip.affordable',
      limit: 1120,
    });
  });

  // The server held this rent against the warm ceiling. Quoting the cold one beside a verdict it did
  // not come from would make an affordable 1.300 EUR rent look like it sits above a 1.120 EUR limit.
  it('quotes the warm ceiling for a rent quoted with the charges', () => {
    expect(verdictExplanation('stretch', { dealType: 'rent', chargesIncluded: true }, THRESHOLDS)).toEqual({
      key: 'listings.rentInclChargesAffordabilityTooltip.stretch',
      limit: 1400,
    });
  });

  it('quotes the purchase ceiling for a purchase, whatever the flag says', () => {
    expect(verdictExplanation('affordable', { dealType: 'buy', chargesIncluded: true }, THRESHOLDS)).toEqual({
      key: 'listings.affordabilityTooltip.affordable',
      limit: 412000,
    });
  });

  it('has no limit to quote while that half of the profile is missing', () => {
    expect(
      verdictExplanation('affordable', { dealType: 'rent', chargesIncluded: true }, { buy: null, rent: null }).limit,
    ).toBeNull();
  });

  // Built at runtime, so the locale suite cannot find these keys by reading the source.
  it('has an english sentence for every verdict on every basis', () => {
    for (const verdict of ['affordable', 'stretch', 'unaffordable']) {
      for (const basis of [{ dealType: 'buy' }, { dealType: 'rent' }, { dealType: 'rent', chargesIncluded: true }]) {
        const { key } = verdictExplanation(verdict, basis, THRESHOLDS);
        expect(english, `${verdict} on ${JSON.stringify(basis)}`).toHaveProperty([key]);
      }
    }
  });
});

describe('affordabilityFilterHelp', () => {
  it('names the warm ceiling beside the cold one, since the filter holds rents of both kinds', () => {
    expect(affordabilityFilterHelp({ buy: null, rent: THRESHOLDS.rent }, ctx)).toBe(
      'listings.filterAffordabilityRentHelp(price=1120 EUR,warm=1400 EUR)',
    );
  });

  it('names both rent ceilings and the purchase one when both halves are set up', () => {
    expect(affordabilityFilterHelp(THRESHOLDS, ctx)).toBe(
      'listings.filterAffordabilityBothHelp(price=412000 EUR,rent=1120 EUR,warm=1400 EUR)',
    );
  });

  it('names only the purchase ceiling for a profile that only buys', () => {
    expect(affordabilityFilterHelp({ buy: THRESHOLDS.buy, rent: null }, ctx)).toBe(
      'listings.filterAffordabilityHelp(price=412000 EUR)',
    );
  });
});

describe('rentCeilingFacts', () => {
  it('lists both pairs of ceilings, cold for most listings and warm for a rent with the charges in it', () => {
    const facts = rentCeilingFacts(THRESHOLDS.rent, { disposable: 2600 }, ctx);

    expect(facts.map((fact) => [fact.key, fact.value])).toEqual([
      ['maxCold', '1120 EUR'],
      ['maxWarm', '1400 EUR'],
      ['stretchCold', '1280 EUR'],
      ['stretchWarm', '1600 EUR'],
      ['disposable', '2600 EUR'],
    ]);
    expect(facts.filter((fact) => fact.emphasis).map((fact) => fact.key)).toEqual(['maxCold', 'maxWarm']);
  });

  it('shows nothing until both the ceilings and the budget are there', () => {
    expect(rentCeilingFacts(null, { disposable: 2600 }, ctx)).toEqual([]);
    expect(rentCeilingFacts(THRESHOLDS.rent, null, ctx)).toEqual([]);
  });

  it('has an english label and explanation for every ceiling it lists', () => {
    for (const { key } of rentCeilingFacts(THRESHOLDS.rent, { disposable: 2600 }, ctx)) {
      expect(english).toHaveProperty([`finance.rent.${key}`]);
      expect(english).toHaveProperty([`finance.rent.${key}Help`]);
    }
  });
});

describe('listedPriceKey', () => {
  it('says which kind of figure the listed price of a scored listing is', () => {
    expect(listedPriceKey({ dealType: 'rent', chargesIncluded: false })).toBe('finance.table.priceIsColdRent');
    expect(listedPriceKey({ dealType: 'rent', chargesIncluded: true })).toBe('finance.table.priceIsWarmRent');
    expect(listedPriceKey({ dealType: 'buy' })).toBe('finance.table.priceIsPurchase');
  });

  it('has every one of them in english', () => {
    for (const record of [{ dealType: 'rent' }, { dealType: 'rent', chargesIncluded: true }, { dealType: 'buy' }]) {
      expect(english).toHaveProperty([listedPriceKey(record)]);
    }
  });
});

/**
 * A slot a translation forgot is printed as `{{warm}}` in the middle of the sentence, so every
 * language has to leave room for each figure these texts fill in.
 */
describe('the texts that quote a ceiling', () => {
  const SLOTS = {
    'listings.filterAffordabilityRentHelp': ['price', 'warm'],
    'listings.filterAffordabilityBothHelp': ['price', 'rent', 'warm'],
    'listings.rentInclChargesAffordabilityTooltip.affordable': ['price'],
    'listings.rentInclChargesAffordabilityTooltip.stretch': ['price'],
    'listings.rentInclChargesAffordabilityTooltip.unaffordable': ['price'],
  };
  const slotsOf = (text) => [...String(text).matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort();

  it.each(localeFiles)('%s leaves a slot for every figure', (file) => {
    const locale = readLocale(file);
    for (const [key, slots] of Object.entries(SLOTS)) {
      expect(slotsOf(locale[key]), `${file}: ${key}`).toEqual([...slots].sort());
    }
  });
});
