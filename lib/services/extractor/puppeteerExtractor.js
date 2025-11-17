import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { debug, DEFAULT_HEADER, botDetected } from './utils.js';
import logger from '../logger.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { URL } from 'url';

puppeteer.use(StealthPlugin());

export default async function execute(url, waitForSelector, options) {
  let browser;
  let page;
  let result = null;
  let userDataDir;
  let removeUserDataDir = false;
  try {
    debug(`Sending request to ${url} using Puppeteer.`);

    // Prepare a dedicated temporary userDataDir to avoid leaking /tmp/.org.chromium.* dirs
    if (options && options.userDataDir) {
      userDataDir = options.userDataDir;
      removeUserDataDir = !!options.cleanupUserDataDir;
    } else {
      const prefix = path.join(os.tmpdir(), 'puppeteer-fredy-');
      userDataDir = fs.mkdtempSync(prefix);
      removeUserDataDir = true;
    }

    const launchArgs = [
      '--no-sandbox',
      '--disable-gpu',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-crash-reporter',
      '--no-first-run',
      '--no-default-browser-check',
    ];
    if (options?.proxyUrl) {
      launchArgs.push(`--proxy-server=${options.proxyUrl}`);
    }

    browser = await puppeteer.launch({
      headless: options?.puppeteerHeadless ?? true,
      args: launchArgs,
      timeout: options?.puppeteerTimeout || 30_000,
      userDataDir,
      executablePath: options?.executablePath, // allow using system Chrome
    });

    page = await browser.newPage();

    // Derive domain-specific defaults
    const { hostname } = new URL(url);

    // Set a realistic modern user agent unless provided
    const userAgent =
      options?.userAgent ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
    await page.setUserAgent(userAgent);

    // Viewport and device scale for typical desktop
    await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 });

    // Extra HTTP headers with localized Accept-Language
    const acceptLanguage = options?.acceptLanguage || 'de-DE,de;q=0.9,en-US;q=0.7,en;q=0.5';
    const headers = {
      ...DEFAULT_HEADER,
      'Accept-Language': acceptLanguage,
      'User-Agent': userAgent,
      Referer: options?.referer || `https://${hostname}/`,
      Connection: 'keep-alive',
      DNT: '1',
    };
    await page.setExtraHTTPHeaders(headers);

    // Timezone and locale tweaks to look German when needed
    try {
      const tz = options?.timezone || 'Europe/Berlin';
      if (tz) await page.emulateTimezone(tz);
    } catch {
      //noop
    }

    // Harden navigator properties (stealth already covers many, but we ensure critical ones)
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      // Plugins and mimeTypes
      // @ts-ignore
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
      // @ts-ignore
      Object.defineProperty(navigator, 'languages', {
        get: () => (window.localStorage.getItem('__LANGS__') || 'de-DE,de').split(','),
      });
    });
    // Provide languages value before navigation
    await page.evaluateOnNewDocument((langs) => {
      try {
        window.localStorage.setItem('__LANGS__', langs);
      } catch {
        //noop
      }
    }, acceptLanguage.split(';')[0]);

    // Optional cookies
    if (Array.isArray(options?.cookies) && options.cookies.length > 0) {
      await page.setCookie(...options.cookies);
    }

    // Navigation
    const response = await page.goto(url, {
      waitUntil: options?.waitUntil || 'domcontentloaded',
    });

    // Optionally wait a random small delay to mimic human rendering time
    if (options?.humanDelay !== false) {
      const delay = 200 + Math.floor(Math.random() * 400);
      await new Promise((res) => setTimeout(res, delay));
    }

    let pageSource;
    // if we're extracting data from a SPA, we must wait for the selector
    if (waitForSelector != null) {
      const selectorTimeout = options?.puppeteerSelectorTimeout ?? options?.puppeteerTimeout ?? 30_000;
      await page.waitForSelector(waitForSelector, { timeout: selectorTimeout });
      pageSource = await page.evaluate((selector) => {
        const el = document.querySelector(selector);
        return el ? el.innerHTML : '';
      }, waitForSelector);
    } else {
      pageSource = await page.content();
    }

    const statusCode = response?.status?.() ?? 200;

    if (botDetected(pageSource, statusCode)) {
      logger.warn('We have been detected as a bot :-/ Tried url: => ', url);
      result = null;
    } else {
      result = pageSource || (await page.content());
    }
  } catch (error) {
    logger.warn('Error executing with puppeteer executor', error);
    result = null;
  } finally {
    try {
      if (page) {
        await page.close();
      }
    } catch {
      // ignore
    }
    try {
      if (browser != null) {
        await browser.close();
      }
    } catch {
      // ignore
    }
    try {
      if (removeUserDataDir && userDataDir) {
        await fs.promises.rm(userDataDir, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  }
  return result;
}
