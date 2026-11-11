/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock both engines' launchers so no real Chromium binary is needed and we can
// assert which options get forwarded to them.
const { launchMock, serveMock, connectMock, usesClearcoteMock } = vi.hoisted(() => ({
  launchMock: vi.fn(),
  serveMock: vi.fn(),
  connectMock: vi.fn(),
  usesClearcoteMock: vi.fn(() => false),
}));

vi.mock('cloakbrowser/puppeteer', () => ({
  launch: launchMock,
}));

vi.mock('clearcote', () => ({
  serve: serveMock,
}));

vi.mock('puppeteer-core', () => ({
  default: { connect: connectMock },
}));

vi.mock('../../../lib/services/extractor/browserEngine.js', () => ({
  usesClearcote: usesClearcoteMock,
  browserEngineName: () => (usesClearcoteMock() ? 'Clearcote' : 'CloakBrowser'),
}));

const { launchBrowser, closeBrowser } = await import('../../../lib/services/extractor/puppeteerExtractor.js');

/** @param {string} platform the value `process.platform` should report */
function pretendPlatform(platform) {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
}

/**
 * A Clearcote server test double, as `serve()` hands it back.
 *
 * @returns {{cdpUrl: string, close: import('vitest').Mock}}
 */
function createServer() {
  return { cdpUrl: 'http://127.0.0.1:9333', close: vi.fn(async () => {}) };
}

/**
 * Builds a browser test double around a fake Chromium child process.
 *
 * @param {object} [options]
 * @param {boolean} [options.closeFails] let `close()` reject, as it does once the CDP connection died
 * @param {boolean} [options.alive] whether the child process is still running when `close()` returned
 * @returns {{browser: object, childProcess: object, close: import('vitest').Mock}}
 */
function createBrowser({ closeFails = false, alive = true } = {}) {
  const childProcess = {
    pid: 4711,
    exitCode: alive ? null : 0,
    signalCode: null,
    kill: vi.fn(() => true),
  };
  const close = vi.fn(async () => {
    if (closeFails) throw new Error('Connection closed');
  });
  return { browser: { close, process: () => childProcess }, childProcess, close };
}

describe('launchBrowser proxy forwarding', () => {
  beforeEach(() => {
    usesClearcoteMock.mockReturnValue(false);
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

describe('launchBrowser fingerprint platform', () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    usesClearcoteMock.mockReturnValue(false);
    launchMock.mockReset();
    launchMock.mockResolvedValue({ close: async () => {} });
  });

  afterEach(() => {
    pretendPlatform(originalPlatform);
  });

  it('poses as Linux on a Linux host instead of the Windows default', async () => {
    pretendPlatform('linux');

    await launchBrowser('https://www.immowelt.de/', {});

    expect(launchMock.mock.calls[0][0].args).toContain('--fingerprint-platform=linux');
  });

  it("leaves CloakBrowser's own platform choice alone elsewhere", async () => {
    pretendPlatform('darwin');

    await launchBrowser('https://www.immowelt.de/', {});

    expect(launchMock.mock.calls[0][0].args.some((arg) => arg.startsWith('--fingerprint-platform'))).toBe(false);
  });
});

describe('launchBrowser on Clearcote', () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    usesClearcoteMock.mockReturnValue(true);
    launchMock.mockReset();
    serveMock.mockReset();
    serveMock.mockImplementation(async () => createServer());
    connectMock.mockReset();
    connectMock.mockImplementation(async () => ({ close: vi.fn(async () => {}) }));
  });

  afterEach(() => {
    pretendPlatform(originalPlatform);
  });

  it('serves Clearcote and connects Puppeteer to its endpoint instead of launching CloakBrowser', async () => {
    const browser = await launchBrowser('https://www.immowelt.de/', {});

    expect(launchMock).not.toHaveBeenCalled();
    expect(serveMock).toHaveBeenCalledTimes(1);
    expect(connectMock).toHaveBeenCalledWith({ browserURL: 'http://127.0.0.1:9333', defaultViewport: null });
    expect(browser).toBe(await connectMock.mock.results[0].value);
  });

  it('keeps the geoip lookup off and sets language and timezone itself', async () => {
    await launchBrowser('https://www.immowelt.de/', {});

    expect(serveMock.mock.calls[0][0]).toMatchObject({
      geoip: false,
      timezone: 'Europe/Berlin',
      acceptLanguage: expect.stringMatching(/^de-DE/),
      headless: true,
    });
  });

  it('presents a new machine on every launch', async () => {
    await launchBrowser('https://www.immowelt.de/', {});
    await launchBrowser('https://www.immowelt.de/', {});

    const [first, second] = serveMock.mock.calls.map(([options]) => options.fingerprint);
    expect(first).toEqual(expect.any(String));
    expect(first).not.toBe(second);
  });

  it('forwards proxyUrl as the proxy option, and none without one', async () => {
    await launchBrowser('https://www.immowelt.de/', { proxyUrl: 'http://user:pass@host:8080' });
    await launchBrowser('https://www.immowelt.de/', {});

    expect(serveMock.mock.calls[0][0].proxy).toBe('http://user:pass@host:8080');
    expect(serveMock.mock.calls[1][0].proxy).toBeUndefined();
  });

  it('poses as Linux on a Linux host and leaves the platform alone elsewhere', async () => {
    pretendPlatform('linux');
    await launchBrowser('https://www.immowelt.de/', {});
    pretendPlatform('win32');
    await launchBrowser('https://www.immowelt.de/', {});

    expect(serveMock.mock.calls[0][0].platform).toBe('linux');
    expect(serveMock.mock.calls[1][0].platform).toBeUndefined();
  });

  it('stops the server when Puppeteer cannot connect to it', async () => {
    const server = createServer();
    serveMock.mockResolvedValue(server);
    connectMock.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(launchBrowser('https://www.immowelt.de/', {})).rejects.toThrow('ECONNREFUSED');
    expect(server.close).toHaveBeenCalledTimes(1);
  });
});

