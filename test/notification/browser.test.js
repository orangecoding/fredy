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

let send;
let mockSendToUser;

beforeEach(async () => {
  vi.resetModules();
  const sseBroker = await import('../../lib/services/sse/sse-broker.js');
  mockSendToUser = sseBroker.sendToUser;
  mockSendToUser.mockReset();

  ({ send } = await import('../../lib/notification/adapter/browser.js'));
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
      jobKey: 'TestJob',
      serviceName: 'immoscout',
    });
  });
});
