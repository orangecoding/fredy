/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/* eslint-disable no-console */

import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../..');
const FIXTURES_DIR = path.join(ROOT, 'test', 'testFixtures');
const TEST_PROVIDER_PATH = path.join(ROOT, 'test', 'provider', 'testProvider.json');

/**
 * Extracts the first listing link from HTML using the provider's link crawl selector.
 * Selector format: "css-selector@attribute | transform | ..."
 */
function extractFirstLink(html, linkSelectorExpr, baseUrl) {
  if (!linkSelectorExpr) return null;

  const selectorPart = linkSelectorExpr.split('|')[0].trim();
  let cssSelector = selectorPart;
  let attribute = null;

  const atMatch = selectorPart.match(/^(.+?)@(\w+)$/);
  if (atMatch) {
    cssSelector = atMatch[1].trim();
    attribute = atMatch[2];
  }

  const $ = cheerio.load(html);
  const el = $(cssSelector).first();
  const value = attribute ? el.attr(attribute) : el.text().trim();

  if (!value) return null;
  if (value.startsWith('http')) return value;
  if (value.startsWith('/')) return new URL(value, baseUrl).href;
  return null;
}

async function downloadImmoscoutFixtures(mobileApiUrl) {
  console.log('\nDownloading immoscout...');

  const listResponse = await fetch(mobileApiUrl, {
    method: 'POST',
    headers: {
      'User-Agent': 'ImmoScout_27.12_26.2_._',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ supportedResultListTypes: [], userData: {} }),
  });

  if (!listResponse.ok) {
    console.warn(`  Failed to download immoscout list: ${listResponse.statusText}`);
    return;
  }

  const listData = await listResponse.json();
  await writeFile(path.join(FIXTURES_DIR, 'immoscout_list.json'), JSON.stringify(listData, null, 2), 'utf-8');
  console.log('  Saved immoscout_list.json');

  const exposes = (listData.resultListItems || []).filter((item) => item.type === 'EXPOSE_RESULT');
  if (exposes.length === 0) {
    console.warn('  No expose results found – skipping detail fixture');
    return;
  }

  const exposeId = exposes[0].item?.id;
  if (!exposeId) return;

  console.log(`  Downloading immoscout detail (expose ${exposeId})...`);
  const detailResponse = await fetch(`https://api.mobile.immobilienscout24.de/expose/${exposeId}`, {
    headers: {
      'User-Agent': 'ImmoScout_27.3_26.0_._',
      'Content-Type': 'application/json',
    },
  });

  if (!detailResponse.ok) {
    console.warn(`  Failed to download immoscout detail: ${detailResponse.statusText}`);
    return;
  }

  const detailData = await detailResponse.json();
  await writeFile(path.join(FIXTURES_DIR, 'immoscout_detail.json'), JSON.stringify(detailData, null, 2), 'utf-8');
  console.log('  Saved immoscout_detail.json');
}

async function downloadHtmlProvider(name, providerConfig, launchBrowser, closeBrowser, puppeteerExtractor) {
  console.log(`\nDownloading ${name}...`);

  const browser = await launchBrowser(providerConfig.url, {});
  try {
    const html = await puppeteerExtractor(providerConfig.url, providerConfig.waitForSelector, { browser });

    if (!html) {
      console.warn(`  Failed to download ${name}`);
      return;
    }

    await writeFile(path.join(FIXTURES_DIR, `${name}.html`), html, 'utf-8');
    console.log(`  Saved ${name}.html`);

    const needsDetailFixture = typeof providerConfig.fetchDetails === 'function' && providerConfig.crawlFields?.link;

    if (needsDetailFixture) {
      const detailUrl = extractFirstLink(html, providerConfig.crawlFields.link, providerConfig.url);
      if (!detailUrl) {
        console.warn(`  Could not find detail URL in ${name} list page`);
        return;
      }

      console.log(`  Downloading ${name} detail...`);
      const detailHtml = await puppeteerExtractor(detailUrl, null, { browser });
      if (detailHtml) {
        await writeFile(path.join(FIXTURES_DIR, `${name}_detail.html`), detailHtml, 'utf-8');
        console.log(`  Saved ${name}_detail.html`);
      } else {
        console.warn(`  Failed to download ${name} detail`);
      }
    }
  } finally {
    await closeBrowser(browser);
  }
}

async function main() {
  await mkdir(FIXTURES_DIR, { recursive: true });

  const testProviderConfig = JSON.parse(await readFile(TEST_PROVIDER_PATH, 'utf-8'));

  const {
    launchBrowser,
    closeBrowser,
    default: puppeteerExtractor,
  } = await import('../../lib/services/extractor/puppeteerExtractor.js');

  for (const [name, cfg] of Object.entries(testProviderConfig)) {
    const provider = await import(`../../lib/provider/${name}.js`);
    provider.init(cfg, [], []);

    if (name === 'immoscout') {
      await downloadImmoscoutFixtures(provider.config.url);
    } else {
      await downloadHtmlProvider(name, provider.config, launchBrowser, closeBrowser, puppeteerExtractor);
    }
  }

  console.log('\nAll fixtures downloaded.');
}

main().catch((err) => {
  console.error('Error downloading fixtures:', err);
  process.exit(1);
});
