/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi } from 'vitest';

const root = (await import('node:path')).resolve('.');

/**
 * Load the dispatcher with a made-up set of adapters.
 *
 * @param {Array<{config: Object}>} adapters
 * @returns {Promise<any>} The notify module.
 */
async function loadNotify(adapters) {
  vi.resetModules();
  vi.doMock(root + '/lib/utils.js', async (importOriginal) => ({
    ...(await importOriginal()),
    getNotificationAdapters: async () => adapters,
  }));
  vi.doMock(root + '/lib/services/logger.js', () => ({
    default: { debug: () => {}, info: () => {}, warn: vi.fn(), error: () => {} },
  }));
  return import(root + '/lib/notification/notify.js');
}

describe('notification/notify - deliversApplicationDrafts', () => {
  const drafting = { config: { id: 'drafting', applicationDrafts: true }, send: vi.fn() };
  const plain = { config: { id: 'plain' }, send: vi.fn() };

  it('is true when one of the channels has an adapter that declares drafts', async () => {
    const notify = await loadNotify([drafting, plain]);
    expect(notify.deliversApplicationDrafts([{ id: 'plain' }, { id: 'drafting' }])).toBe(true);
  });

  it('is false when no channel does, or the job has none', async () => {
    const notify = await loadNotify([drafting, plain]);
    expect(notify.deliversApplicationDrafts([{ id: 'plain' }])).toBe(false);
    expect(notify.deliversApplicationDrafts([{ id: 'gone' }])).toBe(false);
    expect(notify.deliversApplicationDrafts([])).toBe(false);
    expect(notify.deliversApplicationDrafts(null)).toBe(false);
  });

  it('is declared by the shipped telegram adapter', async () => {
    vi.resetModules();
    vi.doMock(root + '/lib/services/markdown.js', () => ({ readAdapterReadme: () => '' }));
    vi.doMock(root + '/lib/services/storage/jobStorage.js', () => ({ getJob: () => null }));
    const { config } = await import(root + '/lib/notification/adapter/telegram.js');
    expect(config.applicationDrafts).toBe(true);
  });
});
