/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { readFile } from 'node:fs/promises';
import { describe, it, expect } from 'vitest';
import {
  DEAL_TYPES,
  normalizeDealType,
  detectDealTypeFromUrl,
  detectDealTypeForJob,
  dealTypeForPrice,
} from '../../lib/services/dealType.js';

const providerConfig = JSON.parse(await readFile(new URL('../provider/testProvider.json', import.meta.url), 'utf-8'));

describe('normalizeDealType', () => {
  it('accepts the two known types, case-insensitively', () => {
    expect(normalizeDealType('rent')).toBe('rent');
    expect(normalizeDealType('BUY')).toBe('buy');
    expect(normalizeDealType(' Rent ')).toBe('rent');
  });

  it('rejects anything else', () => {
    for (const value of ['mixed', 'lease', '', null, undefined, 5, {}]) {
      expect(normalizeDealType(value)).toBeNull();
    }
  });
});

describe('detectDealTypeFromUrl', () => {
  // The real search URLs Fredy ships in its provider fixtures, with the type each one describes.
  // These are the URLs existing jobs will actually carry when the migration runs.
  const fixtures = {
    einsAImmobilien: 'buy', // .../wohnung-kaufen.html
    immobilienDe: 'rent', // search.typ=mieten
    immowelt: 'buy', // distributionTypes=Buy,...
    immoscout: 'rent', // .../wohnung-mieten
    immoswp: 'rent', // t=apartment:rental
    ohneMakler: 'buy', // .../wohnung-kaufen/...
    neubauKompass: 'buy', // .../eigentumswohnung/
    regionalimmobilien24: 'buy', // .../kaufen/haus/
    sparkasse: 'buy', // marketingType=buy
    schwarzesbrett: 'rent', // .../mietobjekte
    deutscheWohnen: 'rent', // rentType=miete&...
    wohnungsboerse: 'buy', // marketing_type=kauf
  };

  for (const [provider, expected] of Object.entries(fixtures)) {
    it(`classifies the shipped ${provider} URL as ${expected}`, () => {
      expect(detectDealTypeFromUrl(providerConfig[provider].url)).toBe(expected);
    });
  }

  it('classifies the opposite of each portal too', () => {
    expect(
      detectDealTypeFromUrl('https://www.immobilienscout24.de/Suche/de/nordrhein-westfalen/duesseldorf/wohnung-kaufen'),
    ).toBe('buy');
    expect(detectDealTypeFromUrl('https://www.immowelt.de/classified-search?distributionTypes=Rent')).toBe('rent');
    expect(detectDealTypeFromUrl('https://immobilien.sparkasse.de/immobilien/treffer?marketingType=rent')).toBe('rent');
    expect(detectDealTypeFromUrl('https://immo.swp.de/suchergebnisse?t=apartment%3Apurchase')).toBe('buy');
  });

  it('returns null when the URL genuinely does not say', () => {
    // Bare kleinanzeigen / wg-gesucht / inberlinwohnen / mcMakler roots carry no rent/buy token.
    expect(detectDealTypeFromUrl(providerConfig.kleinanzeigen.url)).toBeNull();
    expect(detectDealTypeFromUrl(providerConfig.wgGesucht.url)).toBeNull();
    expect(detectDealTypeFromUrl(providerConfig.inberlinwohnen.url)).toBeNull();
    expect(detectDealTypeFromUrl(providerConfig.mcMakler.url)).toBeNull();
  });

  it('returns null when both families of tokens appear', () => {
    expect(detectDealTypeFromUrl('https://example.de/wohnung-mieten-und-kaufen')).toBeNull();
  });

  it('does not match kauf inside verkauf', () => {
    // A section named only "Verkauf-und-Angebote" is ambiguous, not a purchase.
    expect(detectDealTypeFromUrl('https://schwarzesbrett.bremen.de/verkauf-und-angebote/')).toBeNull();
  });

  it('does not match rent inside unrelated words', () => {
    expect(detectDealTypeFromUrl('https://example.de/current/parent/torrent')).toBeNull();
  });

  it('handles missing or malformed input', () => {
    expect(detectDealTypeFromUrl(null)).toBeNull();
    expect(detectDealTypeFromUrl('')).toBeNull();
    expect(detectDealTypeFromUrl('   ')).toBeNull();
    // A malformed escape sequence must not throw; it falls back to the raw string.
    expect(detectDealTypeFromUrl('https://example.de/wohnung-kaufen%ZZ')).toBe('buy');
  });
});

describe('detectDealTypeForJob', () => {
  it('takes the first provider URL that says something', () => {
    const providers = [{ url: providerConfig.kleinanzeigen.url }, { url: providerConfig.immoscout.url }];
    expect(detectDealTypeForJob(providers)).toBe(DEAL_TYPES.RENT);
  });

  it('returns null when none of the URLs say', () => {
    expect(
      detectDealTypeForJob([{ url: providerConfig.kleinanzeigen.url }, { url: providerConfig.wgGesucht.url }]),
    ).toBeNull();
  });

  it('tolerates a non-array', () => {
    expect(detectDealTypeForJob(null)).toBeNull();
    expect(detectDealTypeForJob(undefined)).toBeNull();
  });
});

describe('dealTypeForPrice', () => {
  it('reads a price above the threshold as a purchase', () => {
    expect(dealTypeForPrice(250000, 30000)).toBe(DEAL_TYPES.BUY);
  });

  it('reads a price below the threshold as a rent', () => {
    expect(dealTypeForPrice(1200, 30000)).toBe(DEAL_TYPES.RENT);
  });

  it('treats the threshold itself as a purchase', () => {
    expect(dealTypeForPrice(30000, 30000)).toBe(DEAL_TYPES.BUY);
  });

  it('returns null when there is no usable price', () => {
    expect(dealTypeForPrice(null, 30000)).toBeNull();
    expect(dealTypeForPrice(0, 30000)).toBeNull();
    expect(dealTypeForPrice('n/a', 30000)).toBeNull();
  });
});
