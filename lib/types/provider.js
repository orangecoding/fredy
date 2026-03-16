/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/** @import { ParsedListing } from './listing.js' */

/**
 * @typedef {Object} ProviderConfig
 * @property {string} url Base URL to crawl.
 * @property {string} [sortByDateParam] Query parameter used to enforce sorting by date.
 * @property {string} [waitForSelector] CSS selector to wait for before parsing content.
 * @property {Object.<string, string>} crawlFields Mapping of field names to selectors/paths.
 * @property {string} crawlContainer CSS selector for the container holding listing items.
 * @property {(raw: any) => ParsedListing} normalize Function to convert raw scraped data into a ParsedListing shape.
 * @property {(listing: ParsedListing) => boolean} filter Function to filter out unwanted listings.
 * @property {(url: string, waitForSelector?: string) => Promise<void> | Promise<ParsedListing[]>} [getListings] Optional override to fetch listings.
 * @property {Object} [puppeteerOptions] Puppeteer specific options.
 */

export {};
