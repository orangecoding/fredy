/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import * as cheerio from 'cheerio';
import puppeteerExtractor, { closeBrowser, launchBrowser } from '../extractor/puppeteerExtractor.js';
import { extractField } from '../extractor/parser/parser.js';
import {
  getListingsDueForPriceCheck,
  markListingsPriceChecked,
  PRICE_CHECK_STALE_MS,
} from '../storage/listingsStorage.js';
import { getSettings } from '../storage/settingsStorage.js';
import { getProviders, mapLimit } from '../../utils.js';
import { extractNumber } from '../../utils/extract-number.js';
import { getThresholdPercent, notifyPriceChanges, recordPriceChange } from './priceHistoryService.js';
import logger from '../logger.js';

/** Marks history rows written by this lane, so a later lane can be told apart in the data. */
const SOURCE = 'priceProbe';

/**
 * Re-read the price of listings that are already stored, and record what changed.
 *
 * This is the expensive sibling of the alive-checker. That one asks a yes/no question and a plain
 * request answers it; a price only exists on the rendered detail page, and for most providers that
 * page is assembled by JavaScript, so this lane needs a real browser. One rendered page per listing
 * is heavy enough that the run is bounded three ways - it does nothing at all unless the operator
 * turned it on, it takes at most `limit` listings, and it renders only `concurrency` of them at a
 * time.
 *
 * Everything runs against one browser instance, launched once and closed in `finally`. Launching
 * per listing would multiply the cost of the run by the cost of a cold browser start, and leaking
 * one on the error path would leave a Chromium process behind on every failed run.
 *
 * @param {Object} [opts]
 * @param {number} [opts.concurrency=2] Pages rendered in parallel. Low by design: each unit is a browser tab.
 * @param {number} [opts.limit] Max listings probed per run. Defaults to the configured setting.
 * @param {number} [opts.staleAfterMs] Re-probe listings not priced within this window.
 * @returns {Promise<void>}
 */
export default async function runPriceTracker(opts = {}) {
  const settings = await getSettings();
  if (!settings?.priceTrackingEnabled) {
    logger.debug('Price tracking is disabled. Skipping.');
    return;
  }

  const limit = opts.limit ?? resolvePositiveInt(settings.priceCheckLimitPerRun, 100);
  const staleAfterMs =
    opts.staleAfterMs ?? resolvePositiveInt(settings.priceCheckIntervalDays, 7) * 24 * 60 * 60 * 1000;
  const concurrency = opts.concurrency ?? 2;

  const listings = getListingsDueForPriceCheck({ limit, staleAfterMs: staleAfterMs || PRICE_CHECK_STALE_MS });
  if (listings.length === 0) {
    logger.debug('No listings due for a price check.');
    return;
  }

  const providers = await getProviders();
  /** @type {Record<string, any>} */
  const providerById = Object.create(null);
  for (const provider of providers) {
    const id = provider?.metaInformation?.id;
    if (id) providerById[id] = provider;
  }

  // A provider without a priceTracking block is not an error - it simply has no price extractor
  // yet. Dropping those before the browser starts means an instance that uses only such providers
  // never pays for a launch at all.
  const trackable = listings.filter((listing) => providerById[listing.provider]?.config?.priceTracking != null);
  if (trackable.length === 0) {
    logger.debug(`None of the ${listings.length} due listings belong to a price-tracked provider.`);
    return;
  }

  const thresholdPercent = await getThresholdPercent();

  /** @type {string[]} Every listing we attempted, so none of them stays permanently due. */
  const attemptedIds = [];
  /** @type {import('../../utils/formatListing.js').PriceChange[]} */
  const changes = [];

  /** @type {Promise<any>|null} */
  let browserPromise = null;
  /**
   * Launch the shared browser on first need, and only then.
   *
   * A provider that reads its price from an API never needs one, so an instance configured only
   * with such providers must not pay for a Chromium start it will not use.
   *
   * The *promise* is memoized rather than the browser it resolves to. Workers run concurrently, so
   * caching the resolved value leaves a window between the check and the assignment in which every
   * worker still sees "no browser yet" and launches its own. Only one of those ever gets closed;
   * the rest survive the run as orphaned Chromium processes.
   *
   * @returns {Promise<any>}
   */
  const ensureBrowser = () => {
    if (browserPromise == null) {
      browserPromise = launchBrowser(trackable[0].link, { proxyUrl: settings.proxyUrl });
    }
    return browserPromise;
  };

  try {
    await mapLimit(trackable, concurrency, async (listing) => {
      const provider = providerById[listing.provider];
      attemptedIds.push(listing.id);

      const price = await readPrice(listing, provider, ensureBrowser);
      if (price == null) {
        logger.debug(`No price could be read for listing ${listing.id} (${listing.provider}).`);
        return;
      }

      const change = recordPriceChange(listing, price, { source: SOURCE, thresholdPercent });
      if (change != null) changes.push(change);
    });
  } catch (error) {
    logger.error('Price tracking run failed.', error);
  } finally {
    if (browserPromise != null) {
      // Awaited rather than ignored: a launch still in flight when the run aborts would otherwise
      // resolve into a browser nobody holds a reference to any more.
      await browserPromise.then(closeBrowser).catch(() => {});
    }
  }

  if (attemptedIds.length > 0) markListingsPriceChecked(attemptedIds);

  logger.info(
    `Price check looked at ${attemptedIds.length} of ${listings.length} due listings, ${changes.length} changed enough to report.`,
  );

  await notifyPriceChanges(changes);
}

/**
 * Render a listing's page and pull the price out of it.
 *
 * Returns null for every failure mode - bot wall, timeout, a page that rendered but has no price
 * where the provider expected one. That is deliberately indistinguishable to the caller: "we do not
 * know this listing's price right now" must never be recorded as a change, because a null read
 * treated as a number is a fabricated price drop to zero.
 *
 * @param {{id: string, link: string, provider: string}} listing
 * @param {any} provider The provider module.
 * @param {() => Promise<any>} ensureBrowser Lazily launches and returns the shared browser.
 * @returns {Promise<number|null>}
 */
async function readPrice(listing, provider, ensureBrowser) {
  const priceTracking = provider.config.priceTracking;
  try {
    // Providers that reach their price through an API answer for themselves; no page is rendered.
    if (typeof priceTracking.probe === 'function') {
      return sanitizePrice(await priceTracking.probe(listing));
    }

    const html = await puppeteerExtractor(listing.link, priceTracking.waitForSelector ?? null, {
      ...(provider.config.puppeteerOptions ?? {}),
      browser: await ensureBrowser(),
      name: `price_${listing.provider}`,
    });
    // puppeteerExtractor answers null on bot detection and on navigation errors alike.
    if (!html) return null;

    const raw =
      typeof priceTracking.extract === 'function'
        ? priceTracking.extract(html, listing)
        : extractField(cheerio.load(html).root(), priceTracking.selector);

    return sanitizePrice(raw);
  } catch (error) {
    logger.debug(`Price probe threw for listing ${listing.id}`, error);
    return null;
  }
}

/**
 * Coerce whatever a provider handed back into a usable price, or null.
 *
 * Zero and negative values are rejected rather than stored: no listing costs nothing, so a zero is
 * always a parse that went wrong, and storing it would report a 100% drop to every user watching
 * that listing.
 *
 * @param {string|number|null|undefined} raw
 * @returns {number|null}
 */
function sanitizePrice(raw) {
  if (raw == null) return null;
  const value = typeof raw === 'number' ? raw : extractNumber(String(raw));
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value);
}

/**
 * @param {any} value
 * @param {number} fallback
 * @returns {number}
 */
function resolvePositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