describe('closeBrowser on Clearcote', () => {
  beforeEach(() => {
    usesClearcoteMock.mockReturnValue(true);
    serveMock.mockReset();
    connectMock.mockReset();
  });

  it('closes the browser, then stops the server that owns its process', async () => {
    const server = createServer();
    const browser = { close: vi.fn(async () => {}) };
    serveMock.mockResolvedValue(server);
    connectMock.mockResolvedValue(browser);

    await closeBrowser(await launchBrowser('https://www.immowelt.de/', {}));

    expect(browser.close).toHaveBeenCalledTimes(1);
    expect(server.close).toHaveBeenCalledTimes(1);
    expect(browser.close.mock.invocationCallOrder[0]).toBeLessThan(server.close.mock.invocationCallOrder[0]);
  });

  it('still stops the server when the CDP connection is already gone', async () => {
    const server = createServer();
    const browser = {
      close: vi.fn(async () => {
        throw new Error('Connection closed');
      }),
    };
    serveMock.mockResolvedValue(server);
    connectMock.mockResolvedValue(browser);

    await expect(closeBrowser(await launchBrowser('https://www.immowelt.de/', {}))).resolves.toBeUndefined();
    expect(server.close).toHaveBeenCalledTimes(1);
  });

  it('stops the server only once when the same browser is closed twice', async () => {
    const server = createServer();
    const browser = { close: vi.fn(async () => {}) };
    serveMock.mockResolvedValue(server);
    connectMock.mockResolvedValue(browser);

    const launched = await launchBrowser('https://www.immowelt.de/', {});
    await closeBrowser(launched);
    await closeBrowser(launched);

    expect(server.close).toHaveBeenCalledTimes(1);
  });
});

describe('closeBrowser', () => {
  /** @type {import('vitest').MockInstance} */
  let killSpy;

  beforeEach(() => {
    killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);
  });

  afterEach(() => {
    killSpy.mockRestore();
  });

  it('does nothing when there is no browser', async () => {
    await expect(closeBrowser(null)).resolves.toBeUndefined();
    expect(killSpy).not.toHaveBeenCalled();
  });

  it('closes the browser and does not signal a process that already exited', async () => {
    const { browser, childProcess, close } = createBrowser({ alive: false });

    await closeBrowser(browser);

    expect(close).toHaveBeenCalledTimes(1);
    expect(killSpy).not.toHaveBeenCalled();
    expect(childProcess.kill).not.toHaveBeenCalled();
  });

  it('kills the process group when close() rejected and Chromium is still running', async () => {
    const { browser, childProcess } = createBrowser({ closeFails: true });

    await closeBrowser(browser);

    // negative pid = the detached process group, so the helper processes go down with the browser
    expect(killSpy).toHaveBeenCalledWith(-4711, 'SIGKILL');
    expect(childProcess.kill).not.toHaveBeenCalled();
  });

  it('falls back to killing the single process when there is no process group', async () => {
    const { browser, childProcess } = createBrowser({ closeFails: true });
    killSpy.mockImplementation(() => {
      throw new Error('ESRCH');
    });

    await closeBrowser(browser);

    expect(childProcess.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('swallows a kill that fails because the process is already gone', async () => {
    const { browser, childProcess } = createBrowser({ closeFails: true });
    killSpy.mockImplementation(() => {
      throw new Error('ESRCH');
    });
    childProcess.kill.mockImplementation(() => {
      throw new Error('ESRCH');
    });

    await expect(closeBrowser(browser)).resolves.toBeUndefined();
  });
});
