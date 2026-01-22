/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { DEFAULT_HEADER } from './utils.js';

// Helper to safely coerce numbers
const toInt = (v, d) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};

/**
 * Compute pre-launch configuration and flags for Puppeteer with bot prevention in mind.
 * Returns language, user agent, viewport (with optional jitter), and additional launch args.
 *
 * @param {string} url
 * @param {object} [options]
 */
export function getPreLaunchConfig(url, options = {}) {
  const { hostname } = new URL(url);

  const acceptLanguage = options.acceptLanguage || 'de-DE,de;q=0.9,en-US;q=0.7,en;q=0.5';
  const langForFlag = acceptLanguage.split(',')[0];

  const baseViewport = { width: 1366, height: 768, deviceScaleFactor: 1 };
  const jitter = options.viewportJitter !== false ? Math.floor(Math.random() * 6) : 0; // 0..5 px
  const width = toInt(options?.viewport?.width, baseViewport.width) + jitter;
  const height = toInt(options?.viewport?.height, baseViewport.height) + jitter;
  const deviceScaleFactor = toInt(options?.viewport?.deviceScaleFactor, baseViewport.deviceScaleFactor);
  const viewport = { width, height, deviceScaleFactor };

  const userAgent =
    options.userAgent ||
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

  const windowSizeArg = `--window-size=${viewport.width},${viewport.height}`;
  const langArg = `--lang=${langForFlag}`;

  const extraArgs = [
    '--disable-blink-features=AutomationControlled',
    '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
    '--webrtc-ip-handling-policy=default_public_interface_only',
    '--proxy-bypass-list=<-loopback>',
  ];

  const headers = {
    ...DEFAULT_HEADER,
    'Accept-Language': acceptLanguage,
    'User-Agent': userAgent,
    Referer: options?.referer || `https://${hostname}/`,
    Connection: 'keep-alive',
    DNT: '1',
  };

  const timezone = options?.timezone || 'Europe/Berlin';

  return {
    acceptLanguage,
    langForFlag,
    userAgent,
    viewport,
    windowSizeArg,
    langArg,
    extraArgs,
    headers,
    timezone,
    humanDelay: options?.humanDelay !== false,
  };
}

/**
 * Apply bot-prevention hardening to a Puppeteer page.
 * Sets UA, viewport, JS enabled, headers, timezone and injects stealth-like patches.
 *
 * @param {import('puppeteer').Page} page
 * @param {ReturnType<typeof getPreLaunchConfig>} cfg
 */
