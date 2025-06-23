import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { debug, DEFAULT_HEADER, botDetected } from './utils.js';
import logger from '../../utils/logger.js';

puppeteer.use(StealthPlugin());

export default async function execute(url, waitForSelector, options, customHeaders = null) {
  let browser;
  try {
    debug(`Sending request to ${url} using Puppeteer.`);

    browser = await puppeteer.launch({
      headless: options.puppeteerHeadless ?? true,
      args: ['--no-sandbox', '--disable-gpu', '--disable-setuid-sandbox'],
      timeout: options.puppeteerTimeout || 30_000,
    });
    let page = await browser.newPage();
    
    // Set headers, merging custom headers with defaults
    const headers = { ...DEFAULT_HEADER, ...customHeaders };
    await page.setExtraHTTPHeaders(headers);
    
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
    });
    let pageSource;
    //if we're extracting data from a spa, we must wait for the selector
    if (waitForSelector != null) {
      await page.waitForSelector(waitForSelector);
      pageSource = await page.evaluate((selector) => {
        return document.querySelector(selector).innerHTML;
      }, waitForSelector);
    } else {
      pageSource = await page.content();
    }

    const statusCode = response.status();

    if (botDetected(pageSource, statusCode)) {
      logger.warn(`[puppeteerExtractor] Bot detected for URL: ${url} (status: ${statusCode})`);
      return null;
    }

    return await page.content();
  } catch (error) {
    logger.error(`[puppeteerExtractor] Error executing for URL: ${url} - ${error.message}`);
    return null;
  } finally {
    if (browser != null) {
      await browser.close();
    }
  }
}
