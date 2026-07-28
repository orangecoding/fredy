/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/** @import { ParsedListing } from './listing.js' */

/**
 * Configuration for one provider, scoped to a single pipeline run.
 *
 * Provider modules export a static template plus `createConfig(sourceConfig, blacklist)`, which
 * returns a fresh instance of this shape per run. Nothing here may be shared between runs: two
 * jobs can execute concurrently, and a shared object let the second one overwrite the first one's
 * `url` and bound `filter` mid-run.
 *
 * @typedef {Object} ProviderConfig
 * @property {string} [url] The search URL for this run. Null on the static template.
 * @property {string} [refererUrl] Original search URL, when the provider queries an API and has to send the page it came from as the referer.
 * @property {string} [sortByDateParam] Query parameter used to enforce sorting by date.
 * @property {string} [waitForSelector] CSS selector to wait for before parsing content.
 * @property {Object.<string, string>} crawlFields Mapping of field names to selectors/paths.
 * @property {string[]} requiredFieldNames List of field names that this provider supports.
 * @property {string} [crawlContainer] CSS selector for the container holding listing items.
 * @property {(raw: any) => ParsedListing} normalize Function to convert raw scraped data into a ParsedListing shape.
 * @property {(listing: ParsedListing) => boolean} filter Filters out unwanted listings. Bound to this run's blacklist by `createConfig`, so it is absent from the static template.
 * @property {(url: string, browser?: any) => Promise<any[]>} [getListings] Optional override to fetch listings. Receives the shared browser instance.
 * @property {(listing:ParsedListing, browser:any)=>Promise<ParsedListing>} [providerConfig.fetchDetails] Optional per-listing detail enrichment. Called sequentially for each new listing after deduplication. Receives the shared browser instance. Must always resolve (never reject).
 * @property {Object} [puppeteerOptions] Puppeteer specific options.
 * @property {boolean} [enabled] Whether the provider is enabled.
 * @property {(url: string) => Promise<number> | number} [activeTester] Function to check if a listing is still active.
 */

export {};
