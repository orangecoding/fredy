/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// Capture the SQL and bound parameters so we can assert exactly which clauses the
// affordability band adds, and that it does not disturb the existing ones.
const calls = { query: [] };

const sqliteMock = {
  execute: () => ({ changes: 0 }),
  query: (sql, params) => {
    calls.query.push({ sql, params });
    // The first query of queryListings is the COUNT, the second the page itself.
    return sql.includes('COUNT(1)') ? [{ cnt: 0 }] : [];
  },
};

vi.mock('../../lib/services/storage/SqliteConnection.js', () => ({ default: sqliteMock }));
vi.mock('../../lib/services/similarity-check/similarityCache.js', () => ({ removeEntry: vi.fn() }));

/** The SELECT that fetches the page (as opposed to the COUNT). */
const pageQuery = () => calls.query.find((call) => !call.sql.includes('COUNT(1)'));

/** A band scored only for buying, leaving rent unjudged. */
const buyOnly = (min, max) => ({ buy: { min, max }, rent: null });
/** The mirror image, only renting. */
const rentOnly = (min, max) => ({ buy: null, rent: { min, max } });

describe('queryListings affordabilityBand', () => {
  let listingsStorage;

  beforeEach(async () => {
    calls.query.length = 0;
    vi.resetModules();
    listingsStorage = await import('../../lib/services/storage/listingsStorage.js');
  });

  it('adds no clause when no band is given', () => {
    listingsStorage.queryListings({ userId: 'u1' });

    const { sql, params } = pageQuery();
    expect(sql).not.toContain('@affMin');
    expect(sql).not.toContain('@affMax');
    expect(params.affMin_buy).toBeUndefined();
    expect(params.affMax_buy).toBeUndefined();
  });

  it('gates the buy window on the buy deal type', () => {
    listingsStorage.queryListings({ userId: 'u1', affordabilityBand: buyOnly(30000, 412000) });

    const { sql, params } = pageQuery();
    expect(sql).toContain('j.deal_type = @affDealType_buy');
    expect(sql).toContain('l.price >= @affMin_buy');
    expect(sql).toContain('l.price <= @affMax_buy');
    expect(params).toMatchObject({ affDealType_buy: 'buy', affMin_buy: 30000, affMax_buy: 412000 });
    // Nothing about rent leaks in when that half is absent.
    expect(sql).not.toContain('@affDealType_rent');
  });

  it('gates the rent window on the rent deal type', () => {
    listingsStorage.queryListings({ userId: 'u1', affordabilityBand: rentOnly(0, 1400) });

    const { sql, params } = pageQuery();
    expect(sql).toContain('j.deal_type = @affDealType_rent');
    expect(sql).toContain('l.price <= @affMax_rent');
    expect(params).toMatchObject({ affDealType_rent: 'rent', affMax_rent: 1400 });
    expect(sql).not.toContain('@affDealType_buy');
  });

  it('OR-combines the two windows so each deal type keeps its own bounds', () => {
    listingsStorage.queryListings({
      userId: 'u1',
      affordabilityBand: { buy: { min: 30000, max: 412000 }, rent: { min: 0, max: 1400 } },
    });

    const { sql, params } = pageQuery();
    // The two arms are OR'ed, so a listing matches on the window for its own deal type only.
    expect(sql).toMatch(/j\.deal_type = @affDealType_buy[\s\S]*OR[\s\S]*j\.deal_type = @affDealType_rent/);
    expect(params).toMatchObject({ affMin_buy: 30000, affMax_buy: 412000, affMax_rent: 1400 });
  });

  it('binds only the lower bound for an open-ended buy band', () => {
    listingsStorage.queryListings({ userId: 'u1', affordabilityBand: buyOnly(460000, null) });

    const { sql, params } = pageQuery();
    expect(sql).toContain('l.price >= @affMin_buy');
    expect(sql).not.toContain('@affMax_buy');
    expect(params.affMin_buy).toBe(460000);
  });

  it('excludes listings without a price, which can never have a verdict', () => {
    listingsStorage.queryListings({ userId: 'u1', affordabilityBand: buyOnly(30000, 412000) });

    expect(pageQuery().sql).toContain('l.price IS NOT NULL');
  });

  it('composes with minPrice and maxPrice instead of overwriting them', () => {
    listingsStorage.queryListings({
      userId: 'u1',
      minPrice: 100000,
      maxPrice: 800000,
      affordabilityBand: buyOnly(30000, 412000),
    });

    const { sql, params } = pageQuery();
    // Independent bounds, distinct parameters, all ANDed together.
    expect(params).toMatchObject({ minPrice: 100000, maxPrice: 800000, affMin_buy: 30000, affMax_buy: 412000 });
    expect(sql).toContain('l.price >= @minPrice');
    expect(sql).toContain('l.price <= @maxPrice');
    expect(sql).toContain('l.price >= @affMin_buy');
    expect(sql).toContain('l.price <= @affMax_buy');
  });

  it('composes with the job, status and activity filters', () => {
    listingsStorage.queryListings({
      userId: 'u1',
      jobIdFilter: 'job-1',
      statusFilter: 'applied',
      activityFilter: true,
      affordabilityBand: buyOnly(30000, 412000),
    });

    const { sql, params } = pageQuery();
    expect(sql).toContain('l.job_id = @jobId');
    expect(sql).toContain("json_extract(l.status, '$.status') = @statusValue");
    expect(sql).toContain('l.is_active = 1');
    expect(sql).toContain('@affMin_buy');
    expect(params).toMatchObject({ jobId: 'job-1', statusValue: 'applied', affMin_buy: 30000 });
  });

  it('keeps the user scoping clause in place', () => {
    listingsStorage.queryListings({ userId: 'u1', affordabilityBand: buyOnly(30000, 412000) });

    expect(pageQuery().sql).toContain('l.job_id IN');
    expect(pageQuery().sql).toContain('scoped_job.user_id = @userId');
    expect(pageQuery().sql).toContain('json_each(scoped_job.shared_with_user)');
  });

  it('ignores non-numeric bounds rather than emitting a broken clause', () => {
    listingsStorage.queryListings({ userId: 'u1', affordabilityBand: buyOnly('lots', undefined) });

    const { sql } = pageQuery();
    expect(sql).not.toContain('@affMin_buy');
    expect(sql).not.toContain('@affMax_buy');
  });

  it('applies the same band to the COUNT query, so pagination stays correct', () => {
    listingsStorage.queryListings({ userId: 'u1', affordabilityBand: buyOnly(30000, 412000) });

    const countQuery = calls.query.find((call) => call.sql.includes('COUNT(1)'));
    expect(countQuery.sql).toContain('@affMin_buy');
    expect(countQuery.params.affMax_buy).toBe(412000);
  });

  it('projects the job deal type onto each row for the verdict chips', () => {
    listingsStorage.queryListings({ userId: 'u1' });

    expect(pageQuery().sql).toContain('j.deal_type');
  });
});
