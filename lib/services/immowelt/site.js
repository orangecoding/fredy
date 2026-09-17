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
 * Nothing here is held at module scope beyond the table: a site is derived from the job's url on
 * every call, so a German and an Austrian job can run at the same time.
 */

/**
 * @typedef {Object} ImmoweltSite
 * @property {string} country The country the site serves, as ISO 3166-1 alpha-2, lowercase.
 * @property {string} host The website's bare hostname, without `www.`.
 * @property {string} origin Where every request goes, and the warm-up target.
 * @property {string} language What `/classifiedList` is asked for its card payload in.
 */

/**
 * The two sites.
 *
 * `language` is the `x-language` header `/classifiedList` takes. Both sites are German-speaking, so
 * both say `de` today; it is a field rather than a literal so that the header is looked up like
 * everything else here the day a third site is added.
 *
 * @type {Object.<string, ImmoweltSite>}
 */
export const SITES = {
  'immowelt.de': {
    country: 'de',
    host: 'immowelt.de',
    origin: 'https://www.immowelt.de',
    language: 'de',
  },
  'immowelt.at': {
    country: 'at',
    host: 'immowelt.at',
    origin: 'https://www.immowelt.at',
    language: 'de',
  },
};

/** The hosts a job url may name, for the job form's own check. */
export const IMMOWELT_HOSTS = Object.keys(SITES);

/**
 * The site a url belongs to.
 *
 * An unknown host answers null rather than falling back to Germany. Guessing would be the quiet
 * kind of wrong this codebase keeps refusing elsewhere: a job whose url is not immowelt's would be
 * searched on the German BFF, and every listing it found would be stored under a link to a site the
 * user never asked about.
 *
 * @param {string|null|undefined} url A search url, or a listing link - any url on one of the sites.
 * @returns {ImmoweltSite|null} null when the url names no immowelt site.
 */
export function siteOf(url) {
  let host;
  try {
    host = new URL(String(url)).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
  return SITES[host] ?? null;
}

/**
 * The site a url belongs to, stopping the run when there is none.
 *
 * Searching anyway is what this exists to prevent - see {@link siteOf} - and unlike a missing
 * exposé there is no degraded answer to fall back to, so the job ends with a message naming the
 * url rather than reporting another country's flats.
 *
 * @param {string|null|undefined} url
 * @returns {ImmoweltSite}
 * @throws {Error} when the url names no immowelt site.
 */
export function requireSite(url) {
  const site = siteOf(url);
  if (site == null) {
    throw new Error(
      `Immowelt serves ${IMMOWELT_HOSTS.join(' and ')} and nothing else, so Fredy cannot search '${url}'. ` +
        `Copy the address of a result page from one of those sites.`,
    );
  }
  return site;
}
