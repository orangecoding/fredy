/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * ZVG-Portal, the German justice portal that publishes forced-sale auctions (Zwangsversteigerungen).
 *
 * Auctions rarely show up on the commercial portals, which makes them a source of houses and plots
 * nobody else lists. The portal has no GET search: a search is a form POST, and the answer is a
 * plain, server-rendered table of auction dates. The URL a job stores therefore only *describes*
 * the search; the form fields are its query parameters, and this provider replays them as the POST:
 *
 *   https://www.zvg-portal.de/index.php?button=Suchen&land_abk=sh&obj_liste=3,15,16&plz=22880
 *
 * - `land_abk`  state code, required by the portal (sh, hh, ni, ...)
 * - `obj_liste` comma separated object type ids, as the portal's own form numbers them
 *               (1 Reihenhaus, 2 Doppelhaushälfte, 3 Einfamilienhaus, 15 Baugrundstück, 16 unbebautes Grundstück, ...)
 * - `plz`, `ort`, `str`, ... any other field of the search form, passed through unchanged
 * - `plz_prefix` (not a form field) comma separated postcode prefixes; keeps only results whose address starts with one of
 *               them, for when the search has to be a whole state but only a region is wanted (`plz_prefix=22,25`)
 *
 * The price is the court's Verkehrswert (appraised value), not an asking price: bidding can end above or below it.
 */

import * as cheerio from 'cheerio';
import { buildHash, isOneOf } from '../utils.js';
import { extractNumber } from '../utils/extract-number.js';
import logger from '../services/logger.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

const BASE_URL = 'https://www.zvg-portal.de/';
const SEARCH_ENDPOINT = `${BASE_URL}index.php?button=Suchen&all=1`;
/** Query parameters of the job URL that are not fields of the portal's search form. */
const OWN_PARAMS = new Set(['button', 'plz_prefix']);

/**
 * @param {string} url The job's search URL.
 * @returns {{body: URLSearchParams, plzPrefixes: string[]}}
 */
function parseSearchUrl(url) {
  const params = new URL(url).searchParams;
  const body = new URLSearchParams();
  body.set('ger_id', '0');
  body.set('order_by', '2');
  body.set('art', '');
  for (const [name, value] of params) {
    if (OWN_PARAMS.has(name)) continue;
    // A list-valued field is one parameter with commas in the URL and one form entry per value in the POST.
    if (name === 'obj_liste') {
      for (const id of value.split(',')) if (id.trim()) body.append('obj_liste', id.trim());
    } else {
      body.set(name, value);
    }
  }
  const plzPrefixes = (params.get('plz_prefix') ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  return { body, plzPrefixes };
}

/**
 * Turn the portal's result page into one raw object per auction.
 *
 * Exported for the tests, which feed it the recorded page.
 *
 * @param {string} html
 * @returns {Object[]}
 */
export function parseResults(html) {
  const $ = cheerio.load(html);
  const rows = [];
  let current = null;

  // One auction is a run of label/value rows ("Aktenzeichen", "Objekt/Lage", "Verkehrswert", "Termin"), separated by an <hr> row.
  $('tr').each((_, tr) => {
    const cells = $(tr).children('td');
    const label = cells.first().text().replace(/\s+/g, ' ').trim();
    const detailLink = $(tr).find('a[href*="button=showZvg"]').first();

    if (detailLink.length > 0) {
      const href = detailLink.attr('href') ?? '';
      current = {
        zvgId: new URLSearchParams(href.split('?')[1] ?? '').get('zvg_id'),
        landAbk: new URLSearchParams(href.split('?')[1] ?? '').get('land_abk'),
        fileNumber: detailLink
          .text()
          .replace(/\(Detailansicht\)/, '')
          .replace(/\s+/g, ' ')
          .trim(),
      };
      rows.push(current);
    } else if (current == null) {
      return;
    } else if (label.startsWith('Objekt/Lage')) {
      const value = cells.eq(1);
      const kind = value.find('strong').first().text().replace(/:\s*$/, '').trim();
      current.kind = kind;
      current.address = value.text().replace(/\s+/g, ' ').trim().replace(`${kind}:`, '').trim();
    } else if (label.startsWith('Verkehrswert')) {
      current.value = cells.eq(1).text().replace(/\s+/g, ' ').trim();
    } else if (label === 'Termin') {
      current.date = cells.eq(1).text().replace(/\s+/g, ' ').trim();
    } else if (label === 'Amtsgericht') {
      current.court = cells.eq(1).text().replace(/\s+/g, ' ').trim();
    }
  });

  // A cancelled date stays in the list with "Der Termin … wurde aufgehoben"; there is nothing to bid on.
  return rows.filter((row) => row.zvgId != null && !/aufgehoben/i.test(row.date ?? ''));
}

/**
 * @param {string} url The job's search URL.
 * @returns {Promise<Object[]>}
 */
async function getListings(url) {
  const { body, plzPrefixes } = parseSearchUrl(url);

  let response;
  try {
    response = await fetch(SEARCH_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
      body,
    });
  } catch (error) {
    logger.warn(`zvgPortal: search request failed: ${error.message}`);
    return [];
  }
  if (!response.ok) {
    logger.warn(`zvgPortal: search answered ${response.status}`);
    return [];
  }

  const rows = parseResults(await response.text());
  return plzPrefixes.length === 0
    ? rows
    : rows.filter((row) => plzPrefixes.some((p) => new RegExp(`\\b${p}\\d*\\s`).test(row.address ?? '')));
}

