/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * `pageUrl` for the portals that name the result page in a query parameter, which is most of them.
 *
 * Page 1 drops the parameter rather than setting it to 1, for two reasons: it is the URL the portal
 * itself links page 1 under, and a URL without the parameter stays exactly as the user pasted it, so
 * the first page of a run requests what it requested before paging existed. A page number the user
 * copied along (they were looking at page 4 when they copied the link) is dropped the same way.
 *
 * @param {string} param The query parameter holding the 1-based page number.
 * @param {{onFirstPage?: boolean}} [options] `onFirstPage` keeps the parameter on page 1 as `1`, for
 *   a portal that needs it there.
 * @returns {(url: string, page: number) => string}
 */
export function queryPageUrl(param, { onFirstPage = false } = {}) {
  return (url, page) => {
    const next = new URL(url);
    if (page > 1 || onFirstPage) {
      next.searchParams.set(param, String(page));
    } else if (next.searchParams.has(param)) {
      next.searchParams.delete(param);
    } else {
      // Untouched, so the first page is requested byte for byte as before: rewriting the query
      // re-encodes it, and some portals read their own spelling only.
      return url;
    }
    return next.toString();
  };
}
