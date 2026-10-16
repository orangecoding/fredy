/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toListingImages } from '../../lib/utils/listingImages.js';
import { config as immoscout } from '../../lib/provider/immoscout.js';
import { config as immowelt } from '../../lib/provider/immowelt.js';
import { config as seloger } from '../../lib/provider/seloger.js';
import { config as kleinanzeigen } from '../../lib/provider/kleinanzeigen.js';
import { config as deutscheWohnen } from '../../lib/provider/deutscheWohnen.js';
import * as immobilienDe from '../../lib/provider/immobilienDe.js';
import * as engelVoelkers from '../../lib/provider/engelVoelkers.js';
import puppeteerExtractor from '../../lib/services/extractor/puppeteerExtractor.js';

vi.mock('../../lib/services/extractor/puppeteerExtractor.js', () => ({ default: vi.fn() }));
const fixture = (name) => readFileSync(new URL(`../testFixtures/${name}`, import.meta.url), 'utf8');
const json = (name) => JSON.parse(fixture(name));
afterEach(() => vi.unstubAllGlobals());

describe('listing images', () => {
  it('keeps absolute urls, each once', () => {
    expect(toListingImages(['https://a.de/1.jpg', { url: 'https://a.de/1.jpg' }, '$undefined', null])).toEqual([
      { url: 'https://a.de/1.jpg' },
    ]);
    expect(toListingImages(undefined)).toEqual([]);
  });

  it('puts floor plans first, so the cap of 20 does not cut them', () => {
    const pictures = Array.from({ length: 25 }, (_, i) => ({ url: `https://a.de/${i}.jpg`, caption: 'Küche' }));
    const images = toListingImages([...pictures, { url: 'https://a.de/plan.jpg', caption: ' Grundriss EG ' }]);
    expect(images).toHaveLength(20);
    expect(images[0]).toEqual({ url: 'https://a.de/plan.jpg', caption: 'Grundriss EG', floorPlan: true });
    expect(images[1]).toEqual({ url: 'https://a.de/0.jpg', caption: 'Küche' });
  });

  it('reads the ImmoScout24 exposé gallery', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => json('immoscout_detail.json') }));
    const { images } = await immoscout.fetchDetails({ link: 'https://www.immobilienscout24.de/expose/1' });
    expect(images).toHaveLength(16);
    expect(images.slice(0, 3).map((image) => image.caption)).toEqual([
      'Grundriss EG',
      'Grundriss OG',
      'Wohn- und Arbeitsbereich_TITEL',
    ]);
  });

  it('skips the ad slot and the hash captions of ImmoScout24 Austria', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => json('immoscoutAt_detail.json') }));
    const { images } = await immoscout.fetchDetails({ link: 'https://www.immobilienscout24.at/expose/1' });
    expect(images).toHaveLength(9);
    expect(images.every((image) => image.caption == null)).toBe(true);
  });

  it('takes the whole Immowelt and SeLoger card gallery', () => {
    const [mitte] = json('immowelt_classifieds.json').map(immowelt.normalize);
    expect(mitte.images.map((image) => image.url)).toEqual([mitte.image, expect.stringContaining('/39704533-')]);
    expect(seloger.normalize(json('seloger_classifieds.json')[0]).images).toHaveLength(8);
  });

  it('reads the Kleinanzeigen gallery from the detail page', async () => {
    puppeteerExtractor.mockResolvedValue(fixture('kleinanzeigen_detail.html'));
    const { images } = await kleinanzeigen.fetchDetails({ id: 'k', link: '/s-anzeige/x/1' });
    expect(images).toHaveLength(20);
    expect(images[0]).toMatchObject({ caption: 'Grundriss', floorPlan: true });
  });

  it('takes the Deutsche Wohnen gallery at exposé size, without the campaign banners', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => json('deutscheWohnen_list.json') }));
    const [first] = await deutscheWohnen.getListings('https://www.deutsche-wohnen.com/api/deuwo-real-estate/list');
    expect(deutscheWohnen.normalize(first).images).toEqual([
      { url: 'https://cdn.expose.vonovia.de/DeuWo-000000576.jpg?width=960' },
      { url: 'https://cdn.expose.vonovia.de/DeuWo-000000584.jpg?width=960' },
      { url: 'https://cdn.expose.vonovia.de/DeuWo-000000574.jpg?width=960' },
    ]);
  });

  it('takes the immobilien.de gallery from the search page', () => {
    const [listing] = immobilienDe.parseListings(fixture('immobilienDe.html')).map(immobilienDe.config.normalize);
    expect(listing.images).toHaveLength(13);
    expect(listing.images[0].url).toBe(listing.image);
  });

  it('takes the Engel & Völkers gallery from the search page', () => {
    const [listing] = engelVoelkers
      .parseListings(fixture('engelVoelkers.html'))
      .map((raw) => engelVoelkers.config.normalize(raw, 'https://www.engelvoelkers.com/de/de/propertysearch'));
    expect(listing.images).toHaveLength(10);
    expect(listing.images[0].url).toBe(listing.image);
  });
});