/**
 * @param {any} o
 * @returns {ParsedListing}
 */
function normalize(o) {
  // The court writes free text for an auction of several objects ("Lfd. Nr. 1: 328.000,00 EUR Lfd. Nr. 2: 1.000,00 EUR",
  // "Objekt 1: 129.000 € Objekt 2: 31.000 €"): the first amount stands for it, the full text stays in the description.
  const amount = /\d[\d.]*,(?:\d{2}|-+)|\d[\d.]*(?=\s*(?:€|(?:EUR|Euro)\b))/i.exec(o.value ?? '')?.[0];
  const price = amount ? extractNumber(amount.replace(/,-+$/, '')) : null;
  return {
    // The id is the court's record plus its appraised value; a new date for the same auction is a title change, not a new listing.
    id: buildHash(String(o.zvgId), String(price ?? '')),
    // The portal's own detail link (button=showZvg) answers "error" unless the request carries a portal Referer, which a
    // link opened from a notification never does. The search page does open, and the unknown zvg_id parameter keeps each
    // link unique (the pipeline recognises a stored listing by its link). The detail text is read in fetchDetails.
    link: `${BASE_URL}index.php?button=Termine%20suchen&land_abk=${o.landAbk ?? ''}&zvg_id=${o.zvgId}`,
    title: `Zwangsversteigerung ${o.kind || 'Objekt'}${o.date ? `, ${o.date}` : ''}`,
    price,
    size: null,
    rooms: null,
    address: o.address || null,
    description: [
      o.kind,
      o.address,
      `Aktenzeichen ${o.fileNumber}`,
      o.court,
      o.date ? `Termin ${o.date}` : null,
      price ? 'Preis ist der Verkehrswert' : null,
    ]
      .filter(Boolean)
      .join(' · '),
    image: null,
  };
}

/**
 * Enrich an auction from its detail page: the court's description, the living area and the place of the auction.
 * The page only answers with a portal Referer, which is why this is read here and not linked.
 *
 * @param {ParsedListing} listing
 * @returns {Promise<ParsedListing>}
 */
