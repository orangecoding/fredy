/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The shared browser behind on-demand detail enrichment ("enrich on click").
 *
 * Scrape-time enrichment reuses a browser that already ran the full search flow, so DataDome
 * has seen real API traffic on its session. Minting a zero-history browser per click is the
 * opposite shape - a fresh fingerprint whose first act is a deep exposé fetch - and is answered
 * with 403. This module therefore keeps exactly one enrichment browser:
 *
 * - It launches lazily on the first enriching click and stays open, so the session warms once.
 * - It runs on a persistent profile directory next to the database, so DataDome's cookies
 *   survive restarts instead of every boot starting zero-history again.
 * - Callers are serialized through a chain: concurrent clicks share the session one after the
 *   other, which is also the least bot-like traffic shape.
 * - The spawn itself is bounded. Everything after it already has timeouts (warmup navigation,
 *   DataDome cookie wait, exposé XHR, per-image caps); only the Chromium spawn could hang
 *   forever and wedge the request - and the spinner - with it.
 * - A provider refused by DataDome cools down instead of being hammered: every further attempt
 *   during the cooldown answers immediately without spending another warmup on a known verdict.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import logger from '../logger.js';
import { computeDbPath } from '../storage/SqliteConnection.js';
import { getSettings } from '../storage/settingsStorage.js';
import { launchBrowser, closeBrowser } from '../extractor/puppeteerExtractor.js';

/** How long a Chromium spawn may take before the enrichment gives up as unavailable. */
export const ENRICH_BROWSER_SPAWN_TIMEOUT_MS = 30_000;

/**
 * How long a DataDome-refused provider is left alone. Long enough to outlast a flag wave,
 * short enough that a genuinely recovered session is retried within the same browsing session.
 */
export const ENRICH_REFUSED_COOLDOWN_MS = 15 * 60 * 1000;

/** The running browser, or the promise of the one being spawned. */
let browserPromise = null;

/** The proxy the running browser was launched with; a change relaunches it. */
let browserProxyUrl = null;

/** Callers take turns: each waits for the previous enrichment to settle first. */
let turn = Promise.resolve();

/** Provider id to the timestamp until which its enrichment answers immediately. */
const cooledUntil = new Map();

/**
 * Where the enrichment profile lives. Next to the database, so the `./fredy/db:/db` volume
 * that already persists `listings.db` keeps the DataDome cookies too.
 *
 * @returns {Promise<string>} Absolute path of the profile directory, created if needed.
 */
export async function resolveEnrichmentProfileDir() {
  if (process.env.ENRICHMENT_PROFILE_DIR && process.env.ENRICHMENT_PROFILE_DIR.trim().length > 0) {
    const dir = path.resolve(process.env.ENRICHMENT_PROFILE_DIR.trim());
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }
  const { dir } = await computeDbPath();
  const profileDir = path.join(dir, 'enrichment-profile');
  await fs.mkdir(profileDir, { recursive: true });
  return profileDir;
}

/**
 * Whether this provider was recently refused and should not be attempted again yet.
 *
 * @param {string} providerId
 * @param {number} [now=Date.now()]
 * @returns {boolean}
 */
export function isProviderCoolingDown(providerId, now = Date.now()) {
  return (cooledUntil.get(providerId) ?? 0) > now;
}

/**
 * Leave a refused provider alone for {@link ENRICH_REFUSED_COOLDOWN_MS}.
 *
 * @param {string} providerId
 * @param {number} [now=Date.now()]
 * @returns {void}
 */
export function coolDownProvider(providerId, now = Date.now()) {
  cooledUntil.set(providerId, now + ENRICH_REFUSED_COOLDOWN_MS);
}

/**
 * Launch the shared browser, or hand back the running one.
 *
 * A proxy change relaunches: the proxy is fixed at spawn, so without this a URL changed in
 * the UI would only take effect after a backend restart - the same staleness the job runs
 * avoid by reading the setting live.
 *
 * @param {string} url Carried to the spawn for locale/timezone hints.
 * @param {Object} [options]
 * @param {number} [options.spawnTimeoutMs=ENRICH_BROWSER_SPAWN_TIMEOUT_MS] Bound on the spawn;
 *   injectable so tests need not wait out the production budget.
 * @returns {Promise<import('puppeteer-core').Browser>}
 * @throws {Error} When the spawn exceeds the budget.
 */
async function getSharedBrowser(url, { spawnTimeoutMs = ENRICH_BROWSER_SPAWN_TIMEOUT_MS } = {}) {
  const liveSettings = await getSettings();
  const proxyUrl = typeof liveSettings?.proxyUrl === 'string' ? liveSettings.proxyUrl.trim() : '';

  if (browserPromise && proxyUrl !== browserProxyUrl) {
    logger.debug('Enrichment proxy changed, relaunching the shared browser.');
    const stale = browserPromise;
    browserPromise = null;
    await stale.then((browser) => closeBrowser(browser)).catch(() => {});
  }

  if (!browserPromise) {
    browserProxyUrl = proxyUrl;
    browserPromise = (async () => {
      const profileDir = await resolveEnrichmentProfileDir();
      const spawned = await Promise.race([
        launchBrowser(url, {
          ...(proxyUrl ? { proxyUrl } : {}),
          userDataDir: profileDir,
        }),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error(`Enrichment browser spawn timed out after ${spawnTimeoutMs} ms`)),
            spawnTimeoutMs,
          ),
        ),
      ]);
      if (!spawned || typeof spawned.newPage !== 'function') {
        throw new Error('Enrichment browser spawn answered with no browser');
      }
      return spawned;
    })().catch((error) => {
      // A failed spawn must not poison every later click: the next caller tries again.
      browserPromise = null;
      throw error;
    });
  }

  const browser = await browserPromise;
  if (browser.connected === false) {
    browserPromise = null;
    return getSharedBrowser(url, { spawnTimeoutMs });
  }
  return browser;
}

/**
 * Run `fn` with the shared enrichment browser, one caller at a time.
 *
 * The browser outlives the call - closing it per click would throw away the warmed session
 * this module exists to keep. A caller that finds its session refused should drop just the
 * page (e.g. immowelt's `releaseSession`), never the browser.
 *
 * @template T
 * @param {(browser: import('puppeteer-core').Browser) => Promise<T>} fn
 * @param {string} url Carried to a first-time spawn for locale/timezone hints.
 * @param {Object} [options] Passed through to the spawn (see `getSharedBrowser`).
 * @returns {Promise<T>}
 */
export async function withEnrichmentBrowser(fn, url, options) {
  const previous = turn;
  let release;
  turn = new Promise((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await fn(await getSharedBrowser(url, options));
  } finally {
    release();
  }
}
