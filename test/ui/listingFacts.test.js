/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';

import { buildObjectFacts, buildOriginFacts, providerName } from '../../ui/src/views/listings/listingFacts.js';
import { formatPricePerSqm } from '../../ui/src/services/listings/marketBenchmark.js';

/**
 * A translator that hands the key back, plus whatever parameters it was given.
 *
 * The assertions here are about *which* key a fact reaches for and which parameters it fills in,
 * not about the German behind it - that is the locale suite's job - so echoing the key is both
 * enough and the only thing that cannot drift when a sentence is reworded.
 *
 * @param {string} key
 * @param {Object} [params]
 * @returns {string}
 */
const t = (key, params) =>
  params == null ? key : `${key}(${Object.entries(params).map(([name, value]) => `${name}=${value}`)})`;

const ctx = { t, locale: 'de-DE' };

/** A listing with every field a portal can fill in. */
const full = {
  id: 'abc',
  price: 1200,
  size: 80,
  rooms: 3,
  price_per_sqm: 15,
  dealType: 'rent',
  provider: 'immoscout',
  link: 'https://example.test/ad/1',
  job_name: 'Berlin Mitte',
  created_at: 1700000000000,
  published_at: 1699990000000,
  build_year: 1978,
  energy_class: 'C',
};

describe('buildObjectFacts', () => {
  it('lifts the price out of the list and says what kind of price it is', () => {
    const rent = buildObjectFacts(full, ctx);
    expect(rent.price.text).toContain('1.200');
    expect(rent.price.reference).toBe('listing.detail.rentPerMonth');

    const buy = buildObjectFacts({ ...full, dealType: 'buy' }, ctx);
    expect(buy.price.reference).toBe('listing.detail.purchasePrice');
  });

  it('hands back the digits and the currency symbol separately', () => {
    // So the page can set 40px digits next to a reading-size euro sign. Taken from the locale's own
    // formatter, because where the symbol goes is the locale's business, not ours.
    const { price } = buildObjectFacts(full, ctx);
    expect(price.amount).toContain('1.200');
    expect(price.amount).not.toContain('\u20ac');
    expect(price.currency).toBe('\u20ac');

    const english = buildObjectFacts(full, { ...ctx, locale: 'en-US' });
    expect(english.currency ?? english.price.currency).toBeTruthy();
  });

  it('says nothing about a price it does not have rather than naming one', () => {
    const facts = buildObjectFacts({ ...full, price: null }, ctx);
    expect(facts.price.text).toBe('common.na');
    // The split falls back to the same words, so the page never prints an empty figure.
    expect(facts.price.amount).toBe('common.na');
    expect(facts.price.currency).toBeNull();
    // No reference either: "base rent per month" next to "N/A" claims the listing is a rental
    // whose rent is unknown, which is a claim this row cannot make.
    expect(facts.price.reference).toBeNull();
  });

  it('always returns the same three tiles, so the row never changes width', () => {
    expect(buildObjectFacts(full, ctx).tiles.map((tile) => tile.id)).toEqual(['size', 'rooms', 'pricePerSqm']);
    expect(buildObjectFacts({}, ctx).tiles.map((tile) => tile.id)).toEqual(['size', 'rooms', 'pricePerSqm']);
  });

  it('leaves a tile it has no figure for empty instead of inventing one', () => {
    const tiles = buildObjectFacts({ ...full, size: null, rooms: null }, ctx).tiles;
    expect(tiles.find((tile) => tile.id === 'size').value).toBeNull();
    expect(tiles.find((tile) => tile.id === 'rooms').value).toBeNull();
  });

  it('shows the square metre price only for a listing the server could compute one for', () => {
    const priced = buildObjectFacts(full, ctx).tiles.find((tile) => tile.id === 'pricePerSqm');
    expect(priced.value).not.toBeNull();

    // No size at the portal means no quotient on the row, and the tile says nothing rather than
    // dividing the price by a size it invented.
    const unpriced = buildObjectFacts({ ...full, size: null, price_per_sqm: null }, ctx).tiles.find(
      (tile) => tile.id === 'pricePerSqm',
    );
    expect(unpriced.value).toBeNull();
  });

  it('leaves the unit to the tile label instead of repeating it in the figure', () => {
    // "4.194 EUR/m2" under a label reading "price per m2" says it twice, and the four extra
    // characters are what pushed the number out of a third of the rail and into an ellipsis.
    const tile = buildObjectFacts(full, ctx).tiles.find((entry) => entry.id === 'pricePerSqm');

    expect(tile.value).not.toContain('/m\u00b2');
    expect(tile.value).toContain('15');
  });

  it('explains the comparison when there is one, and its absence when there is not', () => {
    const describeBenchmark = () => 'the comparison sentence';
    const benchmarked = { ...full, market_median_sqm: 10, market_sample_size: 42, market_radius_km: 2 };

    const withBenchmark = buildObjectFacts(benchmarked, { ...ctx, describeBenchmark });
    expect(withBenchmark.benchmark.verdict).not.toBeNull();
    expect(withBenchmark.tiles.find((entry) => entry.id === 'pricePerSqm').helpText).toBe('the comparison sentence');

    // A quotient with no neighbours to compare it against keeps the explanation of why no
    // comparison is shown, which is the question the page would otherwise leave unanswered.
    const plain = buildObjectFacts(full, { ...ctx, describeBenchmark });
    expect(plain.benchmark.verdict).toBeNull();
    expect(plain.tiles.find((entry) => entry.id === 'pricePerSqm').helpText).toBe(
      'listing.detail.fieldPricePerSqmHelp',
    );
  });

  it('has no opinion on affordability until the server has one', () => {
    expect(buildObjectFacts(full, ctx).affordability).toBeNull();

    const scored = buildObjectFacts(
      { ...full, affordabilityVerdict: 'affordable' },
      { ...ctx, financeThresholds: { rent: { affordableMaxRent: 1400 } }, formatEuro: (value) => `${value} EUR` },
    );
    expect(scored.affordability.verdict).toBe('affordable');
    expect(scored.affordability.label).toBe('finance.verdict.affordable');
    expect(scored.affordability.helpText).toContain('listings.rentAffordabilityTooltip.affordable');
    expect(scored.affordability.helpText).toContain('1400 EUR');
  });

  it('reads a purchase against the buy threshold rather than the rent one', () => {
    const scored = buildObjectFacts(
      { ...full, dealType: 'buy', affordabilityVerdict: 'stretch' },
      {
        ...ctx,
        financeThresholds: { rent: { affordableMaxRent: 1 }, buy: { affordableMaxPrice: 400000 } },
        formatEuro: (value) => `${value} EUR`,
      },
    );
    expect(scored.affordability.helpText).toContain('listings.affordabilityTooltip.stretch');
    expect(scored.affordability.helpText).toContain('400000 EUR');
  });

  it('survives a listing that is not there yet', () => {
    const facts = buildObjectFacts(null, ctx);
    expect(facts.price.text).toBe('common.na');
    expect(facts.tiles).toHaveLength(3);
    expect(facts.affordability).toBeNull();
  });
});

