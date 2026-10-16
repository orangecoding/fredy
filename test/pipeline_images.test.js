/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it, vi } from 'vitest';
import { mockFredy } from './utils.js';
import { get as getLastNotification } from './mocks/mockNotification.js';
import { send } from '../lib/notification/adapter/http.js';

const images = [{ url: 'http://example.com/plan.jpg', caption: 'Grundriss', floorPlan: true }];

const listing = (id) => ({
  id,
  title: `listing ${id}`,
  address: 'somewhere',
  price: '900',
  link: `http://example.com/${id}`,
  image: `http://example.com/${id}.jpg`,
});

describe('listing images', () => {
  it('reach the HTTP webhook, and are left out for a listing without any', async () => {
    const Fredy = await mockFredy();
    await new Fredy(
      {
        url: 'http://example.com',
        getListings: () =>
          Promise.resolve([
            { ...listing('gallery'), images },
            { ...listing('none'), images: [] },
          ]),
        normalize: (l) => l,
        filter: () => true,
        crawlFields: { id: 'id', title: 'title', address: 'address', price: 'price' },
        requiredFieldNames: ['id', 'title', 'address', 'price'],
      },
      { id: 'job-images', notificationAdapter: null, specFilter: null, spatialFilter: null },
      'images',
      { checkAndAddEntry: () => false },
      undefined,
    ).execute();

    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await send({
      serviceName: 'images',
      newListings: getLastNotification().payload,
      notificationConfig: [{ id: 'http', fields: { endpointUrl: 'http://example.com/hook' } }],
      jobKey: 'job-images',
      baseUrl: '',
    });

    const [withGallery, without] = JSON.parse(fetchMock.mock.calls[0][1].body).listings;
    expect(withGallery.images).toEqual(images);
    expect(withGallery.imageUrl).toBe('http://example.com/gallery.jpg');
    expect(without).not.toHaveProperty('images');
    expect(without.imageUrl).toBe('http://example.com/none.jpg');
  });

  it('queue the first picture of every listing that survived the filters to be kept', async () => {
    const Fredy = await mockFredy();
    // Mocked in test/utils.js: the download would otherwise run past the end of the test.
    const { enqueuePreviewCapture } = await import('../lib/services/listings/previewCaptureQueue.js');
    vi.mocked(enqueuePreviewCapture).mockClear();

    await new Fredy(
      {
        url: 'http://example.com',
        getListings: () => Promise.resolve([listing('kept'), { ...listing('blank'), image: null }]),
        normalize: (l) => l,
        filter: () => true,
        crawlFields: { id: 'id', title: 'title', address: 'address', price: 'price' },
        requiredFieldNames: ['id', 'title', 'address', 'price'],
      },
      { id: 'job-previews', notificationAdapter: null, specFilter: null, spatialFilter: null },
      'images',
      { checkAndAddEntry: () => false },
      undefined,
    ).execute();

    expect(vi.mocked(enqueuePreviewCapture).mock.calls).toEqual([
      ['kept', 'http://example.com/kept.jpg'],
      ['blank', null],
    ]);
  });
});
