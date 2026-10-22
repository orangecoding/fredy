/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const detail = fs.readFileSync(path.join(root, 'ui/src/views/listings/ListingDetail.jsx'), 'utf-8');

/**
 * Every action on the detail page (watch, status, note, scam verdict, cover letter) reloads the
 * listing, which arrives as a new object with a new travel-times array. The map effect hung on
 * that object, so each click redrew every marker and moved the camera back to the overview.
 */
describe('the detail map across a reload of the same listing', () => {
  it('draws from the listing by value, not from the object the reload replaces', () => {
    const deps = detail.match(/mapInstance\.off\('styledata', drawRoute\);[\s\S]*?\}, \[([^\]]*)\]\);/)?.[1];
    expect(deps).toBeDefined();
    expect(deps.split(',').map((d) => d.trim())).not.toContain('listing');
    expect(deps).toContain('mapListing');
    expect(detail).toMatch(/\[listing\?\.id, listing\?\.latitude, listing\?\.longitude, listing\?\.address\]/);
  });

  it('keeps the refined route when the times come back the same', () => {
    expect(detail).toMatch(/\}, \[listing\?\.id, listingTravelTimesKey\]\);/);
  });
});