describe('buildOriginFacts', () => {
  it('reports every field the portal filled in, in reading order', () => {
    expect(buildOriginFacts(full, ctx).map((fact) => fact.id)).toEqual([
      'provider',
      'job',
      'created',
      'published',
      'buildYear',
      'energyClass',
    ]);
  });

  it('drops a field nobody filled in rather than printing another N/A', () => {
    const sparse = buildOriginFacts({ provider: 'immowelt', created_at: 1700000000000 }, ctx);
    expect(sparse.map((fact) => fact.id)).toEqual(['provider', 'created']);
    expect(sparse.every((fact) => fact.value != null && fact.value !== '')).toBe(true);
  });

  it('never carries the status, which belongs to the listing title block now', () => {
    const facts = buildOriginFacts({ ...full, status: { status: 'applied', setAt: 1700000000000 } }, ctx);
    expect(facts.find((fact) => fact.id === 'status')).toBeUndefined();
  });

  it('links the portal to the ad and marks the search job as a chip', () => {
    const facts = buildOriginFacts(full, ctx);
    const provider = facts.find((fact) => fact.id === 'provider');
    expect(provider.href).toBe('https://example.test/ad/1');
    expect(provider.value).toBe('Immoscout');
    expect(facts.find((fact) => fact.id === 'job').chip).toBe(true);
  });

  it('leaves the portal unlinked when the ad has no url', () => {
    const provider = buildOriginFacts({ ...full, link: null }, ctx).find((fact) => fact.id === 'provider');
    expect(provider.href).toBeUndefined();
  });

  it('survives a listing that is not there yet', () => {
    expect(buildOriginFacts(null, ctx)).toEqual([]);
  });
});

describe('providerName', () => {
  it('writes a portal id the way a person writes it', () => {
    expect(providerName('immoscout')).toBe('Immoscout');
    expect(providerName('')).toBe('');
    expect(providerName(undefined)).toBe('');
  });
});

describe('formatPricePerSqm', () => {
  it('still carries the unit by default, because most places have no label to lean on', () => {
    // The badge in the listings table and the tooltips print this figure on its own, where
    // "4.194 €" without a unit is a price for the whole flat.
    expect(formatPricePerSqm(4194, 'de-DE')).toContain('/m\u00b2');
  });

  it('drops the unit only when asked', () => {
    expect(formatPricePerSqm(4194, 'de-DE', false)).not.toContain('/m\u00b2');
  });
});
