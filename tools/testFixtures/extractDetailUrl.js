/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { loadParser, parse } from '../../lib/services/extractor/parser/parser.js';

/**
 * Extracts the detail page url of the first usable listing of a provider's list page.
 *
 * Uses the very same code path as the crawling pipeline (parser + provider normalize) instead of
 * re-implementing selector handling. That way container scoped selectors (`a@href`), attributes on
 * the container itself (`@href`) and attributes containing dashes (`.aditem@data-href`) all behave
 * exactly like they do during a real job run.
 *
 * @param {string} html the raw html of the provider's list page
 * @param {import('../../lib/types/providerConfig.js').ProviderConfig} providerConfig the initialized provider config
 * @returns {string|null} absolute url of the first listing's detail page or null if none could be determined
 */
export function extractFirstDetailUrl(html, providerConfig) {
  if (!html || !providerConfig?.crawlContainer || !providerConfig?.crawlFields) return null;

  loadParser(html);
  const parsedListings = parse(providerConfig.crawlContainer, providerConfig.crawlFields, html, providerConfig.url);
  if (parsedListings == null || parsedListings.length === 0) return null;

  for (const parsedListing of parsedListings) {
    let link;
    try {
      link = providerConfig.normalize(parsedListing)?.link;
    } catch {
      continue;
    }

    if (!link) continue;

    let absoluteLink;
    try {
      absoluteLink = new URL(link, providerConfig.url).href;
    } catch {
      continue;
    }

    if (!absoluteLink.startsWith('http')) continue;
    // some providers fall back to the list url when they cannot determine a link
    if (providerConfig.url != null && absoluteLink === new URL(providerConfig.url).href) continue;

    return absoluteLink;
  }

  return null;
}
