/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { buildHash } from '../../../lib/utils.js';
import { expectComplete, fixture } from './contract.js';

/**
 * immobilien.de's `fetchListingByUrl`, which renders the exposé in the browser it is handed, the
 * way `fetchDetails` does. See `contract.js`.
 */

vi.mock('../../../lib/services/extractor/puppeteerExtractor.js', () => ({ default: vi.fn() }));
vi.mock('../../../lib/services/logger.js', () => ({
  default: { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const { default: puppeteerExtractor } = await import('../../../lib/services/extractor/puppeteerExtractor.js');
const { config, parseListings } = await import('../../../lib/provider/immobilienDe.js');

const EXPOSE = 'https://www.immobilien.de/expose/10061004';
const BROWSER = { fake: 'browser' };

beforeEach(() => {
  puppeteerExtractor.mockReset();
  puppeteerExtractor.mockResolvedValue(fixture('immobilienDe_detail.html'));
});

describe('immobilienDe', () => {
  it('reads the exposé into the listing a search run stores', async () => {
    const listing = await config.fetchListingByUrl(EXPOSE, BROWSER);

    expectComplete(listing);
    expect(puppeteerExtractor).toHaveBeenCalledTimes(1);
    expect(puppeteerExtractor.mock.calls[0][0]).toBe(EXPOSE);
    expect(puppeteerExtractor.mock.calls[0][2]).toMatchObject({ browser: BROWSER });

    // The same advert sits in the recorded search, so what a run computes for it is known exactly.
    const card = parseListings(fixture('immobilienDe.html')).find((entry) => entry.legacyId === 10061004);
    const searched = config.normalize(card);
    expect(listing.id).toBe(searched.id);
    expect(listing.id).toBe(buildHash('10061004', String(card.price)));
    expect(listing.link).toBe(searched.link);
    expect(listing.link).toBe(EXPOSE);
    expect(listing.image).toBe(searched.image);
    expect(listing.images).toEqual(searched.images);

    expect(listing).toMatchObject({
      title: 'Wunderschöne möblierte Dachgeschosswohnung in Düsseldorf-Hassels',
      price: 1092,
      size: 52,
      rooms: 2,
      address: '40599 Düsseldorf',
      energyClass: 'F',
    });
    expect(listing.images).toHaveLength(13);
    expect(listing.description).toContain('4-Parteienhaus in Düsseldorf-Hassels');
  });

  it('settles on the canonical link whatever the shared one carried', async () => {
    const listing = await config.fetchListingByUrl(`${EXPOSE}/?utm_source=newsletter&ref=share#bilder`, BROWSER);

    expect(listing.link).toBe(EXPOSE);
    // The tracker's parameters are not sent to the portal either.
    expect(puppeteerExtractor.mock.calls[0][0]).toBe(EXPOSE);
  });

  it('answers null for a URL that names no exposé, without opening a page', async () => {
    for (const url of [
      'https://www.immobilien.de/suche?kategorie=wohnen&typ=mieten&ort=D%C3%BCsseldorf',
      'https://www.immobilien.de/',
      'https://www.immobilien.de/expose/',
      'https://www.immobilien.de/mieten/wohnung/duesseldorf/',
      'not a url',
    ]) {
      expect(await config.fetchListingByUrl(url, BROWSER)).toBeNull();
    }
    expect(puppeteerExtractor).not.toHaveBeenCalled();
  });

  it('answers null when the page is a bot wall or carries no exposé', async () => {
    // The extractor answers null for a page it recognised as a bot wall.
    puppeteerExtractor.mockResolvedValue(null);
    expect(await config.fetchListingByUrl(EXPOSE, BROWSER)).toBeNull();

    // A removed advert renders a page without the exposé record, the search page among others.
    puppeteerExtractor.mockResolvedValue(fixture('immobilienDe.html'));
    expect(await config.fetchListingByUrl(EXPOSE, BROWSER)).toBeNull();

    puppeteerExtractor.mockResolvedValue('<html><body>Seite nicht gefunden</body></html>');
    expect(await config.fetchListingByUrl(EXPOSE, BROWSER)).toBeNull();

    puppeteerExtractor.mockRejectedValue(new Error('net::ERR_CONNECTION_RESET'));
    expect(await config.fetchListingByUrl(EXPOSE, BROWSER)).toBeNull();
  });

  it('answers null for an exposé record without a title', async () => {
    puppeteerExtractor.mockResolvedValue(
      fixture('immobilienDe_detail.html').replace(
        '\\"title\\":\\"Wunderschöne möblierte Dachgeschosswohnung in Düsseldorf-Hassels\\",\\"marketingType\\"',
        '\\"title\\":\\"$undefined\\",\\"marketingType\\"',
      ),
    );
    expect(await config.fetchListingByUrl(EXPOSE, BROWSER)).toBeNull();
  });
});
