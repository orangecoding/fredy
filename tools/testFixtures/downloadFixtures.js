/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/* eslint-disable no-console */

import { readFile, readdir, rm, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractFirstDetailUrl } from './extractDetailUrl.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../..');
const FIXTURES_DIR = path.join(ROOT, 'test', 'testFixtures');
const TEST_PROVIDER_PATH = path.join(ROOT, 'test', 'provider', 'testProvider.json');

async function downloadDeutscheWohnenFixtures(apiUrl, refererUrl) {
  console.log('\nDownloading deutscheWohnen...');

  const listResponse = await fetch(apiUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
      Accept: 'application/json',
      Referer: refererUrl,
    },
  });

  if (!listResponse.ok) {
    console.warn(`  Failed to download deutscheWohnen list: ${listResponse.statusText}`);
    return;
  }

  const listData = await listResponse.json();
  await writeFile(path.join(FIXTURES_DIR, 'deutscheWohnen_list.json'), JSON.stringify(listData, null, 2), 'utf-8');
  console.log('  Saved deutscheWohnen_list.json');

  const firstListing = listData.results?.[0];
  if (!firstListing?.slug) {
    console.warn('  No listing slug found – skipping detail fixture');
    return;
  }

  const detailUrl = `https://www.deutsche-wohnen.com/mieten/mietangebote/${firstListing.slug}`;
  console.log(`  Downloading deutscheWohnen detail (${firstListing.slug})...`);
  const detailResponse = await fetch(detailUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
    },
  });

  if (!detailResponse.ok) {
    console.warn(`  Failed to download deutscheWohnen detail: ${detailResponse.statusText}`);
    return;
  }

  const detailHtml = await detailResponse.text();
  await writeFile(path.join(FIXTURES_DIR, 'deutscheWohnen_detail.html'), detailHtml, 'utf-8');
  console.log('  Saved deutscheWohnen_detail.html');
}

