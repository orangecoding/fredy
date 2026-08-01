/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import * as cheerio from 'cheerio';

/**
 * Read the offer price out of a page's JSON-LD blocks.
 *
 * Several portals publish a `schema.org` `Offer` for the same figure their listing page shows, and
 * a structured number beats a selector against markup that gets restyled every few months. Pages
 * often carry more than one block (breadcrumbs, organisation, the listing itself), so every block
 * is searched and the first usable `offers.price` wins.
 *
 * @param {string} html Raw page HTML.
 * @returns {number|null} The price, or null when no block carries one.
 */
export function readJsonLdPrice(html) {
  if (!html) return null;
  const $ = cheerio.load(html);
  const blocks = $('script[type="application/ld+json"]').toArray();

  for (const block of blocks) {
    const raw = $(block).text();
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Invalid JSON-LD is common: immobilien.de, for one, emits raw newlines inside its
      // description string, which is enough for JSON.parse to reject an otherwise perfectly good
      // block. Falling back to a text scan means one unescaped character in a field nobody reads
      // does not cost us the price.
      const price = readPriceToken(raw);
      if (price != null) return price;
      continue;
    }
    const price = findOfferPrice(parsed);
    if (price != null) return price;
  }
  return null;
}

/**
 * Pull a `"price":` value out of a JSON-LD block that would not parse, but only when it is
 * unambiguous.
 *
 * The whole value is taken first and only then validated, rather than being matched by a pattern
 * that stops at the first thing resembling a number. A pattern is what makes this dangerous:
 * against `"price":"1.600,00"` a regex for "digits, optionally a dot and decimals" happily matches
 * the leading `1.600` and reports one euro sixty.
 *
 * Only strict machine format is accepted, because that is the only form schema.org permits and the
 * only form that can be read without guessing. `1.600` alone is one thousand six hundred to a
 * German portal and one point six to a machine-format parser, and nothing in the text says which.
 * Refusing costs a single observation; guessing wrong writes a plausible, silently wrong price into
 * the history of every listing the provider has.
 *
 * @param {string} raw The block's text content.
 * @returns {number|null}
 */
function readPriceToken(raw) {
  const match = raw.match(/"price"\s*:\s*(.{0,48})/s);
  if (!match) return null;

  const rest = match[1];
  const token = rest.startsWith('"')
    ? rest.slice(1, rest.indexOf('"', 1) === -1 ? undefined : rest.indexOf('"', 1))
    : (rest.match(/^[0-9.,\s]+/)?.[0] ?? '');

  // Trailing separators belong to the surrounding JSON, not to the number.
  const cleaned = token.replace(/[,\s]+$/, '').trim();
  return /^\d+(?:\.\d+)?$/.test(cleaned) ? sanitize(cleaned) : null;
}

/**
 * Walk an arbitrary JSON-LD value looking for the first `offers.price`.
 *
 * Recursive because the shape varies: a bare object, an `@graph` array, a list of blocks, or an
 * `offers` that is itself an array of offers.
 *
 * @param {any} node
 * @param {number} [depth=0] Guards against a self-referential document.
 * @returns {number|null}
 */
function findOfferPrice(node, depth = 0) {
  if (node == null || depth > 8) return null;

  if (Array.isArray(node)) {
    for (const entry of node) {
      const found = findOfferPrice(entry, depth + 1);
      if (found != null) return found;
    }
    return null;
  }

  if (typeof node !== 'object') return null;

  if (node.offers != null) {
    const offers = Array.isArray(node.offers) ? node.offers : [node.offers];
    for (const offer of offers) {
      const price = sanitize(offer?.price);
      if (price != null) return price;
    }
  }

  for (const value of Object.values(node)) {
    if (value != null && typeof value === 'object') {
      const found = findOfferPrice(value, depth + 1);
      if (found != null) return found;
    }
  }
  return null;
}

/**
 * Read the JSON payload Next.js embeds in `#__NEXT_DATA__`.
 *
 * Four providers already parse this same script tag inside their `fetchDetails`; the price probe
 * needs it too, and a fifth hand-rolled copy of "find the tag, JSON.parse it, tolerate its absence"
 * is a fifth place to get the error handling subtly wrong.
 *
 * @param {string} html Raw page HTML.
 * @returns {any|null} The parsed payload, or null when the tag is absent or unparseable.
 */
export function readNextData(html) {
  if (!html) return null;
  try {
    const raw = cheerio.load(html)('#__NEXT_DATA__').text();
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Coerce a *machine-formatted* price into a positive number, or null.
 *
 * Structured sources - JSON-LD `offers.price`, a microdata `content` attribute, an API field - are
 * specified as plain English-decimal numbers: `1600.00` means one thousand six hundred. They must
 * not go through {@link extractNumber}, which exists for the German display strings the scrapers
 * read ("1.600 €") and therefore treats a dot as a thousands separator. Feeding it `"1600.00"`
 * yields 160000, a hundredfold price that would be recorded as a spectacular increase for every
 * listing of that provider at once.
 *
 * Zero is rejected on purpose: nothing is listed for nothing, so a zero always means the parse went
 * wrong, and letting it through would be recorded as a total price collapse.
 *
 * @param {any} raw
 * @returns {number|null}
 */
export function sanitize(raw) {
  if (raw == null) return null;
  const value = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/[^\d.-]/g, ''));
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return value;
}
