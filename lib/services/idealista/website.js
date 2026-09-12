/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import * as cheerio from 'cheerio';
import { fetchSearchHtml } from './idealistaSearch.js';
import { sleep } from '../../utils.js';
import logger from '../logger.js';

const LISTING_SELECTOR = 'article.item';
const PAGE_SIZE = 30;
const MAX_PAGES = 20;
const PAGE_DELAY_MS = 3_500;
const PAGE_JITTER_MS = 2_500;
const PAGE_SUFFIX = /\/lista-\d+(\.htm)?$/;
const DRAWN_PATH = /^\/(?:[a-z]{2}\/)?are(?:e|as)\//;

/**
 * Collapse the whitespace the markup is indented with.
 *
 * @param {string|undefined} text
 * @returns {string}
 */
function tidy(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Read the adverts out of a rendered search page.
 *
 * One parser for the three sites: they serve the same card, and everything language-specific about
 * it - the room count's label, the property type in front of the address - is read where the
 * listing is normalised, so nothing here has to know which country it is looking at.
 *
 * @param {string|null|undefined} html the raw html of a search result page
 * @param {string} [readFrom] the url the page was read from, which is what a relative advert link
 *   is resolved against. Without it a link stays as the markup wrote it, which is a link no
 *   notification can follow - every caller in the provider passes one.
 * @returns {any[]} the raw adverts, empty when the page carried none
 */
export function parseListings(html, readFrom) {
  if (html == null) return [];
  const $ = cheerio.load(html);

  return $(LISTING_SELECTOR)
    .map((_, element) => {
      const card = $(element);
      const anchor = card.find('a.item-link').first();
      // The "Obra nueva" / "Nuova costruzione" carousel is built out of `article.item` too, but its
      // cards advertise a development rather than a flat: no price, no living area, and a link that
      // opens the project. They carry no `item-link`, which is what separates them here.
      if (anchor.length === 0) return null;

      // The freshness marker ("2 minuti", "20 ago") sits in this list next to the real
      // characteristics, so each field is matched by shape rather than by position.
      const characteristics = card
        .find('.item-detail-char .item-detail')
        .map((__, detail) => tidy($(detail).text()))
        .get();

      const href = anchor.attr('href');
      return {
        id: card.attr('data-element-id') ?? null,
        // The `title` attribute holds the same text as the anchor but without the surrounding
        // whitespace the markup is indented with.
        title: tidy(anchor.attr('title') ?? anchor.text()) || null,
        link: href == null ? null : absolute(href, readFrom),
        price: tidy(card.find('.item-price').first().text()),
        characteristics,
        description: tidy(card.find('.item-description').first().text()) || null,
        // Adverts published without photos exist on every one of the three sites and say so in
        // place of the gallery, so an image is a nice-to-have rather than a reason to drop the
        // listing. The gallery is looked in first: a card without one still carries the portal's
        // own marks, and the first `img` of those is a logo.
        image: card.find('picture.item-multimedia img').first().attr('src') ?? null,
      };
    })
    .get()
    .filter((advert) => advert != null);
}

/**
 * @param {string} href as the markup wrote it
 * @param {string|undefined} readFrom the page the link was found on
 * @returns {string} the advert's own url
 */
function absolute(href, readFrom) {
  try {
    return new URL(href, readFrom).toString();
  } catch {
    return href;
  }
}

/**
 * Address one page of a search.
 *
 * The paginator hangs the page off the search path, so a url already naming a page is rewritten
 * rather than appended to.
 *
 * @param {string} url the search url
 * @param {number} page the page to read, counted from one
 * @returns {string} the url of that page
 */
export function pageUrl(url, page) {
  const parsed = new URL(url);
  const search = parsed.pathname.replace(PAGE_SUFFIX, '/');
  const suffix = DRAWN_PATH.test(search) ? `lista-${page}` : `lista-${page}.htm`;
  parsed.pathname = page <= 1 ? search : `${search.replace(/\/+$/, '')}/${suffix}`;
  return parsed.toString();
}

/**
 * @returns {Promise<void>} a wait of one jittered page delay
 */
function pause() {
  return sleep(PAGE_DELAY_MS + Math.random() * PAGE_JITTER_MS);
}

/**
 * Read one result page through the run's own browser, waiting out the challenge in front of it.
 *
 * @param {string} url the url of the page
 * @param {any} browser the shared browser of the current job run
 * @returns {Promise<any[]>} the adverts on it, empty when the challenge did not clear
 */
async function readPageInBrowser(url, browser) {
  if (browser == null) {
    logger.error('Idealista website searches require the job browser.');
    return [];
  }

  const html = await fetchSearchHtml(url, browser);
  return html == null ? [] : parseListings(html, url);
}

/**
 * Read every result page a search spreads over.
 *
 * @param {string} url the search url
 * @param {any} [browser] The shared browser of the current job run.
 * @returns {Promise<any[]>} the adverts of every result page the search has
 */
export async function readSearch(url, browser) {
  const adverts = [];
  const seen = new Set();

  for (let page = 1; page <= MAX_PAGES; page++) {
    if (page > 1) await pause();
    const found = await readPageInBrowser(pageUrl(url, page), browser);
    if (found == null) break;

    const fresh = found.filter((advert) => advert.id != null && !seen.has(advert.id));
    for (const advert of fresh) seen.add(advert.id);
    adverts.push(...fresh);

    // A page past the last one comes back as the first one again, so a page carrying nothing new
    // is the end of the results whatever its length says.
    if (found.length < PAGE_SIZE || fresh.length === 0) break;
    if (page === MAX_PAGES) {
      logger.warn(`Idealista: stopped after ${MAX_PAGES} pages. Narrow the search to see the rest.`);
    }
  }

  return adverts;
}
