/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it } from 'vitest';
import { normalizeGetListing, normalizeListListings } from '../../lib/mcp/mcpNormalizer.js';

describe('MCP listing currency', () => {
  it('names PLN on list and detail amounts', () => {
    const listing = { id: 'pl', price: 1050000, currency: 'PLN', title: 'Dom', provider: 'polish' };
    expect(normalizeGetListing(listing).content[0].text).toContain('1050000 PLN');
    expect(
      normalizeListListings({ totalNumber: 1, result: [listing] }, { page: 1, pageSize: 50 }).content[0].text,
    ).toContain('1050000 PLN');
  });

  // A currency with no amount reads as a broken figure, and every row has a currency now.
  it('leaves the currency off a listing with no price', () => {
    const listing = { id: 'pl', price: null, currency: 'CHF', title: 'Haus', provider: 'polish' };
    expect(normalizeGetListing(listing).content[0].text).toContain('- **Price:** –\n');
    const list = normalizeListListings({ totalNumber: 1, result: [listing] }, { page: 1, pageSize: 50 });
    expect(list.content[0].text).not.toContain('– CHF');
  });
});
