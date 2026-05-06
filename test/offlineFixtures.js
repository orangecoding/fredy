/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, 'testFixtures');

const testProviderConfig = JSON.parse(
  await readFile(new URL('./provider/testProvider.json', import.meta.url), 'utf-8'),
);

// hostname → providerName, built from testProvider.json
const hostnameToProvider = {};
// providerName → list page pathname (for distinguishing list vs detail URLs)
const providerListPath = {};

for (const [name, cfg] of Object.entries(testProviderConfig)) {
  if (!cfg.url) continue;
  try {
    const parsed = new URL(cfg.url);
    hostnameToProvider[parsed.hostname] = name;
    providerListPath[name] = parsed.pathname;
  } catch {
    // skip malformed URLs
  }
}

async function tryReadFile(filepath) {
  try {
    return await readFile(filepath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Returns fixture HTML for the given URL by mapping hostname → provider name,
 * then distinguishing list vs detail pages by comparing the URL path against
 * the configured list URL path from testProvider.json.
 */
export async function readFixture(url) {
  let hostname, pathname;
  try {
    const parsed = new URL(url);
    hostname = parsed.hostname;
    pathname = parsed.pathname;
  } catch {
    return null;
  }

  const providerName = hostnameToProvider[hostname];
  if (!providerName) return null;

  if (providerListPath[providerName] === pathname) {
    return tryReadFile(path.join(FIXTURES_DIR, `${providerName}.html`));
  }

  // Detail page: prefer dedicated detail fixture, fall back to list fixture
  const detailHtml = await tryReadFile(path.join(FIXTURES_DIR, `${providerName}_detail.html`));
  if (detailHtml) return detailHtml;
  return tryReadFile(path.join(FIXTURES_DIR, `${providerName}.html`));
}

/**
 * Returns a fetch replacement that intercepts immoscout mobile API calls and
 * serves pre-downloaded JSON fixtures. Throws for any other URL to prevent
 * accidental live network traffic in offline mode.
 */
export function buildFetchMock() {
  let listData = null;
  let detailData = null;

  return async (url) => {
    const urlStr = String(url);

    if (urlStr.includes('api.mobile.immobilienscout24.de/search/list')) {
      if (!listData) {
        const raw = await tryReadFile(path.join(FIXTURES_DIR, 'immoscout_list.json'));
        listData = raw ? JSON.parse(raw) : { resultListItems: [] };
      }
      return { ok: true, status: 200, json: () => Promise.resolve(listData) };
    }

    if (urlStr.includes('api.mobile.immobilienscout24.de/expose/')) {
      if (!detailData) {
        const raw = await tryReadFile(path.join(FIXTURES_DIR, 'immoscout_detail.json'));
        detailData = raw ? JSON.parse(raw) : { sections: [], contact: {} };
      }
      return { ok: true, status: 200, json: () => Promise.resolve(detailData) };
    }

    throw new Error(`Network request blocked in offline mode: ${urlStr}`);
  };
}
