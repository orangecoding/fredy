/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../../lib/services/storage/jobStorage.js', () => ({
  getJob: (jobKey) => ({ id: jobKey, userId: 'user_123' }),
}));

vi.mock('../../lib/services/markdown.js', () => ({
  readAdapterReadme: () => '',
}));

vi.mock('../../lib/services/sse/sse-broker.js', () => ({
  sendToUser: vi.fn(),
}));

vi.mock('../../lib/services/push/webPushService.js', () => ({
  sendPushToUser: vi.fn(async () => ({ sent: 1, failed: 0, removed: 0 })),
}));

vi.mock('../../lib/services/logger.js', () => ({
  default: { warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

let send;
let sendPriceChange;
let mockSendToUser;
let mockSendPush;

beforeEach(async () => {
  vi.resetModules();
  const sseBroker = await import('../../lib/services/sse/sse-broker.js');
  mockSendToUser = sseBroker.sendToUser;
  mockSendToUser.mockReset();
  mockSendPush = (await import('../../lib/services/push/webPushService.js')).sendPushToUser;
  mockSendPush.mockClear();

  ({ send, sendPriceChange } = await import('../../lib/notification/adapter/browser.js'));
});

describe('browser notification adapter', () => {
  it('should broadcast listings:new to the user when userId is present', async () => {
    const listing1 = {
      id: 'listing_1',
      title: 'Schöne Wohnung',
      price: '1.200 €',
      size: '80 m²',
      address: 'Musterstraße 1, Berlin',
      link: 'https://example.com/1',
      image: 'https://example.com/image.png',
    };

    await send({
      serviceName: 'immoscout',
      newListings: [listing1],
      jobKey: 'Job_Berlin',
      baseUrl: 'http://localhost:9998',
    });

    expect(mockSendToUser).toHaveBeenCalledTimes(1);
    expect(mockSendToUser).toHaveBeenCalledWith('user_123', 'notification:browser', {
      id: 'listing_1',
      title: 'Schöne Wohnung',
      body: 'Price: 1.200 € | Size: 80 m²\nAddress: Musterstraße 1, Berlin',
      link: 'https://example.com/1',
      image: 'https://example.com/image.png',
      tag: 'fredy-listing-listing_1',
      jobKey: 'Job_Berlin',
      serviceName: 'immoscout',
    });
  });

  it('should fall back to default values when fields are missing', async () => {
    const listing2 = {
      id: 'listing_2',
    };

    await send({
      serviceName: 'immoscout',
      newListings: [listing2],
      jobKey: 'Job_Berlin',
      baseUrl: 'http://localhost:9998',
    });

    expect(mockSendToUser).toHaveBeenCalledTimes(1);
    expect(mockSendToUser).toHaveBeenCalledWith('user_123', 'notification:browser', {
      id: 'listing_2',
      title: 'New Listing Found',
      body: '',
      link: 'http://localhost:9998/#/listings/listing/listing_2',
      image: undefined,
      tag: 'fredy-listing-listing_2',
      jobKey: 'Job_Berlin',
      serviceName: 'immoscout',
    });
  });

  it('should support explicit userId override (such as during test calls)', async () => {
    const listing3 = {
      id: 'listing_3',
    };

    await send({
      serviceName: 'immoscout',
      newListings: [listing3],
      jobKey: 'TestJob',
      baseUrl: 'http://localhost:9998',
      userId: 'test_user_override',
    });

    expect(mockSendToUser).toHaveBeenCalledTimes(1);
    expect(mockSendToUser).toHaveBeenCalledWith('test_user_override', 'notification:browser', {
      id: 'listing_3',
      title: 'New Listing Found',
      body: '',
      link: 'http://localhost:9998/#/listings/listing/listing_3',
      image: undefined,
      tag: 'fredy-listing-listing_3',
      jobKey: 'TestJob',
      serviceName: 'immoscout',
    });
  });

  it('also sends each listing as Web Push to the user’s devices, opening it in Fredy', async () => {
    await send({
      serviceName: 'immoscout',
      newListings: [
        {
          id: 'l1',
          title: 'One',
          price: '900 €',
          link: 'https://portal.example/1',
          image: 'https://cdn.example/1.jpg',
        },
        { id: 'l2', title: 'Two' },
      ],
      jobKey: 'Job_Berlin',
      baseUrl: 'http://localhost:9998',
    });

    await vi.waitFor(() => expect(mockSendPush).toHaveBeenCalledTimes(2));
    expect(mockSendPush).toHaveBeenNthCalledWith(
      1,
      'user_123',
      {
        title: 'One',
        body: 'Price: 900 €',
        url: '/#/listings/listing/l1',
        tag: 'fredy-listing-l1',
        image: 'https://cdn.example/1.jpg',
      },
      { urgency: 'high' },
    );
  });

  it('does not fail the channel when push fails', async () => {
    mockSendPush.mockRejectedValueOnce(new Error('push service down'));
    await expect(
      send({ serviceName: 'immoscout', newListings: [{ id: 'l1' }], jobKey: 'Job_Berlin', baseUrl: '' }),
    ).resolves.toBeUndefined();
    expect(mockSendToUser).toHaveBeenCalledTimes(1);
  });

  it('does not hold up the job run while the push service is slow', async () => {
    let finishPush;
    mockSendPush.mockImplementationOnce(() => new Promise((resolve) => (finishPush = resolve)));

    await send({
      serviceName: 'immoscout',
      newListings: [{ id: 'l1' }, { id: 'l2' }],
      jobKey: 'Job_Berlin',
      baseUrl: '',
    });

    // `send` is done although the first push has not answered, and the second waits its turn.
    expect(mockSendToUser).toHaveBeenCalledTimes(2);
    expect(mockSendPush).toHaveBeenCalledTimes(1);

    finishPush({ sent: 1, failed: 0, removed: 0 });
    await vi.waitFor(() => expect(mockSendPush).toHaveBeenCalledTimes(2));
  });

  it('opens the notification settings from the push of a channel test, not the sample listing', async () => {
    await send({
      serviceName: 'TestCall',
      newListings: [{ id: '1', title: 'Sample' }],
      jobKey: 'TestJob',
      baseUrl: '',
      userId: 'test_user_override',
      isTest: true,
    });

    expect(mockSendPush).toHaveBeenCalledWith(
      'test_user_override',
      expect.objectContaining({ url: '/#/settings/notifications', tag: 'fredy-listing-1' }),
      { urgency: 'high' },
    );
  });

  it('pushes price changes with their own tag', async () => {
    await sendPriceChange({
      serviceName: 'immoscout',
      priceChanges: [
        {
          id: 'l1',
          title: 'One',
          address: 'Musterstraße 1',
          changeHeadline: 'Price drop',
          oldPrice: '1.000 €',
          newPrice: '900 €',
          changePercent: '-10%',
          direction: 'down',
        },
      ],
      jobKey: 'Job_Berlin',
      baseUrl: 'http://localhost:9998',
    });

    expect(mockSendToUser).toHaveBeenCalledWith(
      'user_123',
      'notification:priceChange',
      expect.objectContaining({ tag: 'fredy-price-l1' }),
    );
    expect(mockSendPush).toHaveBeenCalledWith(
      'user_123',
      {
        title: 'Price drop: 1.000 € -> 900 € (-10%)',
        body: 'One\nAddress: Musterstraße 1',
        url: '/#/listings/listing/l1',
        tag: 'fredy-price-l1',
        image: undefined,
      },
      { urgency: 'normal' },
    );
  });
});
