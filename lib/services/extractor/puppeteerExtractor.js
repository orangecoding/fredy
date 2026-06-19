/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { launch } from 'cloakbrowser/puppeteer';
import { botDetected, debug } from './utils.js';
import { getPreLaunchConfig } from './botPrevention.js';
import logger from '../logger.js';
import { trackPoi } from '../tracking/Tracker.js';
import { TRACKING_POIS } from '../../TRACKING_POIS.js';

/**
 * Launch a CloakBrowser/Puppeteer browser instance with stealth and humanizer enabled.
 *
 * CloakBrowser applies 49 C++ source-level patches (canvas, WebGL, audio, WebRTC,
 * navigator.*, automation signals) that are indistinguishable from a real browser.
 * All fingerprinting and human-behaviour simulation is handled natively; no CDP
 * overrides (setUserAgent, setExtraHTTPHeaders, evaluateOnNewDocument) are applied
 * here because they would create detectable inconsistencies on top of the C++ patches.
 *
 * @param {string} url - Initial URL (used to derive locale/timezone hints).
 * @param {object} [options]
 * @param {boolean} [options.puppeteerHeadless]
 * @param {number}  [options.puppeteerTimeout]
 * @param {string}  [options.proxyUrl]
 * @param {string}  [options.timezone]
 * @param {string}  [options.acceptLanguage]
 * @param {object}  [options.viewport]
 * @returns {Promise<import('puppeteer-core').Browser>}
 */
export async function launchBrowser(url, options) {
  const preCfg = getPreLaunchConfig(url, options || {});

  // Docker requires --no-sandbox; CloakBrowser handles all stealth args internally.
  // --ignore-certificate-errors is needed because CloakBrowser ships its own Chromium
  // binary with an independent CA bundle that may not trust proxies or interceptors
  // present in the host environment.
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    '--ignore-certificate-errors',
    // Disables the zygote process model. Required in some container environments
    // (e.g. limited kernel namespaces) where the zygote cannot acquire the
    // locks it needs and exits with "Invalid file descriptor to ICU data received".
    '--no-zygote',
    preCfg.windowSizeArg,
    // On ARM (Raspberry Pi) the real GPU renderer string (e.g. "V3D 4.2" / "VideoCore VI")
    // is a highly distinctive fingerprint that DataDome uses to identify ARM scrapers even
    // behind a residential proxy. SwiftShader replaces it with a generic software renderer
    // that is platform-neutral and not flagged by anti-bot systems.
    ...(process.arch === 'arm64' || process.arch === 'arm' ? ['--use-angle=swiftshader'] : []),
  ];

  return await launch({
    headless: options?.puppeteerHeadless ?? true,
    humanize: true,
    args,
    // locale sets Accept-Language headers and JS navigator.language consistently
    locale: preCfg.langForFlag,
    ...(options?.proxyUrl ? { proxy: options.proxyUrl } : {}),
    ...(preCfg.timezone ? { timezone: preCfg.timezone } : {}),
  });
}

/**
 * Close a browser instance returned by {@link launchBrowser}.
 *
 * @param {import('puppeteer-core').Browser | null} browser
 */
export async function closeBrowser(browser) {
  if (!browser) return;
  try {
    await browser.close();
  } catch {
    // ignore
  }
}

/**
 * Open a page in a (possibly reused) browser, navigate to `url`, and return the HTML source.
 * Returns `null` when a bot-detection page is encountered or on timeout.
 *
 * @param {string} url
 * @param {string | null} waitForSelector
 * @param {object} [options]
 * @returns {Promise<string | null>}
 */
