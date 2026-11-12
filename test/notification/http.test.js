/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { send } from '../../lib/notification/adapter/http.js';

const card = {
  id: 'abc',
  title: '2-Zimmer-Wohnung',
  address: 'Hauptstraße 1, 69115 Heidelberg',
  description: 'Helle Wohnung',
  price: '890 €',
  size: '54 m²',
  link: 'https://example.com/expose/abc',
  image: 'https://example.com/abc.jpg',
};

async function postedListing(listing) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetchMock);
  await send({
    serviceName: 'immowelt',
    newListings: [listing],
    notificationConfig: [{ id: 'http', fields: { endpointUrl: 'https://example.com/hook' } }],
    jobKey: 'job-1',
    baseUrl: '',
  });
  return JSON.parse(fetchMock.mock.calls[0][1].body).listings[0];
}

describe('http adapter - listing facts', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends what the listing knows beyond the card', async () => {
    const posted = await postedListing({
      ...card,
      rooms: '2 Zimmer',
      buildYear: 1972,
      energyClass: 'D',
      currency: 'EUR',
      chargesIncluded: false,
      charges: 180,
      publishedAt: Date.UTC(2026, 10, 9, 8, 0, 0),
      latitude: 49.41,
      longitude: 8.69,
      market_median_sqm: 15.2,
      market_sample_size: 23,
      market_radius_km: 2,
    });

    expect(posted).toMatchObject({
      rooms: '2 Zimmer',
      buildYear: 1972,
      energyClass: 'D',
      currency: 'EUR',
      chargesIncluded: false,
      charges: 180,
      publishedAt: '2026-11-09T08:00:00.000Z',
      latitude: 49.41,
      longitude: 8.69,
      market: { medianPricePerSqm: 15.2, sampleSize: 23, radiusKm: 2 },
    });
  });

  it('leaves a fact out rather than sending null when the listing does not know it', async () => {
    const posted = await postedListing({
      ...card,
      rooms: null,
      buildYear: null,
      energyClass: '',
      latitude: 49.41,
    });

    for (const key of [
      'rooms',
      'buildYear',
      'energyClass',
      'currency',
      'chargesIncluded',
      'charges',
      'publishedAt',
      'latitude',
      'longitude',
      'market',
    ]) {
      expect(posted).not.toHaveProperty(key);
    }
    // The card itself is unchanged.
    expect(posted).toMatchObject({ id: 'abc', price: '890 €', size: '54 m²', url: card.link, imageUrl: card.image });
  });
});
