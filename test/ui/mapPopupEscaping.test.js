/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf-8');

/**
 * MapLibre's `setHTML` is `innerHTML`, and the strings these popups are built from - a listing's
 * address, title and image URL, a place name from OpenStreetMap - were written by somebody else.
 * Interpolated raw, a `<img onerror=...>` in a scraped address ran script in Fredy's own origin.
 */
describe('map popups built from strings', () => {
  /**
   * Every `${...}` inside the template literal passed to `setHTML(...)`.
   *
   * @param {string} source
   * @returns {string[]}
   */
  function interpolationsInSetHtml(source) {
    const calls = [...source.matchAll(/setHTML\(\s*`([\s\S]*?)`\s*,?\s*\)/g)].map((match) => match[1]);
    return calls.flatMap((template) => [...template.matchAll(/\$\{([^}]*)\}/g)].map((match) => match[1].trim()));
  }

  for (const file of ['ui/src/views/listings/ListingDetail.jsx', 'ui/src/views/listings/Map.jsx']) {
    it(`escapes everything but translations in ${path.basename(file)}`, () => {
      const interpolations = interpolationsInSetHtml(read(file));
      expect(interpolations.length).toBeGreaterThan(0);
      for (const expression of interpolations) {
        expect(expression, expression).toMatch(/^(escapeHtml\(|t\()/);
      }
    });
  }

  it('escapes the image URL and the formatted numbers of the listing popup', () => {
    const popup = read('ui/src/views/listings/listingPopupContent.jsx');
    expect(popup).toMatch(/src="\$\{escapeHtml\(listing\.image_url/);
    expect(popup).toMatch(/escapeHtml\(formatEuroPrice\(/);
    expect(popup).toMatch(/escapeHtml\(formatDecimal\(/);
    expect(popup).not.toMatch(/src="\$\{listing\.image_url\}"/);
  });
});
