/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi } from 'vitest';

import { parse } from '../../../lib/services/extractor/parser/parser.js';
import { config, createConfig } from '../../../lib/provider/sparkasse.js';
import { expectComplete, fixture } from './contract.js';

/**
 * Sparkasse's `fetchListingByUrl`, which reads the exposé's `#__NEXT_DATA__` off the rendered page.
 * The page comes through the same injectable extractor `fetchDetails` takes. See `contract.js`.
 */

const EXPOSE = 'https://immobilien.sparkasse.de/expose/FID-F13-394-004.html';
const SEARCH =
  'https://immobilien.sparkasse.de/immobilien/treffer?estateTypeGroupingId=403&marketingType=buy&perimeter=10&usageType=residential&zipCityEstateId=51.22422%2F6.78006%2F0__D%C3%BCsseldorf';
const browser = { name: 'the caller’s browser' };

/** The extractor, answering every page with `html`, by default the recorded exposé. */
const extractor = (html = fixture('sparkasse_detail.html')) => vi.fn().mockResolvedValue(html);

describe('sparkasse', () => {
  it('reads the exposé into the listing a search run stores', async () => {
    const extractDetails = extractor();
    const listing = await config.fetchListingByUrl(EXPOSE, browser, extractDetails);

    expectComplete(listing);
    expect(extractDetails).toHaveBeenCalledTimes(1);
    expect(extractDetails).toHaveBeenCalledWith(EXPOSE, 'body', expect.objectContaining({ browser }));

    // The same advert sits in the recorded search; parsed the way a run parses it, its card is
    // what the hash and the link have to match.
    const card = parse(config.crawlContainer, config.crawlFields, fixture('sparkasse.html'), SEARCH).find(
      (entry) => entry.id === '/expose/FID-F13-394-004.html',
    );
    const fromSearch = createConfig({ url: SEARCH }).normalize(card);
    expect(listing.id).toBe(fromSearch.id);
    expect(listing.link).toBe(fromSearch.link);
    expect(listing.link).toBe(EXPOSE);

    expect(listing).toMatchObject({
      title: 'Schöne Eigentumswohnung mit Terrasse und kleinem Gartenanteil am Schloßpark Elbroich',
      price: 410000,
      size: 98.54,
      rooms: 4,
      address: '40589 Düsseldorf',
      buildYear: 1993,
      energyClass: 'E',
      latitude: 51.229154802060826,
      longitude: 6.7855269501148285,
    });
    expect(listing.images).toHaveLength(8);
    expect(listing.image).toBe(listing.images[0].url);
    expect(listing.description).toContain('Objektbeschreibung');
  });

  it('settles on the canonical link whatever the shared one carried', async () => {
    const extractDetails = extractor();
    const listing = await config.fetchListingByUrl(
      `${EXPOSE}?utm_source=newsletter&ref=merkliste#galerie`,
      browser,
      extractDetails,
    );

    expect(listing.link).toBe(EXPOSE);
    expect(extractDetails).toHaveBeenCalledWith(EXPOSE, 'body', expect.anything());
  });

  it('answers null for a URL that names no exposé, without loading a page', async () => {
    const extractDetails = extractor();
    for (const url of [
      SEARCH,
      'https://immobilien.sparkasse.de/',
      'https://immobilien.sparkasse.de/expose/',
      'https://immobilien.sparkasse.de/expose/FID-F13-394-004',
      'not a url',
    ]) {
      expect(await config.fetchListingByUrl(url, browser, extractDetails)).toBeNull();
    }
    expect(extractDetails).not.toHaveBeenCalled();
  });

  it('answers null when the page is blocked, empty or breaks', async () => {
    expect(await config.fetchListingByUrl(EXPOSE, browser, extractor(null))).toBeNull();
    expect(await config.fetchListingByUrl(EXPOSE, browser, extractor('<html><body></body></html>'))).toBeNull();
    // A page of the same Next.js app that carries no estate.
    expect(
      await config.fetchListingByUrl(
        EXPOSE,
        browser,
        extractor('<script id="__NEXT_DATA__">{"props":{"pageProps":{}}}</script>'),
      ),
    ).toBeNull();
    expect(
      await config.fetchListingByUrl(EXPOSE, browser, extractor('<script id="__NEXT_DATA__">{not json</script>')),
    ).toBeNull();
    expect(
      await config.fetchListingByUrl(EXPOSE, browser, vi.fn().mockRejectedValue(new Error('browser went away'))),
    ).toBeNull();
  });
});
