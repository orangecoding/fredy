/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { debug, botDetected } from './utils.js';
import {
  getPreLaunchConfig,
  applyBotPreventionToPage,
  applyLanguagePersistence,
  applyPostNavigationHumanSignals,
} from './botPrevention.js';
import logger from '../logger.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

puppeteer.use(StealthPlugin());

export async function launchBrowser(url, options) {
  const preCfg = getPreLaunchConfig(url, options || {});
  const launchArgs = [
    '--no-sandbox',
    '--disable-gpu',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-crash-reporter',
    '--no-first-run',
    '--no-default-browser-check',
    preCfg.langArg,
    preCfg.windowSizeArg,
    ...preCfg.extraArgs,
  ];
  if (options?.proxyUrl) {
    launchArgs.push(`--proxy-server=${options.proxyUrl}`);
  }

  let userDataDir;
  let removeUserDataDir = false;
  if (options && options.userDataDir) {
    userDataDir = options.userDataDir;
  } else {
    const prefix = path.join(os.tmpdir(), 'puppeteer-fredy-');
    userDataDir = fs.mkdtempSync(prefix);
    removeUserDataDir = true;
  }

  const browser = await puppeteer.launch({
    headless: options?.puppeteerHeadless ?? true,
    args: launchArgs,
    timeout: options?.puppeteerTimeout || 30_000,
    userDataDir,
    executablePath: options?.executablePath,
  });

  browser.__fredy_userDataDir = userDataDir;
  browser.__fredy_removeUserDataDir = removeUserDataDir;

  return browser;
}

export async function closeBrowser(browser) {
  if (!browser) return;
  const userDataDir = browser.__fredy_userDataDir;
  const removeUserDataDir = browser.__fredy_removeUserDataDir;
  try {
    await browser.close();
  } catch {
    // ignore
  }
  if (removeUserDataDir && userDataDir) {
    try {
      await fs.promises.rm(userDataDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

export default async function execute(url, waitForSelector, options) {
  let browser = options?.browser;
  let isExternalBrowser = !!browser;
  let page;
  let result;
  try {
    debug(`Sending request to ${url} using Puppeteer.`);

    if (!isExternalBrowser) {
      browser = await launchBrowser(url, options);
    }

    page = await browser.newPage();
    const preCfg = getPreLaunchConfig(url, options || {});
    await applyBotPreventionToPage(page, preCfg);
    // Provide languages value before navigation
    await applyLanguagePersistence(page, preCfg);

    // Optional cookies
    if (Array.isArray(options?.cookies) && options.cookies.length > 0) {
      await page.setCookie(...options.cookies);
    }

    // Navigation
    const response = await page.goto(url, {
      waitUntil: options?.waitUntil || 'domcontentloaded',
    });

    // Optionally wait and add subtle human-like interactions
    await applyPostNavigationHumanSignals(page, preCfg);

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
    if (error?.name?.includes('Timeout')) {
      logger.debug('Error executing with puppeteer executor', error);
    } else {
      logger.warn('Error executing with puppeteer executor', error);
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