export default async function execute(url, waitForSelector, options) {
  let browser = options?.browser;
  let isExternalBrowser = !!browser;
  let page;
  let result;
  try {
    debug(`Sending request to ${url} using CloakBrowser.`);

    if (!isExternalBrowser) {
      browser = await launchBrowser(url, options);
    }

    page = await browser.newPage();

    if (Array.isArray(options?.cookies) && options.cookies.length > 0) {
      await page.setCookie(...options.cookies);
    }

    // Warm-up navigation: visit a trusted page first so the site sees an
    // established session before the actual target URL. Silently ignored on
    // failure so it never blocks the main request.
    if (options?.preNavigateUrl) {
      try {
        await page.goto(options.preNavigateUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await new Promise((r) => setTimeout(r, 1500 + Math.random() * 2000));
      } catch {
        // ignore
      }
    }

    const response = await page.goto(url, {
      waitUntil: options?.waitUntil || 'domcontentloaded',
      timeout: options?.puppeteerTimeout || 60000,
    });

    // Optional second idle wait: useful for React SPAs that trigger API calls
    // after domcontentloaded. Times out silently so we use whatever is rendered.
    if (options?.waitForNetworkIdle) {
      try {
        await page.waitForNetworkIdle({ timeout: options?.waitForNetworkIdleTimeout ?? 60_000 });
      } catch {
        // ignore — we proceed with whatever the DOM contains at this point
      }
    }

    let pageSource;
    if (waitForSelector != null) {
      const selectorTimeout = options?.puppeteerSelectorTimeout ?? options?.puppeteerTimeout ?? 30_000;
      await page.waitForSelector(waitForSelector, { timeout: selectorTimeout });

      if (options?.autoScroll) {
        // For pages that use virtual lists (items outside the viewport are unmounted),
        // a single HTML snapshot misses cards above/below the current scroll position.
        // Instead we collect the outerHTML of every matching item as we scroll through
        // the page, then stitch them into a synthetic container so the parser sees all
        // items at once.
        //
        // Flow:
        //   1. Wait for the container (waitForSelector already done above).
        //   2. Scroll one viewport at a time; after each step wait autoScrollDelay ms
        //      for the virtual list to mount newly visible cards.
        //   3. Accumulate item HTML from every scroll position (dedup by first anchor href).
        //   4. Return a wrapper containing all collected items.
        const delay = options.autoScrollDelay ?? 800;
        const itemSelector = options.autoScrollItemSelector ?? waitForSelector;
        // CSS selector used to extract a stable dedup key from each item (first anchor href).
        // Falls back to outerHTML when no matching element is found.
        const dedupeSelector = options.autoScrollDedupeSelector ?? 'a';

        pageSource = await page.evaluate(
          async (containerSel, itemSel, stepDelay, dedupeSel) => {
            const seen = new Set();
            const collected = [];

            const getKey = (el) => {
              const anchor = el.querySelector(dedupeSel);
              return anchor?.href || anchor?.getAttribute('href') || el.outerHTML;
            };

            const collect = () => {
              document.querySelectorAll(itemSel).forEach((el) => {
                const key = getKey(el);
                if (!seen.has(key)) {
                  seen.add(key);
                  collected.push(el.outerHTML);
                }
              });
            };

            const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

            // Scroll from top to bottom, collecting at each position
            window.scrollTo(0, 0);
            await sleep(stepDelay);
            collect();

            let lastTop = -1;
            while (true) {
              window.scrollBy(0, window.innerHeight);
              await sleep(stepDelay);
              collect();
              const currentTop = window.scrollY;
              if (currentTop === lastTop) break; // reached the bottom
              lastTop = currentTop;
            }

            return `<div data-collected="true">${collected.join('')}</div>`;
          },
          waitForSelector,
          itemSelector,
          delay,
          dedupeSelector,
        );
      } else {
        pageSource = await page.evaluate((selector) => {
          const el = document.querySelector(selector);
          return el ? el.innerHTML : '';
        }, waitForSelector);
      }
    } else {
      pageSource = await page.content();
    }

    const statusCode = response?.status?.() ?? 200;
    // Some sites (e.g. homegate.ch via DataDome) return a 403 for the initial HTTP response
    // but still serve real content via a client-side JS challenge that CloakBrowser passes.
    // Providers can list such codes in ignoredStatusCodes so the status check is skipped;
    // waitForSelector already guards against real bot-detection pages (captcha has no listings).
    const effectiveStatusCode = options?.ignoredStatusCodes?.includes(statusCode) ? 200 : statusCode;

    if (botDetected(pageSource, effectiveStatusCode)) {
      logger.warn('We have been detected as a bot :-/ Tried url: => ', url);

      if (options != null && options.name != null) {
        await trackPoi(TRACKING_POIS.DETECTED_AS_BOT + '_' + options.name);
      } else {
        await trackPoi(TRACKING_POIS.DETECTED_AS_BOT);
      }

      result = null;
    } else {
      result = pageSource || (await page.content());
    }
  } catch (error) {
    if (error?.name?.includes('Timeout')) {
      logger.debug('Error executing with CloakBrowser executor', error);
    } else {
      logger.warn('Error executing with CloakBrowser executor', error);
    }
    result = null;
  } finally {
    try {
      if (page) {
        await page.close();
      }
    } catch {
      // ignore
    }
    if (browser != null && !isExternalBrowser) {
      await closeBrowser(browser);
    }
  }
  return result;
}
