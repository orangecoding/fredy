/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { copyToClipboard } from '../../ui/src/services/clipboard.js';

/**
 * Stand in for the two browsers this has to work on: one that offers the async clipboard API, and
 * one that does not because Fredy is being served over plain http.
 *
 * @param {{ asyncApi?: boolean, asyncFails?: boolean, execFails?: boolean }} options
 */
function stubBrowser({ asyncApi = true, asyncFails = false, execFails = false } = {}) {
  const state = { written: null, appended: [], removed: [], selected: 0, execCommands: [] };

  // `globalThis.navigator` is a getter-only property on Node 22, so it has to be stubbed rather
  // than assigned.
  vi.stubGlobal(
    'navigator',
    asyncApi
      ? {
          clipboard: {
            writeText: async (value) => {
              if (asyncFails) throw new Error('denied');
              state.written = value;
            },
          },
        }
      : {},
  );

  vi.stubGlobal('document', {
    createElement: () => ({
      value: '',
      style: {},
      setAttribute: () => {},
      select: () => (state.selected += 1),
    }),
    body: {
      appendChild: (node) => state.appended.push(node),
      removeChild: (node) => state.removed.push(node),
    },
    execCommand: (command) => {
      state.execCommands.push(command);
      if (execFails) throw new Error('unsupported');
      return true;
    },
  });

  return state;
}

describe('copyToClipboard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the async clipboard API when the browser offers one', async () => {
    const state = stubBrowser();
    await expect(copyToClipboard('hello')).resolves.toBe(true);
    expect(state.written).toBe('hello');
    expect(state.execCommands).toEqual([]);
  });

  it('falls back to a scratch textarea on an origin without the clipboard API', async () => {
    // The common case for self-hosted Fredy: plain http, where navigator.clipboard is undefined.
    const state = stubBrowser({ asyncApi: false });
    await expect(copyToClipboard('hello')).resolves.toBe(true);
    expect(state.execCommands).toEqual(['copy']);
    expect(state.selected).toBe(1);
  });

  it('cleans up the scratch textarea it added to the page', async () => {
    const state = stubBrowser({ asyncApi: false });
    await copyToClipboard('hello');
    expect(state.appended).toHaveLength(1);
    expect(state.removed).toEqual(state.appended);
  });

  it('falls back when the async API exists but the user refused permission', async () => {
    const state = stubBrowser({ asyncFails: true });
    await expect(copyToClipboard('hello')).resolves.toBe(true);
    expect(state.execCommands).toEqual(['copy']);
  });

  it('reports failure rather than throwing when neither path works', async () => {
    stubBrowser({ asyncApi: false, execFails: true });
    await expect(copyToClipboard('hello')).resolves.toBe(false);
  });

  it('removes the scratch textarea even when the copy failed', async () => {
    const state = stubBrowser({ asyncApi: false, execFails: true });
    await copyToClipboard('hello');
    expect(state.removed).toEqual(state.appended);
  });

  it('refuses to report success for an empty text', async () => {
    stubBrowser();
    await expect(copyToClipboard('')).resolves.toBe(false);
    await expect(copyToClipboard(null)).resolves.toBe(false);
  });
});

describe('copyToClipboard outside a browser', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('reports failure when there is no document at all', async () => {
    await expect(copyToClipboard('hello')).resolves.toBe(false);
  });
});
