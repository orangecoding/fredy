/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf-8');

describe('a listing outside the euro', () => {
  // The hint's button opens the calculator with the listing's price filled in, as euros.
  it('is not offered the finance calculator', () => {
    expect(read('ui/src/views/listings/ListingDetail.jsx')).toMatch(
      /const financeIncomplete =\s+listing\.currency === 'EUR'/,
    );
  });
});

describe('the map price filter', () => {
  // A bound from a bookmark hides nothing across currencies, so it must not read as active.
  it('does not count a price bound it is not applying', () => {
    const map = read('ui/src/views/listings/Map.jsx');
    expect(map).toMatch(/priceMin: mixedCurrencies \? null : urlPriceMin/);
    expect(map).toMatch(/priceMax: mixedCurrencies \? null : urlPriceMax/);
  });

  // One "price on request" advert in francs must not take the slider away from a page of euros.
  it('decides whether currencies are mixed from priced listings only', () => {
    expect(read('ui/src/views/listings/Map.jsx')).toMatch(
      /const currencies = \[\.\.\.new Set\(listings\.filter\(\(listing\) => listing\.price\)/,
    );
  });
});
