/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Which of immowelt's national sites a url belongs to, and everything that differs between them.
 *
 * immowelt.de and immowelt.at are one application served under two domains: the same micro-frontend
 * shell, the same `/serp-bff/search` behind the same DataDome wall, the same `/search-mfe-bff`
 * routing service, and the same place ids - `AD08DE8634` for a German place, `AD08AT2093` for
 * Vienna, with the country code sitting inside the id rather than in the request. Measured against
 * both in September 2026: an Austrian search posted to `/serp-bff/search` without a location is
 * refused with the identical typia message the German one answers, naming the same schema.
 *
 * That is why there is one provider rather than two. What the sites do *not* share is the origin:
 * every BFF call is a same-origin `fetch` issued by the warmed page (the only place a DataDome
 * cookie is worth anything), so a job on immowelt.at run against a page on immowelt.de would search
 * Germany, and its exposés would be cross-origin requests the browser refuses outright.
 *
 * seloger.com is the same application a third time. SeLoger belongs to the same group as immowelt
 * (AVIV), and measured in September 2026 its `/serp-bff/search`, `/classifiedList` and exposé shell
 * answer exactly what immowelt's do - French place ids (`AD08FR31096` is Paris), French copy, the
 * same payload paths. It is a provider of its own all the same, because it is a portal of its own
 * to the people searching it: nobody looks for a flat in Lyon under "Immowelt". So every site names
 * the provider it belongs to, and each provider accepts only its own.
 *
 * Nothing here is held at module scope beyond the table: a site is derived from the job's url on
 * every call, so a German and an Austrian job can run at the same time.
 */

/**
 * @typedef {Object} ImmoweltSite
 * @property {string} provider The Fredy provider the site belongs to, `immowelt` or `seloger`.
 * @property {string} brand The portal's name, as messages about it spell it.
 * @property {string} country The country the site serves, as ISO 3166-1 alpha-2, lowercase.
 * @property {string} host The website's bare hostname, without `www.`.
 * @property {string} origin Where every request goes, and the warm-up target.
 * @property {string} language What `/classifiedList` is asked for its card payload in.
 */

/**
 * The three sites.
 *
 * `language` is the `x-language` header `/classifiedList` takes, and the language the cards come
 * back in: German for both immowelt sites, French for SeLoger.
 *
 * @type {Object.<string, ImmoweltSite>}
 */
export const SITES = {
  'immowelt.de': {
    provider: 'immowelt',
    brand: 'Immowelt',
    country: 'de',
    host: 'immowelt.de',
    origin: 'https://www.immowelt.de',
    language: 'de',
  },
  'immowelt.at': {
    provider: 'immowelt',
    brand: 'Immowelt',
    country: 'at',
    host: 'immowelt.at',
    origin: 'https://www.immowelt.at',
    language: 'de',
  },
  'seloger.com': {
    provider: 'seloger',
    brand: 'SeLoger',
    country: 'fr',
    host: 'seloger.com',
    origin: 'https://www.seloger.com',
    language: 'fr',
  },
};

/**
 * Sites whose adverts turn up among a provider's results without the site being searched itself.
 *
 * SeLoger lists the adverts of Belles Demeures, its luxury sister portal, among its own, and their
 * cards link to the sister's site. That site sits behind the same DataDome wall and answers the same
 * way - a taken-down advert is a 410 - so whether one of its adverts is still online is asked from a
 * page on its own origin like any other. It is never searched and its exposé is not read, which is
 * why it is kept apart from {@link SITES}: {@link siteOf} and {@link requireSite} do not know it.
 *
 * @type {Object.<string, ImmoweltSite>}
 */
const LINKED_SITES = {
  'bellesdemeures.com': {
    provider: 'seloger',
    brand: 'Belles Demeures',
    country: 'fr',
    host: 'bellesdemeures.com',
    origin: 'https://www.bellesdemeures.com',
    language: 'fr',
  },
};

/**
 * The hosts one provider serves.
 *
 * @param {string} provider `immowelt` or `seloger`
 * @returns {string[]}
 */
function hostsOf(provider) {
  return Object.keys(SITES).filter((host) => SITES[host].provider === provider);
}

/**
 * The hosts an immowelt job url may name, for the job form's own check. SeLoger declares none: it
 * serves one host, and that is its `baseUrl`'s.
 */
export const IMMOWELT_HOSTS = hostsOf('immowelt');

/**
 * The site a url belongs to.
 *
 * An unknown host answers null rather than falling back to Germany. Guessing would be the quiet
 * kind of wrong this codebase keeps refusing elsewhere: a job whose url is not immowelt's would be
 * searched on the German BFF, and every listing it found would be stored under a link to a site the
 * user never asked about.
 *
 * This knows all three sites, whichever provider asks: what a listing link or an exposé fetch needs
 * is the origin to send the request to, and that is a property of the link, not of the provider.
 * Which provider may *search* a site is {@link requireSite}'s question.
 *
 * @param {string|null|undefined} url A search url, or a listing link - any url on one of the sites.
 * @returns {ImmoweltSite|null} null when the url names no site on the platform.
 */
export function siteOf(url) {
  const host = hostOf(url);
  return host == null ? null : (SITES[host] ?? null);
}

/**
 * The site a listing link is on, counting the sites that are only linked to - see
 * {@link LINKED_SITES}. For asking about an advert, never for searching.
 *
 * @param {string|null|undefined} url a listing link
 * @returns {ImmoweltSite|null} null when the link is on no site of the platform
 */
export function linkedSiteOf(url) {
  const host = hostOf(url);
  return host == null ? null : (SITES[host] ?? LINKED_SITES[host] ?? null);
}

/**
 * @param {string|null|undefined} url
 * @returns {string|null} the bare hostname, without `www.`, or null for no url
 */
function hostOf(url) {
  try {
    return new URL(String(url)).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * The site a job url searches, stopping the run when it is not one of the provider's own.
 *
 * Searching anyway is what this exists to prevent - see {@link siteOf} - and unlike a missing
 * exposé there is no degraded answer to fall back to, so the job ends with a message naming the
 * url rather than reporting another country's flats. A SeLoger url on an immowelt job is refused
 * the same way as a stranger's: the listings it found would be stored under the wrong provider.
 *
 * @param {string|null|undefined} url
 * @param {string} provider which provider's sites the url has to be on, `immowelt` or `seloger`
 * @returns {ImmoweltSite}
 * @throws {Error} when the url names none of that provider's sites.
 */
export function requireSite(url, provider) {
  const site = siteOf(url);
  if (site == null || site.provider !== provider) {
    const hosts = hostsOf(provider);
    const brand = SITES[hosts[0]]?.brand ?? provider;
    throw new Error(
      `${brand} serves ${hosts.join(' and ')} and nothing else, so Fredy cannot search '${url}'. ` +
        `Copy the address of a result page from ${hosts.length > 1 ? 'one of those sites' : 'that site'}.`,
    );
  }
  return site;
}