async function downloadImmoscoutFixtures(mobileApiUrl) {
  console.log('\nDownloading immoscout...');

  const listResponse = await fetch(mobileApiUrl, {
    method: 'POST',
    headers: {
      'User-Agent': 'ImmoScout_28.1_26.5.2_._',
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

/**
 * Immowelt serves both its result list and its exposé from behind DataDome, so nothing here can be
 * fetched with a plain `fetch` - the provider's own transport, which runs inside the browser page,
 * is used instead. The two fixtures mirror exactly what it returns: the `/classifiedList` payload
 * and one exposé's markup.
 *
 * @param {import('../../lib/types/providerConfig.js').ProviderConfig} runConfig the initialized provider config
 * @param {Function} launchBrowser
 * @param {Function} closeBrowser
 * @returns {Promise<void>}
 */
async function downloadImmoweltFixtures(runConfig, launchBrowser, closeBrowser) {
  console.log('\nDownloading immowelt...');

  const { fetchExposeHtml, releaseSession } = await import('../../lib/services/immowelt/immoweltBff.js');
  const browser = await launchBrowser(runConfig.url, {});

  try {
    const classifieds = await runConfig.getListings(runConfig.url, browser);
    if (!classifieds?.length) {
      console.warn('  Immowelt returned no classifieds - skipping fixtures');
      return;
    }

    await writeFile(
      path.join(FIXTURES_DIR, 'immowelt_classifieds.json'),
      JSON.stringify(classifieds, null, 2),
      'utf-8',
    );
    console.log(`  Saved immowelt_classifieds.json (${classifieds.length} listings)`);

    const exposeUrl = classifieds
      .map((entry) => runConfig.normalize(entry)?.link)
      .find((link) => link?.startsWith('http'));
    if (!exposeUrl) {
      console.warn('  No exposé url among the classifieds - skipping detail fixture');
      return;
    }

    console.log(`  Downloading immowelt detail (${exposeUrl})...`);
    const detailHtml = await fetchExposeHtml(browser, exposeUrl);
    if (!detailHtml) {
      console.warn('  Failed to download immowelt detail');
      return;
    }

    await writeFile(path.join(FIXTURES_DIR, 'immowelt_detail.html'), detailHtml, 'utf-8');
    console.log('  Saved immowelt_detail.html');
  } finally {
    await releaseSession(browser);
    await closeBrowser(browser);
  }
}

/**
 * Fallback for providers that do not expose their listings through the markup (e.g. because they
 * ship them inside an embedded json payload). Those have no crawl container the selector based
 * {@link extractFirstDetailUrl} could work with, so the provider's own `getListings` is asked.
 *
 * @param {import('../../lib/types/providerConfig.js').ProviderConfig} providerConfig the initialized provider config
 * @param {any} browser the browser used for the fixture download
 * @returns {Promise<string|null>} absolute url of the first listing's detail page or null
 */
async function detailUrlFromGetListings(providerConfig, browser) {
  if (typeof providerConfig.getListings !== 'function') return null;

  try {
    const listings = (await providerConfig.getListings(providerConfig.url, browser)) ?? [];
    for (const listing of listings) {
      const link = providerConfig.normalize(listing)?.link;
      if (typeof link === 'string' && link.startsWith('http')) return link;
    }
  } catch (error) {
    console.warn(`  Could not determine detail url via getListings: ${error.message}`);
  }

  return null;
}

async function downloadHtmlProvider(name, providerConfig, launchBrowser, closeBrowser, puppeteerExtractor) {
  console.log(`\nDownloading ${name}...`);

  const browser = await launchBrowser(providerConfig.url, {});
  try {
    const html = await puppeteerExtractor(providerConfig.url, providerConfig.waitForSelector, {
      browser,
      name: 'dowload_fixtures',
    });

    if (!html) {
      console.warn(`  Failed to download ${name}`);
      return;
    }

    await writeFile(path.join(FIXTURES_DIR, `${name}.html`), html, 'utf-8');
    console.log(`  Saved ${name}.html`);

    // the detail url is taken from the normalized listing, so providers that build their link
    // inside normalize() instead of exposing a `link` crawl field are covered as well
    const needsDetailFixture = typeof providerConfig.fetchDetails === 'function';

    if (needsDetailFixture) {
      const detailUrl =
        extractFirstDetailUrl(html, providerConfig) ?? (await detailUrlFromGetListings(providerConfig, browser));
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

/**
 * Reduces the configured providers to those requested on the command line.
 * Without arguments every provider is downloaded.
 *
 * @param {Record<string, object>} testProviderConfig all providers configured in testProvider.json
 * @param {string[]} requestedProviders provider names passed as cli arguments (case insensitive)
 * @returns {Record<string, object>} the providers to download fixtures for
 * @throws {Error} if a requested provider is not configured in testProvider.json
 */
export function selectProviders(testProviderConfig, requestedProviders) {
  if (requestedProviders.length === 0) return testProviderConfig;

  const availableNames = Object.keys(testProviderConfig);
  const selected = {};

  for (const requested of requestedProviders) {
    const name = availableNames.find((available) => available.toLowerCase() === requested.toLowerCase());
    if (name == null) {
      throw new Error(`Unknown provider '${requested}'. Available providers: ${availableNames.join(', ')}`);
    }
    selected[name] = testProviderConfig[name];
  }

  return selected;
}

/**
 * Removes every file inside the fixtures directory so a full download starts from a clean slate.
 * Prevents fixtures of providers that meanwhile got renamed or removed from lingering around.
 *
 * @param {string} fixturesDir the directory holding all fixtures
 * @returns {Promise<number>} the number of deleted files
 */
export async function clearFixtures(fixturesDir) {
  const entries = await readdir(fixturesDir, { withFileTypes: true });
  // dot files are infrastructure, not fixtures - deleting .gitkeep would drop the directory from git
  const files = entries.filter((entry) => entry.isFile() && !entry.name.startsWith('.'));

  await Promise.all(files.map((file) => rm(path.join(fixturesDir, file.name))));

  return files.length;
}

async function main() {
  await mkdir(FIXTURES_DIR, { recursive: true });

  const testProviderConfig = JSON.parse(await readFile(TEST_PROVIDER_PATH, 'utf-8'));
  const requestedProviders = process.argv.slice(2);
  const providersToDownload = selectProviders(testProviderConfig, requestedProviders);

  // a partial download must keep the fixtures of all other providers intact
  if (requestedProviders.length === 0) {
    const deleted = await clearFixtures(FIXTURES_DIR);
    console.log(`Removed ${deleted} existing fixture(s) before full download.`);
  }

  const {
    launchBrowser,
    closeBrowser,
    default: puppeteerExtractor,
  } = await import('../../lib/services/extractor/puppeteerExtractor.js');

  for (const [name, cfg] of Object.entries(providersToDownload)) {
    const provider = await import(`../../lib/provider/${name}.js`);
    // Providers are stateless: createConfig() returns a fresh, fully-resolved config instead of
    // the old init() mutating a shared one. `runConfig.url` is what init() used to write into
    // `provider.config.url`, including any rewrite the provider applies (immoscout's mobile API,
    // deutscheWohnen's JSON endpoint).
    const runConfig = provider.createConfig(cfg, [], []);

    switch (name) {
      case 'immoscout':
        await downloadImmoscoutFixtures(runConfig.url);
        break;
      case 'deutscheWohnen':
        await downloadDeutscheWohnenFixtures(runConfig.url, cfg.url);
        break;
      case 'immowelt':
        await downloadImmoweltFixtures(runConfig, launchBrowser, closeBrowser);
        break;
      default:
        await downloadHtmlProvider(name, runConfig, launchBrowser, closeBrowser, puppeteerExtractor);
    }
  }

  console.log(`\nFixtures downloaded for: ${Object.keys(providersToDownload).join(', ')}`);
}

// only run when executed directly, so the helpers above stay importable from tests
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('Error downloading fixtures:', err);
    process.exit(1);
  });
}
