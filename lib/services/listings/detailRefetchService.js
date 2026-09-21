/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { getProviders } from '../../utils.js';
import { launchBrowser, closeBrowser } from '../extractor/puppeteerExtractor.js';
import { getSettings } from '../storage/settingsStorage.js';
import logger from '../logger.js';

/**
 * Fetching one listing's detail page on demand, outside any job run.
 *
 * The pipeline already does this in bulk, but only for the providers a user ticked under
 * `provider_details`, and only for listings it has just found. This path is the deliberate
 * exception: somebody looking at one listing asks for its exposé text, and that request is honoured
 * whatever the bulk setting says. One person pressing one button is not the traffic that setting
 * exists to hold back.
 */

/**
 * What the caller can be told about an attempt, in the order of how much it knows.
 *
 * `unchanged` is deliberately vague, and that is the honest shape of the answer rather than a gap
 * in this module: every provider except immoscout wraps its own body in try/catch, and the layer
 * below them all - `puppeteerExtractor` - returns a bare `null` for a timeout, a navigation error
 * and a bot wall alike. A provider that was blocked and a provider that read the page and found no
 * description both hand back the listing untouched. Reporting that as "nothing more to fetch"
 * would be a claim this code cannot support, so the word the UI puts on it has to stay equally
 * careful. Telling the two apart means giving the providers a way to say which happened, which is
 * a change to all twelve of them and not to this file.
 *
 * @typedef {('updated'|'unchanged'|'unsupported'|'failed')} RefetchStatus
 */

/**
 * The fields a detail page can improve, as they are named on a provider's listing object.
 *
 * Deliberately not every field a provider might return. A detail page is authoritative about the
 * advertisement's own text and the facts printed beside it; it is not a reason to rewrite the price
 * or the title a search result already carried.
 *
 * @type {Array<{parsed: string, column: string}>}
 */
const DETAIL_FIELDS = [
  { parsed: 'description', column: 'description' },
  { parsed: 'address', column: 'address' },
  { parsed: 'buildYear', column: 'build_year' },
  { parsed: 'energyClass', column: 'energy_class' },
  { parsed: 'publishedAt', column: 'published_at' },
];

/**
 * Listings with a fetch in flight, so a second press cannot start a second browser.
 *
 * The same shape as the job registry in `services/jobs/run-state.js`, kept separate because it
 * guards a different thing and the two must not be able to block each other. In-memory and
 * per-process, which is all this needs to be: the cost it is protecting against is a Chromium
 * start, and a restart that forgets an in-flight fetch has already killed the browser it belonged
 * to.
 *
 * @type {Set<string>}
 */
const inFlight = new Set();

/**
 * Whether a manual detail fetch is already running for this listing.
 *
 * @param {string} listingId
 * @returns {boolean}
 */
export function isRefetching(listingId) {
  return inFlight.has(listingId);
}

/**
 * Turn a stored row into the shape a provider's `fetchDetails` expects.
 *
 * Providers are written against `ParsedListing`, which is what came off a search page: camelCase,
 * `image` rather than `image_url`, and `id` carrying the provider's own hash rather than Fredy's
 * primary key. Several of them read those fields back as fallbacks - immobilienDe keeps
 * `listing.buildYear` when the exposé states none - so handing over the raw row would quietly turn
 * every such fallback into a null.
 *
 * @param {Object} row - A listing as `getListingById` returns it.
 * @returns {Object}
 */
export function rowToParsedListing(row) {
  return {
    id: row.hash ?? row.id,
    price: row.price,
    size: row.size,
    rooms: row.rooms,
    title: row.title,
    link: row.link,
    address: row.address,
    description: row.description,
    image: row.image_url,
    buildYear: row.build_year ?? null,
    energyClass: row.energy_class ?? null,
    publishedAt: row.published_at ?? null,
    latitude: row.latitude,
    longitude: row.longitude,
  };
}

/**
 * The same cleanup the bulk path applies before an address reaches the database.
 *
 * `storeListings` strips parenthesised segments from every address it writes, so a refetch that
 * stored the provider's raw string would leave the one address in the table that is formatted
 * differently from all the others.
 *
 * @param {string|null|undefined} value
 * @returns {string|null}
 */
function cleanAddress(value) {
  if (typeof value !== 'string') return null;
  const stripped = value.replace(/\s*\([^)]*\)/g, '').trim();
  return stripped.length > 0 ? stripped : null;
}

/**
 * Whether a detail page's answer for a field is worth storing over what the row has.
 *
 * Only an actual value wins. A provider that could not read a field returns null or the value it
 * was handed, and neither is a reason to write anything - least of all to null a column that a
 * search page had already filled in.
 *
 * @param {*} next
 * @param {*} current
 * @returns {boolean}
 */
function isImprovement(next, current) {
  if (next == null) return false;
  if (typeof next === 'string' && next.trim().length === 0) return false;
  return String(next) !== String(current ?? '');
}

