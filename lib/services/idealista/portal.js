/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Which of idealista's three national sites a search url belongs to, and everything that differs
 * between them.
 *
 * idealista.com, idealista.it and idealista.pt are one application served in three languages, and
 * the app talks to one api per country: same client key, same signing, same endpoints, with the
 * country code sitting in the path and in `locale`. Probed against all three, `app.idealista.com`,
 * `app.idealista.it` and `app.idealista.pt` answer the same shapes to the same requests, and
 * `deeplinks/parse/search` reads a website url of its own country server-side - Madrid comes back
 * as `0-EU-ES-28-07-001-079`, Lisboa as `0-EU-PT-11-06`.
 *
 * Nothing here is held at module scope beyond the table itself: a portal is derived from the job's
 * url on every call, so two jobs on two countries can run at the same time.
 */

import logger from '../logger.js';

/**
 * @typedef {Object} Portal
 * @property {string} country The country code the api paths and `locale` carry: `es`, `it`, `pt`.
 * @property {string} host The website's bare hostname, `idealista.com` and friends.
 * @property {string} apiHost The origin of the app's api, which is where every request goes.
 * @property {string} site The origin of the website, which is what a relative advert link resolves
 *   against.
 * @property {string} tiles The origin of the map's tile host, which serves the outline of an area.
 * @property {string} acceptLanguage What a browser of that country asks the website for.
 * @property {string} sortByDate The publication ordering the site names in its own url. Recorded
 *   rather than used - see the note below.
 * @property {string} provinceAnchor A location the catalogue is opened at to get the list of
 *   provinces, which the endpoint only serves alongside the children of some real location.
 * @property {string[]} provinceSuffixes What the url hangs on a place name to mean the whole
 *   province rather than the municipality inside it.
 */

/**
 * The three sites.
 *
 * `sortByDate` is what each site calls its "newest first" ordering, and Fredy asks for none of
 * them: `www.idealista.it/robots.txt` disallows `/*?ordine=pubblicazione-desc` and
 * `www.idealista.com/robots.txt` disallows `/*?ordenado-por=fecha-publicacion-` (both read in
 * September 2026; the Portuguese robots.txt sits behind DataDome and could not be read at all).
 * The api sorts by publication date without a robots rule against it, and the website fallback
 * reads the whole result set instead of the first page of a ranking - which finds more than an
 * ordering would, not less. The names are kept because they are the answer to "why is there no
 * sort parameter", and a future reader should not have to measure them again.
 *
 * @type {Object.<string, Portal>}
 */
export const PORTALS = {
  'idealista.com': {
    country: 'es',
    host: 'idealista.com',
    apiHost: 'https://app.idealista.com',
    site: 'https://www.idealista.com',
    tiles: 'https://mt1.idealista.com',
    acceptLanguage: 'es-ES,es;q=0.9,en;q=0.8',
    sortByDate: 'ordenado-por=fecha-publicacion-desc',
    provinceAnchor: '0-EU-ES-28',
    provinceSuffixes: ['-provincia'],
  },
  'idealista.it': {
    country: 'it',
    host: 'idealista.it',
    apiHost: 'https://app.idealista.it',
    site: 'https://www.idealista.it',
    tiles: 'https://mt1.idealista.it',
    acceptLanguage: 'it-IT,it;q=0.9,en;q=0.8',
    sortByDate: 'ordine=pubblicazione-desc',
    provinceAnchor: '0-EU-IT-MI',
    provinceSuffixes: ['-provincia'],
  },
  'idealista.pt': {
    country: 'pt',
    host: 'idealista.pt',
    apiHost: 'https://app.idealista.pt',
    site: 'https://www.idealista.pt',
    tiles: 'https://mt1.idealista.pt',
    acceptLanguage: 'pt-PT,pt;q=0.9,en;q=0.8',
    sortByDate: 'ordem=atualizado-desc',
    provinceAnchor: '0-EU-PT-11',
    provinceSuffixes: ['-distrito'],
  },
};

/**
 * The portal a search url belongs to.
 *
 * An unknown host is refused rather than guessed at. Upstream read one as Spain, which is the
 * friendlier answer to a typo and the wrong one to everything else: a url that is not idealista's
 * would be searched on the Spanish api, and every advert it found would be stored under links to a
 * site the user never asked about. Refusing costs a job that was never going to work its listings,
 * and says so in the log.
 *
 * @param {string|null|undefined} url A search url, or an advert link - any url on one of the three
 *   sites.
 * @returns {Portal|null} null when the url names no idealista site.
 */
export function portalOf(url) {
  let host;
  try {
    host = new URL(String(url)).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
  return PORTALS[host] ?? null;
}

/**
 * The portal a search url belongs to, complaining when there is none.
 *
 * @param {string|null|undefined} url
 * @param {string} what What is being read, so the log line says which run gave up.
 * @returns {Portal|null}
 */
export function requirePortal(url, what) {
  const portal = portalOf(url);
  if (portal == null) {
    logger.error(
      `Idealista serves ${Object.keys(PORTALS).join(', ')} and nothing else, so ${what} cannot read "${url}".`,
    );
  }
  return portal;
}
