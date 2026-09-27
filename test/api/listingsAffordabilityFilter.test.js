/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

// Mock everything the listings route pulls in, so this suite exercises the affordability
// translation and nothing else.
vi.mock('../../lib/services/storage/listingsStorage.js', () => ({
  queryListings: vi.fn(() => ({ totalNumber: 0, page: 1, result: [] })),
  getAvailableProviders: vi.fn(() => []),
  getListingsForMap: vi.fn(() => []),
  getListingById: vi.fn(() => null),
  setListingNotes: vi.fn(() => 1),
  setListingStatus: vi.fn(() => 1),
  deleteListingsByJobId: vi.fn(),
  deleteListingsById: vi.fn(),
  restoreListingsById: vi.fn(),
}));
vi.mock('../../lib/services/storage/watchListStorage.js', () => ({
  toggleWatch: vi.fn(),
  ensureWatch: vi.fn(),
}));
vi.mock('../../lib/services/storage/jobStorage.js', () => ({ getJob: vi.fn(() => null) }));
vi.mock('../../lib/services/storage/settingsStorage.js', () => ({
  getSettings: vi.fn(async () => ({})),
  getUserSettings: vi.fn(() => ({})),
}));
vi.mock('../../lib/services/tracking/Tracker.js', () => ({ trackPoi: vi.fn() }));
vi.mock('../../lib/services/logger.js', () => ({ default: { error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('../../lib/api/security.js', () => ({ isAdmin: vi.fn(() => false) }));

import { getListingById, queryListings } from '../../lib/services/storage/listingsStorage.js';
import { getUserSettings } from '../../lib/services/storage/settingsStorage.js';
import listingsPlugin from '../../lib/api/routes/listingsRouter.js';
import { priceThresholds, rentThresholds } from '../../lib/services/finance/affordability.js';

const COMPLETE_PROFILE = {
  personA: { label: 'A', enabled: true, age: 34, primaryIncome: 3400, secondaryIncome: 0 },
  livingCosts: 1200,
  existingDebtRate: 0,
  renting: { nebenkostenPct: 25 },
  financing: {
    equity: 60000,
    bundesland: 'NW',
    notaryPct: 1.5,
    maklerPct: 3.57,
    purchasePriceThreshold: 30000,
    scenarios: [{ id: 'mid', annualRate: 3.8, tilgung: 2, fixedYears: 10 }],
  },
};

const buyBand = () => bandFromLastCall()?.buy;

async function buildApp() {
  const app = Fastify();
  app.addHook('onRequest', async (request) => {
    request.session = { currentUser: 'user-1' };
  });
  await app.register(listingsPlugin);
  await app.ready();
  return app;
}

const bandFromLastCall = () => queryListings.mock.calls.at(-1)[0].affordabilityBand;

beforeEach(() => {
  vi.clearAllMocks();
  queryListings.mockReturnValue({ totalNumber: 0, page: 1, result: [] });
  getUserSettings.mockReturnValue({ finance_profile: COMPLETE_PROFILE });
});

describe('GET /table affordability filter', () => {
  it('translates "affordable" into a buy price band capped at the 35 % ceiling', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/table?affordabilityFilter=affordable' });

    expect(response.statusCode).toBe(200);
    const thresholds = priceThresholds(COMPLETE_PROFILE, COMPLETE_PROFILE.financing);
    expect(buyBand()).toEqual({ min: 30000, max: thresholds.affordableMaxPrice });
  });

  it('translates "affordable" into a rent band capped at the affordable cold rent', async () => {
    const app = await buildApp();
    await app.inject({ method: 'GET', url: '/table?affordabilityFilter=affordable' });

    const thresholds = rentThresholds(COMPLETE_PROFILE);
    // Rentals have no meaningful floor beyond being a real offer - the cheapest ones are the
    // point of the filter - so only zero itself is excluded.
    expect(bandFromLastCall().rent).toEqual({
      minExclusive: 0,
      max: thresholds.affordableMaxRent,
      // A rent quoted with the charges in it is already warm, and is held against the warm ceiling.
      chargesIncluded: { minExclusive: 0, max: thresholds.warmAffordable },
    });
  });

  it('keeps every rent quoted without the charges on the cold ceilings, band by band', async () => {
    const app = await buildApp();
    const thresholds = rentThresholds(COMPLETE_PROFILE);
    const expected = {
      affordable: { minExclusive: 0, max: thresholds.affordableMaxRent },
      stretch: { minExclusive: thresholds.affordableMaxRent, max: thresholds.stretchMaxRent },
      unaffordable: { minExclusive: thresholds.stretchMaxRent, max: null },
    };

    for (const [band, window] of Object.entries(expected)) {
      await app.inject({ method: 'GET', url: `/table?affordabilityFilter=${band}` });
      expect(bandFromLastCall().rent, band).toMatchObject(window);
    }
  });

  it('holds a rent quoted with the charges against the warm ceilings, band by band', async () => {
    const app = await buildApp();
    const thresholds = rentThresholds(COMPLETE_PROFILE);
    const expected = {
      affordable: { minExclusive: 0, max: thresholds.warmAffordable },
      stretch: { minExclusive: thresholds.warmAffordable, max: thresholds.warmStretch },
      unaffordable: { minExclusive: thresholds.warmStretch, max: null },
    };

    for (const [band, window] of Object.entries(expected)) {
      await app.inject({ method: 'GET', url: `/table?affordabilityFilter=${band}` });
      expect(bandFromLastCall().rent.chargesIncluded, band).toEqual(window);
    }
  });

  it('never splits the buy band, since a purchase price has no charges to include', async () => {
    const app = await buildApp();
    await app.inject({ method: 'GET', url: '/table?affordabilityFilter=affordable' });

    expect(buyBand().chargesIncluded).toBeUndefined();
  });

  it('translates "stretch" into the buy band just above the affordable ceiling', async () => {
    const app = await buildApp();
    await app.inject({ method: 'GET', url: '/table?affordabilityFilter=stretch' });

    const thresholds = priceThresholds(COMPLETE_PROFILE, COMPLETE_PROFILE.financing);
    // The lower edge is exclusive, not `affordableMaxPrice + 1`: a price sitting in the gap
    // between the two would otherwise get a "stretch" chip that this filter cannot find.
    expect(buyBand()).toEqual({
      min: 30000,
      minExclusive: thresholds.affordableMaxPrice,
      max: thresholds.stretchMaxPrice,
    });
  });

  it('translates "unaffordable" into an open-ended buy band above the stretch ceiling', async () => {
    const app = await buildApp();
    await app.inject({ method: 'GET', url: '/table?affordabilityFilter=unaffordable' });

    const thresholds = priceThresholds(COMPLETE_PROFILE, COMPLETE_PROFILE.financing);
    expect(buyBand()).toEqual({ min: 30000, minExclusive: thresholds.stretchMaxPrice, max: null });
  });

  it('floors every buy band at the rental threshold, so rents never get a purchase verdict', async () => {
    const app = await buildApp();

    for (const band of ['affordable', 'stretch', 'unaffordable']) {
      await app.inject({ method: 'GET', url: `/table?affordabilityFilter=${band}` });
      expect(buyBand().min).toBeGreaterThanOrEqual(30000);
    }
  });

  it('yields only a rent band for a rent-only profile', async () => {
    getUserSettings.mockReturnValue({
      finance_profile: {
        personA: { enabled: true, age: 30, primaryIncome: 3500 },
        livingCosts: 1200,
        renting: { nebenkostenPct: 25 },
      },
    });
    const app = await buildApp();
    await app.inject({ method: 'GET', url: '/table?affordabilityFilter=affordable' });

    const band = bandFromLastCall();
    expect(band.buy).toBeNull();
    expect(band.rent).not.toBeNull();
  });

  it('drops the filter when the user has no profile, instead of returning nothing', async () => {
    getUserSettings.mockReturnValue({});
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/table?affordabilityFilter=affordable' });

    // A bookmarked URL from before the profile was cleared must still show listings.
    expect(response.statusCode).toBe(200);
    expect(bandFromLastCall()).toBeNull();
  });

  it('drops the filter when the stored profile is incomplete', async () => {
    getUserSettings.mockReturnValue({
      finance_profile: { ...COMPLETE_PROFILE, personA: { enabled: true, age: 34, primaryIncome: 0 } },
    });
    const app = await buildApp();
    await app.inject({ method: 'GET', url: '/table?affordabilityFilter=affordable' });

    expect(bandFromLastCall()).toBeNull();
  });

  it('ignores an unrecognised band rather than erroring', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/table?affordabilityFilter=cheap-please' });

    expect(response.statusCode).toBe(200);
    expect(bandFromLastCall()).toBeNull();
  });

  it('applies no band when the filter is absent', async () => {
    const app = await buildApp();
    await app.inject({ method: 'GET', url: '/table' });

    expect(bandFromLastCall()).toBeNull();
  });

  // This is the hottest endpoint in the app. Every row now carries its affordability verdict -
  // the browser no longer derives it, so it cannot contradict the filter - which means the
  // profile is needed on every request. What must not happen is reading it twice: the band and
  // the verdicts share one lookup.
  it('reads the user settings exactly once per request', async () => {
    const app = await buildApp();

    await app.inject({ method: 'GET', url: '/table' });
    expect(getUserSettings).toHaveBeenCalledTimes(1);
    expect(getUserSettings).toHaveBeenCalledWith('user-1');

    getUserSettings.mockClear();
    await app.inject({ method: 'GET', url: '/table?affordabilityFilter=affordable' });
    expect(getUserSettings).toHaveBeenCalledTimes(1);
  });

  it('never takes price bounds from the request itself', async () => {
    const app = await buildApp();
    // A hand-edited URL must not be able to widen or invent its own affordability window.
    await app.inject({ method: 'GET', url: '/table?affordabilityFilter=affordable&affMin=1&affMax=99999999' });

    const thresholds = priceThresholds(COMPLETE_PROFILE, COMPLETE_PROFILE.financing);
    expect(buyBand()).toEqual({ min: 30000, max: thresholds.affordableMaxPrice });
  });

  it('keeps the other filters working alongside it', async () => {
    const app = await buildApp();
    await app.inject({
      method: 'GET',
      url: '/table?affordabilityFilter=affordable&statusFilter=applied&providerFilter=immoscout&page=2',
    });

    const args = queryListings.mock.calls.at(-1)[0];
    expect(args.statusFilter).toBe('applied');
    expect(args.providerFilter).toBe('immoscout');
    expect(args.page).toBe(2);
    expect(args.affordabilityBand).not.toBeNull();
  });

  it('does not ship thresholds with the page, since the UI derives them from the same profile', async () => {
    queryListings.mockReturnValue({ totalNumber: 1, page: 1, result: [{ id: 'l1', price: 300000, dealType: 'buy' }] });
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/table' });

    // Each row carries its job's deal type; the client pairs that with the thresholds it already
    // computes from the stored profile, so sending them again would be a second source of truth.
    const body = response.json();
    expect(body.affordability).toBeUndefined();
    expect(body.result[0].dealType).toBe('buy');
  });

  it('scopes the query to the session user', async () => {
    const app = await buildApp();
    await app.inject({ method: 'GET', url: '/table?affordabilityFilter=affordable' });

    expect(queryListings.mock.calls.at(-1)[0]).toMatchObject({ userId: 'user-1', isAdmin: false });
  });
});

/*
 * The per-row verdicts, on the same profile: 1190 warm is the affordable ceiling, 952 cold, and the
 * stretch ceilings are 1360 warm and 1088 cold. A 1100 EUR rent is therefore affordable when it has
 * the charges in it, and out of reach when they still come on top.
 */
describe('verdicts and the rent basis', () => {
  const rentRow = (id, chargesIncluded, extra = {}) => ({
    id,
    price: 1100,
    dealType: 'rent',
    charges_included: chargesIncluded,
    ...extra,
  });

  it('judges each overview row on the basis its rent was quoted on', async () => {
    queryListings.mockReturnValue({
      totalNumber: 3,
      page: 1,
      result: [rentRow('cc', 1), rentRow('hc', 0), rentRow('unknown', null)],
    });
    const app = await buildApp();
    const body = (await app.inject({ method: 'GET', url: '/table' })).json();

    const verdictOf = (id) => body.result.find((row) => row.id === id).affordabilityVerdict;
    expect(verdictOf('cc')).toBe('affordable');
    expect(verdictOf('hc')).toBe('unaffordable');
    expect(verdictOf('unknown')).toBe('unaffordable');
  });

  it('hands the rent basis on to the UI with every row', async () => {
    queryListings.mockReturnValue({ totalNumber: 1, page: 1, result: [rentRow('cc', 1, { charges: 90 })] });
    const app = await buildApp();
    const body = (await app.inject({ method: 'GET', url: '/table' })).json();

    expect(body.result[0]).toMatchObject({ charges_included: 1, charges: 90 });
  });

  it('judges the detail page on the same basis as the row it was opened from', async () => {
    getListingById.mockReturnValue(rentRow('cc', 1, { charges: 90 }));
    const app = await buildApp();
    const body = (await app.inject({ method: 'GET', url: '/cc' })).json();

    expect(body.affordabilityVerdict).toBe('affordable');
    expect(body).toMatchObject({ charges_included: 1, charges: 90 });
  });
});