export async function applyBotPreventionToPage(page, cfg) {
  await page.setUserAgent(cfg.userAgent);
  await page.setViewport(cfg.viewport);
  await page.setJavaScriptEnabled(true);
  await page.setExtraHTTPHeaders(cfg.headers);
  try {
    if (cfg.timezone) await page.emulateTimezone(cfg.timezone);
  } catch {
    // ignore timezone failures
  }

  // Inject patches as early as possible
  await page.evaluateOnNewDocument(() => {
    try {
      // webdriver
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

      // chrome runtime
      // @ts-ignore
      if (!window.chrome) {
        // @ts-ignore
        window.chrome = { runtime: {} };
      }

      // languages
      // @ts-ignore
      Object.defineProperty(navigator, 'languages', {
        get: () => (window.localStorage.getItem('__LANGS__') || 'de-DE,de').split(','),
      });

      // plugins
      // @ts-ignore
      Object.defineProperty(navigator, 'plugins', {
        get: () => [{}, {}, {}],
      });

      // platform and concurrency hints
      // @ts-ignore
      Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
      // @ts-ignore
      if (typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency < 2) {
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4 });
      }
      // @ts-ignore
      if (typeof navigator.deviceMemory === 'number' && navigator.deviceMemory < 2) {
        Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
      }

      // userAgentData (Client Hints)
      try {
        // @ts-ignore
        if ('userAgentData' in navigator) {
          // @ts-ignore
          Object.defineProperty(navigator, 'userAgentData', {
            get: () => ({
              brands: [
                { brand: 'Chromium', version: '126' },
                { brand: 'Google Chrome', version: '126' },
              ],
              mobile: false,
              platform: 'Windows',
              getHighEntropyValues: async (hints) => {
                const values = {
                  platform: 'Windows',
                  platformVersion: '15.0.0',
                  architecture: 'x86',
                  model: '',
                  uaFullVersion: '126.0.0.0',
                  bitness: '64',
                };
                const out = {};
                for (const k of hints || []) if (k in values) out[k] = values[k];
                return out;
              },
            }),
          });
        }
      } catch {
        //noop
      }

      // Permissions API
      const origQuery = navigator.permissions && navigator.permissions.query;
      if (origQuery) {
        // @ts-ignore
        navigator.permissions.query = (parameters) =>
          origQuery.call(navigator.permissions, parameters).then((result) => {
            if (parameters && parameters.name === 'notifications') {
              Object.defineProperty(result, 'state', { get: () => Notification.permission });
            }
            return result;
          });
      }

      // WebGL vendor/renderer
      const patchWebGL = (proto) => {
        if (!proto || !proto.getParameter) return;
        const getParameter = proto.getParameter;
        // @ts-ignore
        proto.getParameter = function (param) {
          const UNMASKED_VENDOR_WEBGL = 0x9245;
          const UNMASKED_RENDERER_WEBGL = 0x9246;
          if (param === UNMASKED_VENDOR_WEBGL) return 'Google Inc.';
          if (param === UNMASKED_RENDERER_WEBGL)
            return 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Ti Direct3D11 vs_5_0 ps_5_0)';
          return getParameter.call(this, param);
        };
      };
      // @ts-ignore
      patchWebGL(WebGLRenderingContext?.prototype);
      // @ts-ignore
      patchWebGL(WebGL2RenderingContext?.prototype);

      // AudioContext timestamp rounding consistency
      const patchAudio = (Ctx) => {
        try {
          if (!Ctx) return;
          const proto = Ctx.prototype;
          const createOsc = proto.createOscillator;
          proto.createOscillator = function () {
            const osc = createOsc.call(this);
            const start = osc.start;
            osc.start = function (when) {
              return start.call(this, when || 0);
            };
            return osc;
          };
        } catch {
          //noop
        }
      };
      // @ts-ignore
      patchAudio(window.AudioContext);
      // @ts-ignore
      patchAudio(window.OfflineAudioContext);

      // Navigator.connection
      try {
        // @ts-ignore
        Object.defineProperty(navigator, 'connection', { get: () => undefined });
      } catch {
        //noop
      }

      // Consistent outer sizes
      try {
        const calcOuter = () => {
          const w = window.innerWidth + 16;
          const h = window.innerHeight + 88;
          return { w, h };
        };
        const { w: outerW, h: outerH } = calcOuter();
        // @ts-ignore
        Object.defineProperty(window, 'outerWidth', { get: () => outerW });
        // @ts-ignore
        Object.defineProperty(window, 'outerHeight', { get: () => outerH });
      } catch {
        //noop
      }
    } catch {
      //noop
    }
  });
}

/**
 * Persist languages value before navigation via localStorage.
 * @param {import('puppeteer').Page} page
 * @param {ReturnType<typeof getPreLaunchConfig>} cfg
 */
export async function applyLanguagePersistence(page, cfg) {
  await page.evaluateOnNewDocument((langs) => {
    try {
      window.localStorage.setItem('__LANGS__', langs);
    } catch {
      // noop
    }
  }, cfg.acceptLanguage.split(';')[0]);
}

/**
 * Perform subtle human-like interactions post navigation.
 * @param {import('puppeteer').Page} page
 * @param {ReturnType<typeof getPreLaunchConfig>} cfg
 */
export async function applyPostNavigationHumanSignals(page, cfg) {
  if (!cfg.humanDelay) return;
  const delay = 200 + Math.floor(Math.random() * 400);
  await new Promise((res) => setTimeout(res, delay));
  try {
    const vw = cfg.viewport.width;
    const vh = cfg.viewport.height;
    const mx = Math.floor(vw * (0.3 + Math.random() * 0.4));
    const my = Math.floor(vh * (0.3 + Math.random() * 0.4));
    await page.mouse.move(mx, my, { steps: 10 + Math.floor(Math.random() * 10) });
    await page.mouse.wheel({ deltaY: 100 + Math.floor(Math.random() * 200) });
  } catch {
    // ignore if mouse is unavailable
  }
}
