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
 * @property {number} [detailFetchDelayMs] How long to wait between two of the sequential `fetchDetails` calls, in milliseconds. Absent or zero means the pipeline paces nothing - for a provider whose detail reads already pace themselves, or one whose detail host has no abuse wall. A provider that reads its detail pages off a website should declare this: a run that finds a hundred new listings at once would otherwise fire a hundred detail requests as fast as the network allows, which is the behaviour that earns a block and leaves the run's listings without what only the detail page holds.
 * @property {number} [detailFetchJitterMs] Random spread added to `detailFetchDelayMs`, so the gaps are not identical. Absent means zero.
 * @property {Object} [puppeteerOptions] Puppeteer specific options.
 * @property {boolean} [enabled] Whether the provider is enabled.
 * @property {(url: string) => Promise<number> | number} [activityProbe] Cheap "is this still online?" check for a stored listing. Returns 1 when active, 0 when gone, -1 when the answer could not be obtained (bot wall, network failure).
 * @property {(url: string) => Promise<number> | number} [activeTester] Deprecated alias for `activityProbe`, still honoured by the alive-checker.
 * @property {PriceTrackingConfig} [priceTracking] How to read this provider's current price off a rendered detail page. Absent means the provider is not price-tracked.
 * @property {PriceRangeParams|null} [priceRangeParams] How this portal spells the user's price range in its search URL. Static knowledge, so it lives on the template next to `sortByDateParam`. `null` means the portal keeps its price filter out of the URL entirely.
 */

/**
 * Where a provider's search URL carries the price range the user configured on the portal.
 *
 * Two shapes. Most portals spell it as a pair of query parameters, and naming them is the whole
 * declaration; a portal that changed its parameter names may list the old ones too, so URLs users
 * saved before the change keep meaning what they meant. The rest bring their own reader: ImmoScout
 * packs both bounds into one `price=min-max` parameter and also hides them in SEO path segments,
 * Kleinanzeigen puts them in a `preis:500:1000` path segment, and neither can be named.
 *
 * Bounds are read as strings and only then coerced, so a parser never has to decide what an empty
 * or absent bound means - `priceBound` in `lib/services/tracking/priceRange.js` does that once.
 *
 * @typedef {Object} PriceRangeParams
 * @property {string|string[]} [min] Query parameter holding the lower bound, or several spellings of it, tried in order.
 * @property {string|string[]} [max] The same for the upper bound.
 * @property {(url: string) => {min: *, max: *}} [parse] Reads both bounds out of the URL itself, for a portal that does not spell them as two query parameters. Takes precedence over `min`/`max`. May throw - the caller treats that as "no range".
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
 * @property {string[]} countries ISO 3166-1 alpha-2 codes the provider serves, lowercase. Required - see `lib/services/providers/countries.js`. Read by the geocoder, which searches Nominatim within them, by the map, whose `maxBounds` is the union of their bounding boxes, and by the job form, which flags each provider with its country.
 * @property {(listing: any) => (string|null)} [countryOf] Which single country *this* listing is in, for a provider that serves several and can tell them apart. Optional: a provider covering one country has nothing to narrow, and one that cannot tell from a stored row should not guess. Returns one of the codes `countries` declares, or null to leave the answer at all of them; a code outside the declaration is discarded, because `countries` is what the job form and the map are built from and a narrowing may not widen. Read wherever a country is resolved for one listing rather than for the provider - the pipeline's geocode step, the geocoding sweep, the listing detail's "look this address up again", and the connectivity sweep, which picks a country's coverage register by it. idealista is the one shipped implementation: three national sites, one provider, and the advert's own link says which.
 */

export {};
