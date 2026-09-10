/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Reads an idealista search off the website, which is what happens when the mobile api cannot be
 * asked for it - see `./search.js` for when that is. It reads all three national sites: the markup
 * of a result card is identical down to the class names, and what differs is the language inside
 * it, which the provider's readers account for.
 *
 * A bot wall sits in front of every page, and there are two ways through it.
 *
 * `FREDY_CHALLENGE_SOLVER_URL` names an external scrape service that renders the page and returns
 * the `datadome` cookie it earned. That cookie is the session: carrying it, a plain request reads
 * any search page, so the service is called only when there is no working one. The cookie rotates
 * on every response, so each reply's `Set-Cookie` replaces the stored value, and requests are
 * serialized to stop two in flight overwriting each other's rotation.
 *
 * With no solver configured there is still the browser the job run already holds: DataDome's
 * interstitial is a JavaScript challenge that solves itself in a browser and then reloads the page
 * that was asked for, which is what `./idealistaSearch.js` waits out. It is the slower and the less
 * reliable of the two - an address DataDome dislikes is escalated to a captcha no wait clears - and
 * it is what this provider did before the solver existed, so it is what stands in when there is
 * none.
 *
 * A run reads the whole result set rather than the first page of it. The website serves no ordering
 * Fredy may ask for - its robots.txt disallows the publication sort - so a new advert lands wherever
 * the portal's own ranking puts it, which on a wide search is rarely the first page. The api has no
 * such rule, which is the main reason to prefer it.
 */

import * as cheerio from 'cheerio';
import { challengeSolverUrl, solveChallenge } from '../extractor/challengeSolver.js';
import { fetchSearchHtml } from './idealistaSearch.js';
import { portalOf } from './portal.js';
import { sleep } from '../../utils.js';
import logger from '../logger.js';

/** One result card. `article.item` also matches the "new development" carousel, which has no link. */
const LISTING_SELECTOR = 'article.item';
const COOKIE_NAME = 'datadome';

/** Adverts on a full result page, which is what tells the last page from the ones before it. */
const PAGE_SIZE = 30;

/** How many result pages one run reads, so a search covering a whole region cannot walk forever. */
const MAX_PAGES = 20;

/**
 * How long to wait between two result pages.
 *
 * DataDome reads the pace as well as the client: a walk that turns the pages as fast as the network
 * allows earns a captcha the solver cannot clear, and the address stays blocked for hours. Ten
 * pages a second apart was enough to trigger it, so the gap is the one a reader would leave. The
 * jitter keeps the gaps from being identical, which is its own signal.
 */
const PAGE_DELAY_MS = 3_500;
const PAGE_JITTER_MS = 2_500;

/** The suffix the paginator appends for every page after the first, `.htm` or not. */
const PAGE_SUFFIX = /\/lista-\d+(\.htm)?$/;

/**
 * A search over an area drawn on the map, whose pages the paginator names without the `.htm` -
 * `/aree/vendita-case/lista-2?shape=...`. Asked with the suffix the other searches use, the portal
 * answers a page with no adverts on it, and the walk would end at the first page.
 *
 * `aree` is what the Italian site calls that section and `areas` what the other two do. Getting the
 * suffix wrong costs pages of a drawn search, not correctness.
 */
const DRAWN_PATH = /^\/(?:[a-z]{2}\/)?are(?:e|as)\//;

/** What a reader of the site the search came from would ask for, and a neutral spread otherwise. */
const DEFAULT_ACCEPT_LANGUAGE = 'es-ES,es;q=0.9,it;q=0.8,pt;q=0.8,en;q=0.7';

/** Used until the solver has minted a session, whose own user agent then replaces it. */
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

/**
 * The cookie and the user agent it was minted with, which are checked against each other.
 *
 * In the process rather than the database: a restart costs one call to the solver, and the value
 * rotates away on every request anyway.
 */
let session = null;

/** Requests are chained through this so no two of them race for the cookie's next value. */
let pending = Promise.resolve();

/**
 * Run a task after every task already queued, whether those failed or not.
 *
 * @template T
 * @param {() => Promise<T>} task
 * @returns {Promise<T>}
 */
