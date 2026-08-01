/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import * as cheerio from 'cheerio';
import logger from '../../logger.js';

/**
 * Parse the listing containers out of a page.
 *
 * The Cheerio document is built here rather than being kept in module scope. It used to be a
 * module-level `$` populated by a separate `loadParser()` call, which meant a second extraction
 * starting between load and parse silently replaced the document the first one was about to read.
 *
 * @param {string} crawlContainer Selector matching one element per listing.
 * @param {Record<string, string>} crawlFields Field name to selector (with optional `@attr` and `|modifiers`).
 * @param {string|null|undefined} text The page HTML.
 * @param {string} url Only used for log context.
 * @returns {Object[]|null} One object per listing, or null when the page yielded nothing usable.
 */
export function parse(crawlContainer, crawlFields, text, url) {
  if (!text) {
    logger.debug('No content found for ', url);
    return null;
  }

  if (!crawlContainer || !crawlFields) {
    logger.debug('Cannot parse, selector was empty for url ', url);
    return null;
  }

  const $ = cheerio.load(text);
  const result = [];

  if ($(crawlContainer).length === 0) {
    logger.debug('No elements in crawl container found for url ', url);
    return null;
  }

  $(crawlContainer).each((_, element) => {
    const container = $(element);
    const parsedObject = {};

    // Parse fields based on crawlFields
    for (const [key, fieldSelector] of Object.entries(crawlFields)) {
      try {
        parsedObject[key] = extractField(container, fieldSelector);
      } catch (error) {
        logger.error(`Error parsing field '${key}' with selector '${fieldSelector}':`, error);
        parsedObject[key] = null;
      }
    }

    if (parsedObject.id != null) {
      result.push(parsedObject);
    } else {
      logger.debug('ID not found. Not relaying object.');
    }
  });

  return result;
}

/**
 * Read one value out of a scope using the `selector[@attr] | modifier | modifier` mini-syntax.
 *
 * Split out of {@link parse} so the same syntax works away from a search-results page. The price
 * probe reads a single field out of a whole detail document, and reimplementing the syntax there
 * would mean two parsers drifting apart over a selector language that providers already write
 * against.
 *
 * @param {import('cheerio').Cheerio<any>} scope The element to search within. Pass `$.root()` for a whole document.
 * @param {string} fieldSelector e.g. `'.price | removeNewline | trim'` or `'[itemprop="price"]@content'`.
 * @returns {string|number|null} The value, or null when the selector matched nothing.
 */
export function extractField(scope, fieldSelector) {
  if (!fieldSelector) return null;
  let value;

  const selector = fieldSelector.includes('|')
    ? fieldSelector.substring(0, fieldSelector.indexOf('|')).trim()
    : fieldSelector;

  if (selector.includes('@')) {
    const [sel, attr] = selector.split('@');
    if (sel.length === 0) {
      value = scope.attr(attr.trim());
    } else {
      value = scope.find(sel.trim()).attr(attr.trim());
    }
  } else {
    value = scope.find(selector.trim()).text();
  }

  if (fieldSelector.includes('|')) {
    /* eslint-disable no-unused-vars */
    const [_, ...modifiers] = fieldSelector.split('|').map((s) => s.trim());
    /* eslint-enable no-unused-vars */
    value = applyModifiers(value, modifiers);
  }

  return value || null;
}

// Helper function to apply modifiers
function applyModifiers(value, modifiers) {
  if (!value) return value;

  modifiers.forEach((modifier) => {
    switch (modifier) {
      case 'int':
        value = parseInt(value, 10);
        break;
      case 'trim':
        value = value.replace(/\s+/g, ' ').trim();
        break;
      case 'removeNewline':
        value = value.replace(/\n/g, ' ');
        break;
      default:
        logger.warn(`Unknown modifier: ${modifier}`);
    }
  });

  return value;
}
