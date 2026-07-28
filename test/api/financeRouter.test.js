/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../lib/services/storage/listingsStorage.js', () => ({
  queryListings: vi.fn(() => ({ totalNumber: 0, page: 1, result: [] })),
  getListingById: vi.fn(() => null),
}));
vi.mock('../../lib/services/storage/settingsStorage.js', () => ({
  getUserSettings: vi.fn(() => ({})),
}));
vi.mock('../../lib/services/tracking/Tracker.js', () => ({ trackPoi: vi.fn() }));
vi.mock('../../lib/services/logger.js', () => ({ default: { error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('../../lib/api/security.js', () => ({ isAdmin: vi.fn(() => false) }));

import { queryListings, getListingById } from '../../lib/services/storage/listingsStorage.js';
import { getUserSettings } from '../../lib/services/storage/settingsStorage.js';
import { trackPoi } from '../../lib/services/tracking/Tracker.js';
import financePlugin from '../../lib/api/routes/financeRouter.js';

const PROFILE = {
  personA: { label: 'A', enabled: true, age: 34, primaryIncome: 3400, secondaryIncome: 0 },
  personB: { label: 'B', enabled: true, age: 36, primaryIncome: 2400, secondaryIncome: 0 },
  livingCosts: 1400,
  existingDebt: 8000,
  existingDebtRate: 250,
  existingDebtInterest: 6.9,
  renting: { nebenkostenPct: 25 },
  financing: {
    purchasePrice: 400000,
    equity: 80000,
    bundesland: 'NW',
    notaryPct: 1.5,
    maklerPct: 3.57,
    purchasePriceThreshold: 30000,
    scenarios: [{ id: 'mid', annualRate: 3.8, tilgung: 2, fixedYears: 10 }],
  },
};

const listing = (id, price, dealType = 'buy') => ({
  id,
  price,
  dealType,
  title: `Listing ${id}`,
  provider: 'immoscout',
  link: `https://x/${id}`,
});

async function buildApp() {
  const app = Fastify();
  app.addHook('onRequest', async (request) => {
    request.session = { currentUser: 'user-1' };
  });
  await app.register(financePlugin);
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  queryListings.mockReturnValue({ totalNumber: 0, page: 1, result: [] });
});

describe('POST /calculate', () => {
  it('returns the full financing picture', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'POST', url: '/calculate', payload: { profile: PROFILE } });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    // The breakdown sits under `result`; alongside it come the budget, the ceilings and the
    // completeness flags for the same draft, so the calculator page needs one request rather
    // than four for what it puts on screen.
    expect(body.result.financing.loanAmount).toBeCloseTo(366280, 2);
    expect(body.result.financing.primary.monthlyPayment).toBeGreaterThan(0);
    expect(body.result.verdict).toBe('affordable');
    expect(body.result.debtFreeAges).toHaveLength(2);
    expect(body.result.thresholds.affordableMaxPrice).toBeGreaterThan(0);
    expect(body.result.recommendation.maxAffordablePrice).toBeGreaterThan(0);
  });

  it('carries the draft summary the calculator renders around the breakdown', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'POST', url: '/calculate', payload: { profile: PROFILE } });

    const body = response.json();
    expect(body.isComplete).toBe(true);
    expect(body.budget.disposable).toBeTypeOf('number');
    expect(body.thresholds).toHaveProperty('buy');
    expect(body.thresholds).toHaveProperty('rent');
    // The normalized profile comes back too: the form seeds from it, and normalizing is itself a
    // rule (defaults for equity, Bundesland, scenarios) that must not be reimplemented client-side.
    expect(body.profile.financing.scenarios.length).toBeGreaterThan(0);
  });

  it('records that the calculator was used', async () => {
    const app = await buildApp();
    await app.inject({ method: 'POST', url: '/calculate', payload: { profile: PROFILE } });

    expect(trackPoi).toHaveBeenCalledWith('FINANCE_CALCULATOR_USED');
  });

  it('rejects a negative purchase price', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/calculate',
      payload: { profile: { ...PROFILE, financing: { ...PROFILE.financing, purchasePrice: -1 } } },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(/purchasePrice/);
  });

  it('rejects an implausible age', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/calculate',
      payload: { profile: { ...PROFILE, personA: { ...PROFILE.personA, age: 7 } } },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(/age/);
  });

  it('rejects an interest rate above 100 %', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/calculate',
      payload: {
        profile: { ...PROFILE, financing: { ...PROFILE.financing, scenarios: [{ annualRate: 900, tilgung: 2 }] } },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(/annualRate/);
  });

  it('falls back to defaults for a sparse profile instead of failing', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/calculate',
      payload: { profile: { personA: { enabled: true, age: 30, primaryIncome: 3000 }, livingCosts: 1000 } },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().result.financing.scenarios.length).toBeGreaterThan(0);
  });
});

