/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Reading the state the platform's micro-frontend shell embeds in its pages.
 *
 * immowelt's and SeLoger's pages hand their data to the browser in script tags of the form
 * `<script id="__UFRN_…__">window["__UFRN_…__"]=JSON.parse("…")</script>`: the exposé its
 * classified behind `__UFRN_LIFECYCLE_SERVERREQUEST__`, the result page its listings behind
 * `__UFRN_FETCHER__`. Both are read the same way, so the reading lives here once. It is a module of
 * its own because both sides need it: `classified.js` reads the exposé, and the transport in
 * `immoweltBff.js` waits for the result page's tag - and `classified.js` already imports the
 * transport.
 */

import LZString from 'lz-string';

/**
 * The script tag the result page hands its listings to the page in.
 *
 * It is also the tag's `id`, which is what the transport waits for: the tag only exists once the
 * page is the real result page and not DataDome's device check in front of it.
 */
export const SEARCH_RESULTS_MARKER = '__UFRN_FETCHER__';

/** The entry of the result page's state holding the search, lz-string compressed. */
const SEARCH_RESULTS_KEY = 'classified-serp-init-data';

/**
 * Read the JSON one of the shell's script tags carries.
 *
 * The state is a JSON document inside a JavaScript string literal (`JSON.parse("{\"app_cldp\"...")`),
 * so it is read by scanning that literal to its closing quote rather than by a regex: a description
 * containing `");` - a bracketed aside at the end of a sentence is enough - ends a lazy match early
 * and loses the whole payload.
 *
 * @param {string} html the page source
 * @param {string} marker the script tag's name, e.g. `__UFRN_LIFECYCLE_SERVERREQUEST__`
 * @returns {any|null} the parsed state, or null when the page carries none behind that marker
 */
export function readEmbeddedState(html, marker) {
  const position = html.indexOf(marker);
  if (position < 0) return null;

  const call = html.indexOf('JSON.parse("', position);
  if (call < 0) return null;

  const start = call + 'JSON.parse("'.length;
  let end = start;
  while (end < html.length && html[end] !== '"') {
    end += html[end] === '\\' ? 2 : 1;
  }
  if (end >= html.length) return null;

  try {
    return JSON.parse(JSON.parse(`"${html.slice(start, end)}"`));
  } catch {
    return null;
  }
}

/**
 * The classifieds of one result page, read off the page itself.
 *
 * Measured on immowelt.de in November 2026: `classified-serp-init-data` is an lz-string
 * `compressToBase64` string, and decompressed it is `{pageProps: {classifieds: [id, …],
 * classifiedsData: {[id]: card}, apiError, totalCount, …}}`. Each card is the `/classifiedList`
 * payload with a few more fields, so `normalizeClassified` reads it unchanged. `classifieds` is the
 * page's own order, which for a search sorted by date is newest first.
 *
 * A page whose search failed on the platform's side says so with `apiError` and carries no
 * listings; it is answered with null rather than with an empty list, so the caller can tell it
 * from a search that found nothing.
 *
 * @param {string|null|undefined} html the result page source
 * @returns {any[]|null} the raw classifieds in page order, or null when the page carries none Fredy
 *   can read
 */
export function readSearchResults(html) {
  if (!html) return null;
  const packed = readEmbeddedState(html, SEARCH_RESULTS_MARKER)?.data?.[SEARCH_RESULTS_KEY];
  if (typeof packed !== 'string') return null;

  let props;
  try {
    props = JSON.parse(LZString.decompressFromBase64(packed) || 'null')?.pageProps;
  } catch {
    return null;
  }
  if (props == null || props.apiError || !Array.isArray(props.classifieds)) return null;

  return props.classifieds.map((id) => props.classifiedsData?.[id]).filter(Boolean);
}
