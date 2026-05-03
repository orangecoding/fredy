/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { expect } from 'vitest';

import {
  getPreLaunchConfig,
  applyBotPreventionToPage,
  applyLanguagePersistence,
  applyPostNavigationHumanSignals,
} from '../../../lib/services/extractor/botPrevention.js';

describe('botPrevention helper', () => {
  it('getPreLaunchConfig builds deterministic values when jitter disabled', () => {
    const url = 'https://example.com/some/path';
    const options = {
      acceptLanguage: 'de-DE,de;q=0.9',
      userAgent: 'TestAgent/1.0',
      viewport: { width: 1200, height: 700, deviceScaleFactor: 2 },
      viewportJitter: false,
      referer: 'https://example.com/ref',
      timezone: 'Europe/Berlin',
    };
    const cfg = getPreLaunchConfig(url, options);

    expect(cfg.acceptLanguage).toBe('de-DE,de;q=0.9');
    expect(cfg.langArg).toBe('--lang=de-DE');
    expect(cfg.windowSizeArg).toBe('--window-size=1200,700');
    expect(cfg.viewport).toEqual({ width: 1200, height: 700, deviceScaleFactor: 2 });
    expect(cfg.userAgent).toBe('TestAgent/1.0');
    expect(cfg.headers['Accept-Language']).toBe('de-DE,de;q=0.9');
    expect(cfg.headers['User-Agent']).toBe('TestAgent/1.0');
    expect(cfg.headers.Referer).toBe('https://example.com/ref');
    expect(cfg.extraArgs).toContain('--disable-blink-features=AutomationControlled');
    expect(cfg.extraArgs).toContain('--proxy-bypass-list=<-loopback>');
  });

  it('applyBotPreventionToPage sets UA, viewport, headers and injects patches', async () => {
    const calls = [];
    const page = {
      setUserAgent: async (ua) => calls.push(['setUserAgent', ua]),
      setViewport: async (vp) => calls.push(['setViewport', vp]),
      setJavaScriptEnabled: async (on) => calls.push(['setJavaScriptEnabled', on]),
      setExtraHTTPHeaders: async (h) => calls.push(['setExtraHTTPHeaders', h]),
      emulateTimezone: async (tz) => calls.push(['emulateTimezone', tz]),
      evaluateOnNewDocument: async (fn) => calls.push(['evaluateOnNewDocument', typeof fn]),
    };
    const cfg = getPreLaunchConfig('https://example.org/', {
      userAgent: 'Foo/Bar',
      acceptLanguage: 'en-US,en',
      viewport: { width: 1000, height: 600, deviceScaleFactor: 1 },
      viewportJitter: false,
      timezone: 'UTC',
    });

    await applyBotPreventionToPage(page, cfg);

    expect(calls[0]).toEqual(['setUserAgent', 'Foo/Bar']);
    expect(calls.some((c) => c[0] === 'setViewport' && c[1].width === 1000 && c[1].height === 600)).toBe(true);
    expect(calls.some((c) => c[0] === 'setJavaScriptEnabled' && c[1] === true)).toBe(true);
    const headerCall = calls.find((c) => c[0] === 'setExtraHTTPHeaders');
    expect(headerCall).toBeDefined();
    expect(headerCall[1]['Accept-Language']).toBe('en-US,en');
    expect(headerCall[1]['User-Agent']).toBe('Foo/Bar');
    expect(calls.some((c) => c[0] === 'emulateTimezone' && c[1] === 'UTC')).toBe(true);
    expect(calls.some((c) => c[0] === 'evaluateOnNewDocument' && c[1] === 'function')).toBe(true);
  });

  it('applyLanguagePersistence stores languages early', async () => {
    const calls = [];
    const page = {
      evaluateOnNewDocument: async (fn, arg) => calls.push(['evaluateOnNewDocument', typeof fn, arg]),
    };
    const cfg = getPreLaunchConfig('https://example.org/', {
      acceptLanguage: 'de-DE,de;q=0.9',
      viewportJitter: false,
    });
    await applyLanguagePersistence(page, cfg);
    const call = calls[0];
    expect(call[0]).toBe('evaluateOnNewDocument');
    expect(call[1]).toBe('function');
    expect(call[2]).toBe('de-DE,de');
  });

  it('applyPostNavigationHumanSignals moves mouse and scrolls when enabled', async () => {
    const mouseCalls = [];
    const page = {
      mouse: {
        move: async (x, y, opts) => mouseCalls.push(['move', x, y, opts && typeof opts.steps === 'number']),
        wheel: async (opts) => mouseCalls.push(['wheel', typeof opts.deltaY === 'number']),
      },
    };
    const cfg = {
      humanDelay: true,
      viewport: { width: 1200, height: 800 },
    };
    await applyPostNavigationHumanSignals(page, cfg);
    expect(mouseCalls.some((c) => c[0] === 'move')).toBe(true);
    expect(mouseCalls.some((c) => c[0] === 'wheel')).toBe(true);
  });
});
