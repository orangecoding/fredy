import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { debug, DEFAULT_HEADER, botDetected } from './utils.js';
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

    browser = await puppeteer.launch({
      headless: options.puppeteerHeadless ?? true,
      args: [
        '--no-sandbox',
        '--disable-gpu',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-crash-reporter',
      ],
      timeout: options.puppeteerTimeout || 30_000,
      userDataDir,
    });
    page = await browser.newPage();
    await page.setExtraHTTPHeaders(DEFAULT_HEADER);
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
    });
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

    const statusCode = response.status();

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
