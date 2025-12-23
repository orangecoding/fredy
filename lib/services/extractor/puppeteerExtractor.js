/*
 * Copyright (c) 2025 by Christian Kellner.
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
    // Prepare bot prevention pre-launch config
    const preCfg = getPreLaunchConfig(url, options || {});
    launchArgs.push(preCfg.langArg);
    launchArgs.push(preCfg.windowSizeArg);
    launchArgs.push(...preCfg.extraArgs);

    browser = await puppeteer.launch({
      headless: options?.puppeteerHeadless ?? true,
      args: launchArgs,
      timeout: options?.puppeteerTimeout || 30_000,
      userDataDir,
      executablePath: options?.executablePath, // allow using system Chrome
    });

    page = await browser.newPage();
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
    if (error?.message?.includes('Timeout')) {
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