describe('POST /affordability', () => {
  it('scores buy listings and summarises the outcome', async () => {
    queryListings.mockReturnValue({
      totalNumber: 3,
      page: 1,
      result: [listing('a', 300000), listing('b', 420000), listing('c', 900000)],
    });
    const app = await buildApp();
    const response = await app.inject({ method: 'POST', url: '/affordability', payload: { profile: PROFILE } });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.items).toHaveLength(3);
    expect(body.summary.total).toBe(3);
    expect(body.summary.affordable + body.summary.stretch + body.summary.unaffordable).toBe(3);
    expect(body.items[0]).toMatchObject({ id: 'a', price: 300000, verdict: 'affordable', dealType: 'buy' });
    expect(body.items[2].verdict).toBe('unaffordable');
    expect(body.summary.buy.cheapestAffordable).toBe(300000);
  });

  it('scores rentals and purchases side by side, each on its own yardstick', async () => {
    queryListings.mockReturnValue({
      totalNumber: 3,
      page: 1,
      result: [listing('rent-1', 1200, 'rent'), listing('rent-2', 3000, 'rent'), listing('buy', 350000, 'buy')],
    });
    const app = await buildApp();
    const response = await app.inject({ method: 'POST', url: '/affordability', payload: { profile: PROFILE } });

    const body = response.json();
    expect(body.items).toHaveLength(3);
    // The cheap rental fits the budget; a 3.000 EUR cold rent does not.
    expect(body.items.find((i) => i.id === 'rent-1')).toMatchObject({ dealType: 'rent', verdict: 'affordable' });
    expect(body.items.find((i) => i.id === 'rent-2').verdict).toBe('unaffordable');
    expect(body.summary.rent.total).toBe(2);
    expect(body.summary.buy.total).toBe(1);
  });

  it('skips priceless listings and says how many', async () => {
    queryListings.mockReturnValue({
      totalNumber: 2,
      page: 1,
      result: [listing('no-price', null), listing('buy', 350000)],
    });
    const app = await buildApp();
    const response = await app.inject({ method: 'POST', url: '/affordability', payload: { profile: PROFILE } });

    const body = response.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe('buy');
    expect(body.skipped).toEqual({ noPrice: 1, incompleteProfile: 0 });
  });

  it('falls back to the price heuristic when a listing has no deal type', async () => {
    // A listing from a job that predates the deal type: no dealType at all, so the price decides.
    // Below the 30.000 threshold it is read as a rent and scored as one.
    const legacy = { id: 'legacy', price: 1200, title: 'Legacy', provider: 'immoscout', link: 'https://x/legacy' };
    queryListings.mockReturnValue({ totalNumber: 1, page: 1, result: [legacy] });
    const app = await buildApp();
    const response = await app.inject({ method: 'POST', url: '/affordability', payload: { profile: PROFILE } });

    const body = response.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].dealType).toBe('rent');
  });

  it('scopes the sweep to the session user so foreign listings are unreachable', async () => {
    const app = await buildApp();
    await app.inject({ method: 'POST', url: '/affordability', payload: { profile: PROFILE } });

    expect(queryListings.mock.calls.at(-1)[0]).toMatchObject({
      userId: 'user-1',
      isAdmin: false,
      activityFilter: true,
    });
  });

  it('passes the job and price filters through to the query', async () => {
    const app = await buildApp();
    await app.inject({
      method: 'POST',
      url: '/affordability',
      payload: {
        profile: PROFILE,
        filter: { jobId: 'job-1', minPrice: 100000, maxPrice: 500000, watchListOnly: true },
      },
    });

    expect(queryListings.mock.calls.at(-1)[0]).toMatchObject({
      jobIdFilter: 'job-1',
      minPrice: 100000,
      maxPrice: 500000,
      watchListFilter: true,
    });
  });

  it('refuses an incomplete profile, because there is nothing to score against', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/affordability',
      payload: { profile: { personA: { enabled: true, age: 30, primaryIncome: 0 } } },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(/incomplete/i);
  });

  it('agrees with the buy thresholds it reports', async () => {
    queryListings.mockReturnValue({
      totalNumber: 2,
      page: 1,
      result: [listing('a', 300000), listing('b', 900000)],
    });
    const app = await buildApp();
    const body = (await app.inject({ method: 'POST', url: '/affordability', payload: { profile: PROFILE } })).json();

    // The verdict a listing gets from the full simulation must match the band its price
    // falls into, otherwise the scatter and the listings filter would tell different stories.
    for (const item of body.items) {
      const expected =
        item.price <= body.thresholds.buy.affordableMaxPrice
          ? 'affordable'
          : item.price <= body.thresholds.buy.stretchMaxPrice
            ? 'stretch'
            : 'unaffordable';
      expect(item.verdict).toBe(expected);
    }
  });

  it('accepts a rent-only profile and scores its rentals', async () => {
    queryListings.mockReturnValue({ totalNumber: 1, page: 1, result: [listing('rent', 900, 'rent')] });
    const app = await buildApp();
    // No equity, no Bundesland, no scenarios: the buy half is incomplete, the rent half is not.
    const rentOnlyProfile = {
      personA: { enabled: true, age: 30, primaryIncome: 3500, secondaryIncome: 0 },
      livingCosts: 1200,
      renting: { nebenkostenPct: 25 },
    };
    const response = await app.inject({
      method: 'POST',
      url: '/affordability',
      payload: { profile: rentOnlyProfile },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].dealType).toBe('rent');
    expect(body.thresholds.rent).not.toBeNull();
    expect(body.thresholds.buy).toBeNull();
  });
});

