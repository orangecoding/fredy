/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

vi.mock('../../lib/services/storage/listingsStorage.js', () => ({
  queryListings: vi.fn(() => ({ totalNumber: 0, page: 1, result: [] })),
  getListingById: vi.fn(),
  setListingNotes: vi.fn(() => 1),
}));
vi.mock('../../lib/services/storage/watchListStorage.js', () => ({
  ensureWatch: vi.fn(() => ({ watched: true })),
  deleteWatch: vi.fn(() => ({ deleted: true })),
}));
vi.mock('../../lib/services/tracking/Tracker.js', () => ({ trackPoi: vi.fn() }));
vi.mock('../../lib/services/storage/settingsStorage.js', () => ({ getUserSettings: vi.fn(() => ({})) }));
vi.mock('../../lib/mcp/mcpAuthentication.js', () => ({
  authenticateToolCall: vi.fn(() => ({ user: { id: 'u1', isAdmin: false }, error: null })),
  authenticateWriteToolCall: vi.fn(async () => ({ user: { id: 'u1', isAdmin: false }, error: null })),
  checkJobAccess: vi.fn(() => true),
}));

import { getListingById } from '../../lib/services/storage/listingsStorage.js';
import { getUserSettings } from '../../lib/services/storage/settingsStorage.js';
import { createMcpServer } from '../../lib/mcp/mcpAdapter.js';
import { normalizeRentAffordability } from '../../lib/mcp/mcpNormalizer.js';
import { computeBudget, scoreRentListing } from '../../lib/services/finance/affordability.js';

/**
 * 4000 net and 1400 living costs: 1400 warm is the 35 % ceiling, 1120 cold at the 25 % surcharge. A
 * 1300 EUR rent is affordable with the charges in it and out of reach (1625 warm) without them.
 */
const HOUSEHOLD = {
  personA: { label: 'A', enabled: true, age: 34, primaryIncome: 4000, secondaryIncome: 0 },
  livingCosts: 1400,
  renting: { nebenkostenPct: 25 },
};

const textOf = (result) => result.content.map((part) => part.text).join('\n');

/** The rent answer for one listing row, exactly as calculate_financing assembles it. */
const answerFor = (listing) =>
  textOf(normalizeRentAffordability(scoreRentListing(listing, HOUSEHOLD), computeBudget(HOUSEHOLD), listing));

async function callTool(name, args) {
  const server = createMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const result = await client.callTool({ name, arguments: args });
  await client.close();
  return result;
}

describe('normalizeRentAffordability', () => {
  it('still names a rent quoted without the charges a cold rent, with the surcharge as an estimate', () => {
    const md = answerFor({ id: 'hc', title: 'Altbau', price: 1000, charges_included: 0 });

    expect(md).toContain('- **Cold rent (as listed):** 1.000 EUR');
    expect(md).toContain('- **Nebenkosten estimate:** 250 EUR');
    expect(md).toContain('- **Warm rent:** 1.250 EUR');
    expect(md).toContain('The Nebenkosten are a percentage assumption');
  });

  it('does not call a rent quoted with the charges a cold rent', () => {
    const md = answerFor({ id: 'cc', title: 'Studio', price: 1300, charges_included: 1 });

    expect(md).not.toContain('Cold rent (as listed)');
    expect(md).not.toContain('Nebenkosten estimate');
    expect(md).not.toContain('percentage assumption');
    expect(md).toContain('- **Rent incl. charges (as listed):** 1.300 EUR');
    expect(md).toContain('- **Warm rent:** 1.300 EUR');
    expect(md).toContain('- **Charges:** included in the rent, not stated separately');
  });

  it('quotes the charges the advert states, and the cold rent they leave', () => {
    const md = answerFor({ id: 'cc', title: 'Studio', price: 1300, charges_included: 1, charges: 100 });

    expect(md).toContain('- **Charges (as stated):** 100 EUR');
    expect(md).toContain('- **Cold rent (listed rent minus stated charges):** 1.200 EUR');
  });
});

describe('calculate_financing for a rental', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserSettings.mockReturnValue({ finance_profile: HOUSEHOLD });
  });

  it('judges a rent quoted with the charges on that rent, without a surcharge on top', async () => {
    getListingById.mockReturnValue({ id: 'cc', title: 'Studio', price: 1300, dealType: 'rent', charges_included: 1 });

    const md = textOf(await callTool('calculate_financing', { listingId: 'cc' }));

    expect(md).toContain('### Verdict: AFFORDABLE');
    expect(md).toContain('Warm rent **1.300 EUR**');
  });

  it('keeps adding the surcharge to a rent quoted without the charges', async () => {
    getListingById.mockReturnValue({ id: 'hc', title: 'Altbau', price: 1300, dealType: 'rent', charges_included: 0 });

    const md = textOf(await callTool('calculate_financing', { listingId: 'hc' }));

    expect(md).toContain('### Verdict: OUT OF REACH');
    expect(md).toContain('Warm rent **1.625 EUR**');
  });
});