async function fetchDetails(listing) {
  try {
    const query = new URL(listing.link).searchParams;
    const url = `${BASE_URL}index.php?button=showZvg&zvg_id=${query.get('zvg_id')}&land_abk=${query.get('land_abk')}`;
    const response = await fetch(url, {
      headers: { Referer: `${BASE_URL}index.php?button=Suchen`, 'User-Agent': 'Mozilla/5.0' },
    });
    if (!response.ok) return listing;
    const text = cheerio
      .load(await response.text())('body')
      .text()
      .replace(/\s+/g, ' ');
    const description = /Beschreibung:\s*(.*?)\s*Verkehrswert/.exec(text)?.[1];
    const place = /Ort der Versteigerung:\s*(.*?)\s*(?:Informationen zum|Gericht:)/.exec(text)?.[1];
    const livingArea = /Wohnfl[äa]che(?: von)? (?:ca\.? )?([\d.,]+)\s*(?:qm|m²)/i.exec(description ?? '')?.[1];
    const plotArea = /Grundst[üu]cksgr[öo][ßs]e[^\d]{0,20}([\d.,]+)\s*(?:qm|m²)/i.exec(description ?? '')?.[1];
    return {
      ...listing,
      size: listing.size ?? extractNumber(livingArea ?? plotArea ?? ''),
      description: [listing.description, description, place ? `Ort der Versteigerung: ${place}` : null]
        .filter(Boolean)
        .join(' · '),
    };
  } catch (error) {
    logger.warn(`zvgPortal: detail page failed: ${error.message}`);
    return listing;
  }
}

/**
 * Is the auction still published? The detail page answers a bare "error" for an id that is gone, and carries the
 * Verkehrswert while it is listed. Like fetchDetails it needs the portal Referer.
 *
 * @param {string} link A stored listing's link.
 * @returns {Promise<number>} 1 listed, 0 gone, -1 could not be told.
 */
async function activityProbe(link) {
  try {
    const query = new URL(link).searchParams;
    const url = `${BASE_URL}index.php?button=showZvg&zvg_id=${query.get('zvg_id')}&land_abk=${query.get('land_abk')}`;
    const response = await fetch(url, {
      headers: { Referer: `${BASE_URL}index.php?button=Suchen`, 'User-Agent': 'Mozilla/5.0' },
    });
    if (!response.ok) return -1;
    const text = await response.text();
    if (/Verkehrswert/.test(text)) return 1;
    return text.trim().toLowerCase() === 'error' ? 0 : -1;
  } catch {
    return -1;
  }
}

/**
 * @param {ParsedListing} o
 * @param {string[]} appliedBlackList
 * @returns {boolean}
 */
function applyBlacklist(o, appliedBlackList) {
  const titleNotBlacklisted = !isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !isOneOf(o.description, appliedBlackList);
  return o.title != null && titleNotBlacklisted && descNotBlacklisted;
}

/** @type {ProviderConfig} */
const config = {
  url: null,
  requiredFieldNames: ['id', 'title', 'link', 'price', 'address'],
  crawlContainer: null,
  crawlFields: {},
  // The portal sorts by auction date (order_by=2); there is no publication date.
  sortByDateParam: null,
  priceRangeParams: null,
  getListings,
  fetchDetails,
  activityProbe,
  normalize,
  // Plain server-rendered HTML over fetch.
  needsBrowser: false,
};

export const metaInformation = {
  countries: ['de'],
  name: 'ZVG-Portal (Zwangsversteigerungen)',
  baseUrl: BASE_URL,
  id: 'zvgPortal',
};

/**
 * Build a run-scoped provider configuration.
 *
 * @param {{url: string, enabled?: boolean}} sourceConfig
 * @param {string[]} [blacklist]
 * @returns {ProviderConfig}
 */
export const createConfig = (sourceConfig, blacklist = []) => ({
  ...config,
  enabled: sourceConfig.enabled,
  url: sourceConfig.url,
  filter: (listing) => applyBlacklist(listing, blacklist ?? []),
});

export { config };