/**
 * Fetch one listing's detail page and work out what it actually gave us.
 *
 * Three things here are not obvious and all three are load-bearing:
 *
 * The browser is launched here rather than left to `puppeteerExtractor`'s own fallback. The
 * fallback works for most providers, but immowelt keys a `WeakMap` on the browser it is handed and
 * throws on null straight into its own catch - which would surface as "nothing more to fetch" for
 * a fetch that never happened. Launching here also keeps the user's proxy, which the extractor's
 * self-launch path never sees, and a manual fetch from an unproxied address is exactly the request
 * a portal blocks.
 *
 * It is launched lazily, because immoscout and idealista read their detail data from an API and
 * immoscout is by far the most common provider: the usual press of this button should not pay for
 * a Chromium start nobody needs.
 *
 * And the before/after comparison is done on values, snapshotted before the call. immoscout mutates
 * the listing in place and hands back the same object, so comparing references - or comparing
 * against the object that was passed in - reports "unchanged" for every successful immoscout fetch.
 *
 * @param {Object} row - A listing as `getListingById` returns it.
 * @returns {Promise<{status: RefetchStatus, fields: Object}>} `fields` is keyed by column name and
 *   holds only what actually improved; it is empty for every status but `updated`.
 */
export async function refetchListingDetails(row) {
  const providers = await getProviders();
  const provider = providers.find((module) => module.metaInformation?.id === row.provider);

  // The static config, not `createConfig`: that one exists to bind a job's url, enabled flag and
  // blacklist, and for idealista and immowelt it validates the url it is given - which a detail
  // page url would fail. `fetchDetails` lives on the static template for every provider that has
  // one, and the template is shared, so nothing here may write to it.
  const fetchDetails = provider?.config?.fetchDetails;
  if (typeof fetchDetails !== 'function') {
    return { status: 'unsupported', fields: {} };
  }

  // Snapshotted before the call, because one provider edits the object it was given.
  const before = Object.fromEntries(DETAIL_FIELDS.map(({ column }) => [column, row[column] ?? null]));

  const settings = await getSettings();
  /** @type {Promise<any>|null} */
  let browserPromise = null;
  // The promise is memoized rather than the browser, the same way price tracking does it: caching
  // the resolved value leaves a window in which a second caller sees "no browser yet".
  const ensureBrowser = () => {
    if (browserPromise == null) {
      browserPromise = launchBrowser(row.link, { proxyUrl: settings.proxyUrl });
    }
    return browserPromise;
  };

  try {
    const enriched = await fetchDetails(rowToParsedListing(row), await ensureBrowser());

    const fields = {};
    for (const { parsed, column } of DETAIL_FIELDS) {
      const next = column === 'address' ? cleanAddress(enriched?.[parsed]) : (enriched?.[parsed] ?? null);
      if (isImprovement(next, before[column])) {
        fields[column] = next;
      }
    }

    // An address the user placed by hand is theirs. The portal's own string is what they were
    // correcting, so writing it back would undo the correction on the next button press.
    if (row.address_is_manual) {
      delete fields.address;
    }

    return { status: Object.keys(fields).length > 0 ? 'updated' : 'unchanged', fields };
  } catch (error) {
    // Only immoscout reaches this today - everyone else catches inside and returns the listing - so
    // this branch is rarer than it looks, and its absence is not evidence that a fetch succeeded.
    logger.warn(`Manual detail fetch failed for listing '${row.id}' (${row.provider}).`, error?.message || error);
    return { status: 'failed', fields: {} };
  } finally {
    if (browserPromise != null) {
      // Awaited rather than dropped: a launch still in flight would otherwise resolve into a
      // browser nobody holds a reference to any more.
      await browserPromise.then(closeBrowser).catch(() => {});
    }
  }
}

/**
 * Run a refetch, refusing to start a second one for the same listing.
 *
 * The guard is here rather than in the route because the cost it protects - a Chromium start and a
 * request to a portal that is watching for exactly this - belongs to the fetch, not to HTTP.
 *
 * @param {Object} row
 * @returns {Promise<{status: RefetchStatus|'busy', fields: Object}>}
 */
export async function refetchListingDetailsOnce(row) {
  if (inFlight.has(row.id)) {
    return { status: 'busy', fields: {} };
  }
  inFlight.add(row.id);
  try {
    return await refetchListingDetails(row);
  } finally {
    inFlight.delete(row.id);
  }
}

/**
 * Which providers can be asked for a detail page at all.
 *
 * Exported for the test that keeps this list honest: a provider losing its `fetchDetails` should
 * fail a test rather than turn a button into a permanent "not supported".
 *
 * @returns {Promise<string[]>} Provider ids, sorted.
 */
export async function providersWithDetails() {
  const providers = await getProviders();
  return providers
    .filter((module) => typeof module?.config?.fetchDetails === 'function')
    .map((module) => module.metaInformation.id)
    .sort();
}