function serialize(task) {
  const result = pending.then(task, task);
  pending = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/**
 * What the portal answers a client that has asked for too much, too fast. It is not a wall: no
 * session clears it and the solver has nothing to solve, so the run stops and leaves the rest of
 * the search to the next one.
 */
const TOO_MANY_REQUESTS = 429;

/**
 * @param {number} status
 * @param {string} body
 * @returns {boolean} whether DataDome answered instead of the portal
 */
function isWall(status, body) {
  return status === 403 || /captcha-delivery/i.test(body);
}

/**
 * Read the rotated cookie off a response and keep it.
 *
 * @param {Response} response
 * @returns {void}
 */
function absorbRotation(response) {
  // Only a verified session is worth following. A wall sets this cookie too, and that value is
  // the unsolved one.
  if (session == null) return;

  const rotated = response.headers
    ?.getSetCookie?.()
    ?.find((entry) => entry.startsWith(`${COOKIE_NAME}=`))
    ?.split(';')[0]
    ?.slice(COOKIE_NAME.length + 1);
  if (rotated) {
    session.cookie = rotated;
  }
}

/**
 * Ask the configured solver to clear the wall, and keep the session it earned.
 *
 * Its render is returned too, because it loaded the search anyway.
 *
 * @param {string} url the search url
 * @returns {Promise<string|null>} the rendered page, or null when the wall did not clear
 */
async function mintSession(url) {
  const answer = await solveChallenge(url, 'Idealista');
  if (answer == null) return null;

  const cookie = answer.cookies.find((entry) => entry?.name === COOKIE_NAME)?.value;
  if (cookie == null) {
    logger.error('Idealista: the solver returned a page but no datadome cookie, so nothing can be reused.');
    return null;
  }

  session = { cookie, userAgent: answer.userAgent ?? DEFAULT_USER_AGENT };
  return answer.html;
}

/**
 * Request a search page, carrying the session when there is one.
 *
 * It runs without a session too. That first request is expected to wall, but it keeps one path
 * through this provider instead of two.
 *
 * @param {string} url
 * @returns {Promise<{status: number, body: string}>}
 */
async function requestPage(url) {
  const headers = {
    'User-Agent': session?.userAgent ?? DEFAULT_USER_AGENT,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': portalOf(url)?.acceptLanguage ?? DEFAULT_ACCEPT_LANGUAGE,
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
  };
  if (session != null) {
    headers.Cookie = `${COOKIE_NAME}=${session.cookie}`;
  }

  const response = await fetch(url, { headers, redirect: 'follow' });
  absorbRotation(response);
  return { status: response.status, body: await response.text() };
}

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
    logger.error(
      'Idealista is behind DataDome. Give the run a browser, or set FREDY_CHALLENGE_SOLVER_URL to a ' +
        'challenge-solving scrape service (e.g. http://trawl:8191/scrape), or disable this provider.',
    );
    return [];
  }

  const html = await fetchSearchHtml(url, browser);
  return html == null ? [] : parseListings(html, url);
}

/**
 * Read one result page, clearing the wall in front of it when there is one.
 *
 * @param {string} url the url of the page
 * @param {any} [browser] the shared browser of the current job run, which reads the page when no
 *   solver is configured
 * @returns {Promise<any[]|null>} the adverts on it, empty when the wall stayed up, null when the
 *   portal asked for the requests to stop
 */
async function readPage(url, browser) {
  // Without a solver there is no session to carry and a plain request is answered with the wall
  // every time, so the browser is asked straight away rather than after a refusal.
  if (challengeSolverUrl() == null) return readPageInBrowser(url, browser);

  const { status, body } = await requestPage(url);
  if (status === TOO_MANY_REQUESTS) {
    logger.warn('Idealista answered 429: too many requests. The rest of this search waits for the next run.');
    return null;
  }
  if (!isWall(status, body)) return parseListings(body, url);

  logger.debug(`Idealista answered with a wall (${status}); asking the solver to clear it.`);
  session = null;

  const rendered = await mintSession(url);
  if (rendered == null) {
    logger.error('Idealista returned a wall that was not cleared, so this run found nothing.');
    return [];
  }
  return parseListings(rendered, url);
}

/**
 * Read every result page a search spreads over.
 *
 * @param {string} url the search url
 * @param {any} [browser] the shared browser of the current job run, used when no solver is
 *   configured
 * @returns {Promise<any[]>} the adverts of every result page the search has
 */
export async function readSearch(url, browser) {
  return serialize(async () => {
    const adverts = [];
    const seen = new Set();

    for (let page = 1; page <= MAX_PAGES; page++) {
      if (page > 1) await pause();
      const found = await readPage(pageUrl(url, page), browser);
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
  });
}
