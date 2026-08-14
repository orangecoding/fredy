/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Addresses that used to be pages of their own.
 *
 * Fredy has moved things around more than once: settings and users lived at the top level before
 * they were grouped, the travel-time page was called "addresses", and the listings watchlist was
 * its own page before it became a filter. Those URLs are in people's bookmarks and in the links of
 * notification mails that have already gone out, so they keep working.
 *
 * A table rather than a wall of `<Navigate>` elements, so that "does every old address still land
 * somewhere real" is a question a test can answer.
 *
 * The one case missing here is `/users/edit/:userId`, which carries a parameter and therefore needs
 * a component to read it; `App.jsx` keeps a small redirect for that.
 *
 * @type {Record<string, string>}
 */
export const LEGACY_REDIRECTS = {
  // Personal settings, from before they were grouped under one heading.
  '/generalSettings': '/settings/preferences',
  '/userSettings': '/settings/preferences',
  // Was "addresses" until the page grew from a list of places into how travel time to them is
  // measured.
  '/settings/addresses': '/settings/travel-time',

  // The watchlist is a filter on the listings overview, not a place.
  '/listings/watchlist': '/listings?watch=true',
  '/watchlistManagement': '/listings?watch=true',

  // User management, from before it moved under Administration.
  '/users': '/admin/users',
  '/users/new': '/admin/users/new',
};

/**
 * Where an old address points now.
 *
 * @param {string} pathname
 * @returns {string|null} The new location, or null when the path was never moved.
 */
export function resolveLegacyPath(pathname) {
  return LEGACY_REDIRECTS[pathname] ?? null;
}

/**
 * The path part of a redirect target, without its query.
 *
 * @param {string} target
 * @returns {string}
 */
export function targetPathname(target) {
  return target.split('?')[0];
}