/**
 * The finance math lives only on the server now; the browser asks for answers rather than
 * computing them. These two endpoints are what the UI leans on for that.
 */
describe('GET /profile-summary', () => {
  it('derives the stored profile without being handed one', async () => {
    getUserSettings.mockReturnValue({ finance_profile: PROFILE });
    const app = await buildApp();

    const body = (await app.inject({ method: 'GET', url: '/profile-summary' })).json();

    expect(getUserSettings).toHaveBeenCalledWith('user-1');
    expect(body.isComplete).toBe(true);
    expect(body.anyComplete).toBe(true);
    expect(body.thresholds.buy.affordableMaxPrice).toBeGreaterThan(0);
    expect(body.budget.disposable).toBeTypeOf('number');
    // The form seeds from the normalized profile, so it comes back too.
    expect(body.profile.financing.bundesland).toBe('NW');
  });

  it('reports an empty profile as unusable rather than failing', async () => {
    getUserSettings.mockReturnValue({});
    const app = await buildApp();

    const body = (await app.inject({ method: 'GET', url: '/profile-summary' })).json();

    expect(body.isComplete).toBe(false);
    expect(body.rentComplete).toBe(false);
    expect(body.anyComplete).toBe(false);
    expect(body.thresholds.buy).toBeNull();
  });

  it('judges the two halves independently', async () => {
    // A household that only ever rents fills in income and living costs, never equity.
    getUserSettings.mockReturnValue({
      finance_profile: {
        personA: { enabled: true, age: 30, primaryIncome: 3000 },
        livingCosts: 1000,
        renting: { nebenkostenPct: 25 },
      },
    });
    const app = await buildApp();

    const body = (await app.inject({ method: 'GET', url: '/profile-summary' })).json();

    expect(body.rentComplete).toBe(true);
    expect(body.isComplete).toBe(false);
    expect(body.anyComplete).toBe(true);
  });
});

describe('GET /listing/:listingId', () => {
  beforeEach(() => {
    getUserSettings.mockReturnValue({ finance_profile: PROFILE });
  });

  it('runs the full amortization for a purchase, against this listing’s price', async () => {
    getListingById.mockReturnValue(listing('a', 300000, 'buy'));
    const app = await buildApp();

    const body = (await app.inject({ method: 'GET', url: '/listing/a' })).json();

    expect(body.dealType).toBe('buy');
    expect(body.scored).toBeNull();
    // The listing's price replaces the profile's, so the card answers for this property.
    expect(body.result.financing.purchasePrice).toBe(300000);
    expect(body.result.financing.primary.monthlyPayment).toBeGreaterThan(0);
    // The schedule carries its own yearly rollup, so the charts derive nothing.
    expect(body.result.financing.primary.schedule.years.length).toBeGreaterThan(0);
  });

  it('scores a rental against the rent ceilings instead', async () => {
    getListingById.mockReturnValue(listing('r', 1200, 'rent'));
    const app = await buildApp();

    const body = (await app.inject({ method: 'GET', url: '/listing/r' })).json();

    expect(body.dealType).toBe('rent');
    expect(body.result).toBeNull();
    expect(body.scored.coldRent).toBe(1200);
    expect(body.scored.verdict).toBeTypeOf('string');
  });

  it('scopes to the caller, so a foreign listing is not found', async () => {
    getListingById.mockReturnValue(null);
    const app = await buildApp();

    const response = await app.inject({ method: 'GET', url: '/listing/someone-elses' });

    expect(response.statusCode).toBe(404);
    expect(getListingById).toHaveBeenCalledWith('someone-elses', 'user-1', false);
  });

  it('returns no figures for a listing without a price', async () => {
    getListingById.mockReturnValue({ ...listing('n', null, 'buy'), price: null });
    const app = await buildApp();

    const body = (await app.inject({ method: 'GET', url: '/listing/n' })).json();

    expect(body.result).toBeNull();
    expect(body.scored).toBeNull();
  });

  it('returns no figures when the matching half of the profile is missing', async () => {
    getUserSettings.mockReturnValue({ finance_profile: null });
    getListingById.mockReturnValue(listing('a', 300000, 'buy'));
    const app = await buildApp();

    const body = (await app.inject({ method: 'GET', url: '/listing/a' })).json();

    expect(body.isComplete).toBe(false);
    expect(body.result).toBeNull();
  });
});
