/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const root = (await import('node:path')).resolve('.');
const utilsPath = root + '/lib/utils.js';
const loggerPath = root + '/lib/services/logger.js';

let adapters;

/**
 * Load the dispatcher with a made-up set of adapters.
 *
 * @returns {Promise<any>} The notify module.
 */
async function loadNotify() {
  vi.resetModules();
  vi.doMock(utilsPath, async (importOriginal) => ({
    ...(await importOriginal()),
    getNotificationAdapters: async () => adapters,
  }));
  vi.doMock(loggerPath, () => ({
    default: { debug: () => {}, info: () => {}, warn: vi.fn(), error: () => {} },
  }));
  return import(root + '/lib/notification/notify.js');
}

const change = {
  id: 'l1',
  title: 'A flat',
  link: 'https://example.com/l1',
  address: 'Somewhere 1',
  oldPrice: '1200 €',
  newPrice: '1100 €',
  changePercent: '-8.3 %',
  direction: 'down',
  changeHeadline: 'Price reduced',
};

beforeEach(() => {
  adapters = [];
});

describe('notification/notify - price changes', () => {
  it('calls sendPriceChange on an adapter that implements it', async () => {
    const modern = { config: { id: 'modern' }, send: vi.fn(), sendPriceChange: vi.fn(() => Promise.resolve()) };
    adapters = [modern];
    const notify = await loadNotify();

    notify.sendPriceChange('immowelt', [change], [{ id: 'modern' }], 'job1', 'https://fredy.example');

    expect(modern.sendPriceChange).toHaveBeenCalledTimes(1);
    expect(modern.send).not.toHaveBeenCalled();
    expect(modern.sendPriceChange.mock.calls[0][0]).toMatchObject({
      serviceName: 'immowelt',
      jobKey: 'job1',
      baseUrl: 'https://fredy.example',
    });
  });

  // Third-party adapters written before price tracking existed still have to get something, and it
  // has to read as a price change rather than as a brand new listing.
  it('falls back to send() with the change folded into the title', async () => {
    const legacy = { config: { id: 'legacy' }, send: vi.fn(() => Promise.resolve()) };
    adapters = [legacy];
    const notify = await loadNotify();

    notify.sendPriceChange('immowelt', [change], [{ id: 'legacy' }], 'job1', 'https://fredy.example');

    expect(legacy.send).toHaveBeenCalledTimes(1);
    const sentTitle = legacy.send.mock.calls[0][0].newListings[0].title;
    expect(sentTitle).toContain('Price reduced');
    expect(sentTitle).toContain('1200 €');
    expect(sentTitle).toContain('1100 €');
    expect(sentTitle).toContain('A flat');
  });

  it('fans out to every configured adapter and ignores the rest', async () => {
    const a = { config: { id: 'a' }, sendPriceChange: vi.fn(() => Promise.resolve()) };
    const b = { config: { id: 'b' }, sendPriceChange: vi.fn(() => Promise.resolve()) };
    const unused = { config: { id: 'unused' }, sendPriceChange: vi.fn(() => Promise.resolve()) };
    adapters = [a, b, unused];
    const notify = await loadNotify();

    const promises = notify.sendPriceChange('immowelt', [change], [{ id: 'a' }, { id: 'b' }], 'job1', '');

    expect(promises).toHaveLength(2);
    expect(a.sendPriceChange).toHaveBeenCalled();
    expect(b.sendPriceChange).toHaveBeenCalled();
    expect(unused.sendPriceChange).not.toHaveBeenCalled();
  });

  it('skips an adapter id that no longer resolves rather than throwing', async () => {
    adapters = [{ config: { id: 'a' }, sendPriceChange: vi.fn(() => Promise.resolve()) }];
    const notify = await loadNotify();

    const promises = notify.sendPriceChange('immowelt', [change], [{ id: 'gone' }], 'job1', '');

    expect(promises).toHaveLength(0);
  });
});

// The matching check against the adapters Fredy really ships lives in `shippedAdapters.test.js`.
// It cannot run here: every case above replaces `lib/utils.js` with a mock, and unmocking it well
// enough to load the real adapter directory raced the concurrent imports those adapters trigger.
