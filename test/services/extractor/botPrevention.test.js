/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it } from 'mocha';
import { expect } from 'chai';

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

    expect(cfg.acceptLanguage).to.equal('de-DE,de;q=0.9');
    expect(cfg.langArg).to.equal('--lang=de-DE');
    expect(cfg.windowSizeArg).to.equal('--window-size=1200,700');
    expect(cfg.viewport).to.deep.equal({ width: 1200, height: 700, deviceScaleFactor: 2 });
    expect(cfg.userAgent).to.equal('TestAgent/1.0');
    expect(cfg.headers['Accept-Language']).to.equal('de-DE,de;q=0.9');
    expect(cfg.headers['User-Agent']).to.equal('TestAgent/1.0');
    expect(cfg.headers.Referer).to.equal('https://example.com/ref');
    expect(cfg.extraArgs).to.include('--disable-blink-features=AutomationControlled');
    expect(cfg.extraArgs).to.include('--proxy-bypass-list=<-loopback>');
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

    expect(calls[0]).to.deep.equal(['setUserAgent', 'Foo/Bar']);
    expect(calls.some((c) => c[0] === 'setViewport' && c[1].width === 1000 && c[1].height === 600)).to.equal(true);
    expect(calls.some((c) => c[0] === 'setJavaScriptEnabled' && c[1] === true)).to.equal(true);
    const headerCall = calls.find((c) => c[0] === 'setExtraHTTPHeaders');
    expect(headerCall).to.exist;
    expect(headerCall[1]['Accept-Language']).to.equal('en-US,en');
    expect(headerCall[1]['User-Agent']).to.equal('Foo/Bar');
    expect(calls.some((c) => c[0] === 'emulateTimezone' && c[1] === 'UTC')).to.equal(true);
    expect(calls.some((c) => c[0] === 'evaluateOnNewDocument' && c[1] === 'function')).to.equal(true);
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
    expect(call[0]).to.equal('evaluateOnNewDocument');
    expect(call[1]).to.equal('function');
    expect(call[2]).to.equal('de-DE,de');
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
    expect(mouseCalls.some((c) => c[0] === 'move')).to.equal(true);
    expect(mouseCalls.some((c) => c[0] === 'wheel')).to.equal(true);
  });
});
