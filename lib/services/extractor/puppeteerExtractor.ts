import puppeteer from 'puppeteer-extra';
import { Browser, Page, HTTPResponse, LaunchOptions } from 'puppeteer';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { debug, DEFAULT_HEADER, botDetected } from './utils';
import { GeneralSettings } from '#types/GeneralSettings.js';

puppeteer.use(StealthPlugin());

async function launchBrowser(options: GeneralSettings): Promise<Browser> {
  return await puppeteer.launch({
    headless: options.puppeteerHeadless ?? true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-setuid-sandbox'],
    timeout: options.puppeteerTimeout ?? 30_000,
  } as LaunchOptions);
}

async function setupPage(browser: Browser): Promise<Page> {
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders(DEFAULT_HEADER);
  return page;
}

async function navigateToPage(page: Page, url: string): Promise<HTTPResponse | null> {
  return await page.goto(url, { waitUntil: 'domcontentloaded' });
}

async function extractPageContent(page: Page, waitForSelector: string | null): Promise<string | null> {
  if (waitForSelector) {
    await page.waitForSelector(waitForSelector);
    return await page.evaluate((selector) => document.querySelector(selector)?.innerHTML ?? null, waitForSelector);
  }
  return await page.content();
}

export default async function execute(
  url: string,
  waitForSelector: string | null,
  options: GeneralSettings,
): Promise<string | null> {
  let browser: Browser | null = null;

  try {
    debug(`Sending request to ${url} using Puppeteer.`);
    browser = await launchBrowser(options);
    const page = await setupPage(browser);
    const response = await navigateToPage(page, url);

    if (!response) {
      console.warn('Failed to load page:', url);
      return null;
    }

    const pageSource = await extractPageContent(page, waitForSelector);

    if (botDetected(pageSource, response.status())) {
      console.warn('We have been detected as a bot :-/ Tried url: =>', url);
      return null;
    }

    return pageSource;
  } catch (error: unknown) {
    console.error('Error executing with Puppeteer:', error);
    return null;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
