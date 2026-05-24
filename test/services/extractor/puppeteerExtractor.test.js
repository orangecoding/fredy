/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock the CloakBrowser launcher so no real Chromium binary is needed and we can
// assert which options get forwarded to it.
const { launchMock } = vi.hoisted(() => ({ launchMock: vi.fn() }));

vi.mock('cloakbrowser/puppeteer', () => ({
  launch: launchMock,
}));

const { launchBrowser } = await import('../../../lib/services/extractor/puppeteerExtractor.js');

describe('launchBrowser proxy forwarding', () => {
  beforeEach(() => {
    launchMock.mockReset();
    launchMock.mockResolvedValue({ close: async () => {} });
  });

  it('forwards proxyUrl to CloakBrowser as the proxy option', async () => {
    await launchBrowser('https://www.immowelt.de/', { proxyUrl: 'http://user:pass@host:8080' });

    expect(launchMock).toHaveBeenCalledTimes(1);
    expect(launchMock.mock.calls[0][0]).toMatchObject({ proxy: 'http://user:pass@host:8080' });
  });

  it('does not set a proxy when no proxyUrl is given', async () => {
    await launchBrowser('https://www.immowelt.de/', {});

    expect(launchMock).toHaveBeenCalledTimes(1);
    expect(launchMock.mock.calls[0][0].proxy).toBeUndefined();
  });
});
