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
 * @property {(url: string) => Promise<number> | number} [activityProbe] Cheap "is this still online?" check for a stored listing. Returns 1 when active, 0 when gone, -1 when the answer could not be obtained (bot wall, network failure).
 * @property {(url: string) => Promise<number> | number} [activeTester] Deprecated alias for `activityProbe`, still honoured by the alive-checker.
 * @property {PriceTrackingConfig} [priceTracking] How to read this provider's current price off a rendered detail page. Absent means the provider is not price-tracked.
 */

/**
 * How the price probe reads one provider's price.
 *
 * Exactly one of `selector` and `extract` is required. `selector` uses the same
 * `selector[@attr] | modifier` syntax as `crawlFields` and covers providers whose price is in the
 * markup; `extract` exists for the ones that carry it in embedded JSON (`__NEXT_DATA__`, JSON-LD, a
 * data attribute, an API response), where no selector can reach it.
 *
 * Whatever is returned must be the *same* figure the search-results page yields for that listing.
 * Detail pages routinely show several prices - Kaltmiete, Warmmiete, Gesamtmiete - and picking a
 * different one than the list scraper does makes every listing of that provider report a fake
 * change on its first probe.
 *
 * A provider that reaches its price through an API rather than a page supplies `probe` instead.
 * That skips the browser entirely for its listings, which for such a provider is both cheaper and
 * far less likely to be blocked than rendering the public page would be.
 *
 * @typedef {Object} PriceTrackingConfig
 * @property {string} [selector] Field selector applied to the whole rendered document.
 * @property {(html: string, listing: {id: string, link: string, provider: string}) => number|string|null} [extract] Reads the price out of the raw page. Must return null rather than 0 when the price cannot be found.
 * @property {(listing: {id: string, link: string, provider: string}) => Promise<number|string|null>} [probe] Fetches the price itself, without a browser. Takes precedence over `selector`/`extract`.
 * @property {string|null} [waitForSelector] Selector to wait for before reading, same meaning as the top-level one.
 */

/**
 * The provider's identity, exported as `metaInformation` alongside `config` and `createConfig`.
 *
 * Static and run-independent, which is why it is a plain object rather than something
 * `createConfig` hands out: the id names the provider in job configs, in listing rows and in the
 * `/api/jobs/provider` response the UI builds its provider picker from.
 *
 * @typedef {Object} ProviderMetaInformation
 * @property {string} id Stable identifier. Stored on every listing this provider finds, so renaming one orphans its listings.
 * @property {string} name Display name, shown in the UI.
 * @property {string} baseUrl The portal's root, used to build absolute links out of relative ones.
 * @property {string[]} [countries] ISO 3166-1 alpha-2 codes the provider serves, lowercase. Absent means `['de']` - see `lib/services/providers/countries.js`. Read by the geocoder, which searches Nominatim within them, and by the map, whose `maxBounds` is the union of their bounding boxes.
 */

export {};
