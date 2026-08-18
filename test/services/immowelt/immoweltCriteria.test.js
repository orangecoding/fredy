/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { convertSearchUrlToRequest } from '../../../lib/services/immowelt/immowelt-search-model.js';
import { IMMOWELT_ORIGIN } from '../../../lib/services/immowelt/immoweltBff.js';
import { launchBrowser, closeBrowser } from '../../../lib/services/extractor/puppeteerExtractor.js';

/**
 * Every filter the translator maps, sent to immowelt's real search BFF.
 *
 * The unit tests next door prove a url turns into the criteria this translator intends. Whether
 * immowelt still calls that field by that name is the other half, and the half that broke. Two
 * failures have to be caught here, and only one of them is loud:
 *
 * - A wrong type, or an enum value that no longer exists, is answered with 400 and the offending
 *   path.
 * - A *renamed* field is silent. The BFF drops criteria keys it does not know without a word, so
 *   the only proof that a filter still arrives is that it still removes listings. Every probe
 *   therefore searches twice and compares the totals, rather than just checking for a 200. The
 *   `detects a field the BFF ignores` case below proves that comparison can actually fail.
 *
 * The values are immowelt's own vocabularies, read out of the BFF's validation errors, and each was
 * picked to cut deep enough that normal fluctuation cannot close the gap. `Maisonette`, which this
 * repo used as a sample value, is not among them - immowelt calls that one `Duplex`.
 *
 * Only `totalCount` is read, so one probe is one small POST. Resolving the ids into cards the way
 * `searchClassifieds` does would multiply that by the page size, and a run heavy enough to earn a
 * DataDome challenge tests nothing but the challenge.
 */

/** ~189 listings: houses and flats in Dresden from 200 m² up. */
const BUY_BASE = 'distributionTypes=Buy&locations=AD08DE9991&spaceMin=200';

/** ~37 listings. Small on purpose: two of the filters below only shave a quarter off. */
const RENT_BASE = 'distributionTypes=Rent&estateTypes=Apartment&locations=AD08DE9991&spaceMin=120';

/** ~49 listings. `priceType` decides which rent a bound applies to, so it needs one to show up in. */
const PRICE_BASE = 'distributionTypes=Rent&estateTypes=Apartment&locations=AD08DE9991&priceMax=400';

/** @type {{what: string, base: string, query?: string, withIt?: string, mode?: 'different'}[]} */
const PROBES = [
  { what: 'priceMin', base: BUY_BASE, query: 'priceMin=90000000' },
  { what: 'priceMax', base: BUY_BASE, query: 'priceMax=1000' },
  { what: 'spaceMax', base: BUY_BASE, query: 'spaceMax=201' },
  { what: 'numberOfRoomsMin', base: BUY_BASE, query: 'numberOfRoomsMin=20' },
  { what: 'numberOfRoomsMax', base: BUY_BASE, query: 'numberOfRoomsMax=2' },
  { what: 'yearOfConstructionMin', base: BUY_BASE, query: 'yearOfConstructionMin=2029' },
  { what: 'yearOfConstructionMax', base: BUY_BASE, query: 'yearOfConstructionMax=1500' },
  { what: 'plotSpaceMin', base: BUY_BASE, query: 'plotSpaceMin=90000' },
  { what: 'plotSpaceMax', base: BUY_BASE, query: 'plotSpaceMax=5' },
  { what: 'numberOfBedroomsMin', base: BUY_BASE, query: 'numberOfBedroomsMin=9' },
  { what: 'numberOfBedroomsMax', base: BUY_BASE, query: 'numberOfBedroomsMax=1' },
  { what: 'estateSubTypes', base: BUY_BASE, query: 'estateSubTypes=Castle' },
  { what: 'projectTypes', base: BUY_BASE, query: 'projectTypes=Projected' },
  { what: 'featuresIncluded', base: BUY_BASE, query: 'featuresIncluded=Swimming_Pool' },
  { what: 'furnished', base: BUY_BASE, query: 'furnished=Full' },
  { what: 'useFor', base: BUY_BASE, query: 'useFor=Industrial' },
  { what: 'buildState', base: BUY_BASE, query: 'buildState=Ripe_For_Demolition' },
  { what: 'energyTypes', base: BUY_BASE, query: 'energyTypes=THERMIC_PANELS' },
  { what: 'energyCertificateClass', base: BUY_BASE, query: 'energyCertificateClass=A_PLUS' },
  { what: 'locationsInBuildingIncluded', base: BUY_BASE, query: 'locationsInBuildingIncluded=Half_Basement' },
  { what: 'classifiedBusiness', base: BUY_BASE, query: 'classifiedBusiness=PRIVATE' },
  { what: 'isSaleGoodwill', base: BUY_BASE, query: 'isSaleGoodwill=true' },
  {
    what: 'locationsInBuildingExcluded',
    base: RENT_BASE,
    query: 'locationsInBuildingExcluded=Groundfloor,Half_Basement,Roof_Storey',
  },
  { what: 'certificateOfEligibilityNeeded', base: RENT_BASE, query: 'certificateOfEligibilityNeeded=Yes' },
  { what: 'availableFromMax', base: RENT_BASE, query: 'availableFromMax=2026-08-25' },
  // Loose mode widens the date filter rather than narrowing it, so what proves it arrives is that
  // it changes the strict result at all.
  {
    what: 'availableFromIsLooseMode',
    base: `${RENT_BASE}&availableFromMax=2026-08-25`,
    query: 'availableFromIsLooseMode=true',
    mode: 'different',
  },
  { what: 'priceType', base: PRICE_BASE, query: 'priceType=WARM_RENT' },
  // Both cover a few streets of Dresden and replace the place they were drawn over, so searching
  // them has to answer with a fraction of the city.
  {
    what: 'a search area drawn on the map',
    base: RENT_BASE,
    // Replaces the whole url rather than appending: a second `locations` would be the one dropped,
    // and the probe would end up comparing the baseline against itself.
    withIt:
      'distributionTypes=Rent&estateTypes=Apartment&spaceMin=120' +
      '&locations=eyJkcmF3aW5ncyI6WyJhaHt2SG1geHJBP2l2SWpgQz8_aHZJa2BDPyJdfQ',
  },
  {
    what: "a map url's bbox",
    base: RENT_BASE,
    query: 'bbox=MTMuNzIxNDU3MDAwMDAwMDAxLDUxLjA3NjI4LDEzLjc4NzM3Mjk5OTk5OTk5OSw1MS4xMDExMTk5OTk5OTk5OTU',
  },
];

const TEST_TIMEOUT = 180_000;

// Offline the transport is mocked away and answers from a fixture no matter which criteria it is
// handed, so running this there would assert nothing while looking green.
describe.skipIf(process.env.TEST_MODE === 'offline')('#immowelt criteria against the live BFF', () => {
  let browser;
  let page;

  /** Baselines are searched once and reused: the same url appears in a dozen probes. */
  const totals = new Map();

  beforeAll(async () => {
    browser = await launchBrowser(`${IMMOWELT_ORIGIN}/`);
    page = await browser.newPage();
    // The BFF only answers requests issued from a page that holds a DataDome cookie, which is what
    // the warm-up navigation earns. Same reason `immoweltBff` keeps a warm page per run.
    await page.goto(`${IMMOWELT_ORIGIN}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction(() => /(^|;\s*)datadome=/.test(document.cookie), { timeout: 20_000 }).catch(() => {});
  }, TEST_TIMEOUT);

  afterAll(async () => {
    await closeBrowser(browser);
  });

  /**
   * Ask the BFF how many listings one search url finds.
   *
   * @param {string} query the query string of a search url, without the leading `?`
   * @returns {Promise<number>} the answer's `totalCount`
   */
  async function total(query) {
    if (totals.has(query)) return totals.get(query);

    const request = convertSearchUrlToRequest(`${IMMOWELT_ORIGIN}/classified-search?${query}`, { size: 1 });
    const result = await searchTotal(request);

    // A DataDome challenge answers 403 with its own html and says nothing about whether the
    // criteria were right. Worth telling apart, because the fix is "run this from somewhere that
    // is not currently flagged", not "the translator is broken".
    expect(
      isBotChallenge(result),
      'immowelt answered with a bot challenge, so nothing here could be checked. This is a blocked ' +
        'session, not a broken filter - try again later or from another address.',
    ).toBe(false);
    expect(result.status, `the BFF refused '${query}': ${result.body}`).toBe(200);
    totals.set(query, result.total);
    return result.total;
  }

  /**
   * @param {{status: number, body: string}} result one BFF answer
   * @returns {boolean} whether it is DataDome's challenge rather than the BFF's own answer
   */
  function isBotChallenge(result) {
    return result.status === 403 && /Please enable JS|datadome|<html/i.test(result.body);
  }

  /**
   * @param {object} request the body for `/serp-bff/search`
   * @returns {Promise<{status: number, total: number|null, body: string}>}
   */
  async function searchTotal(request) {
    return page.evaluate(async (payload) => {
      const response = await fetch('/serp-bff/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(payload),
      });
      const body = await response.text();
      let total = null;
      try {
        total = JSON.parse(body).totalCount ?? null;
      } catch {
        /* a refusal is not json */
      }
      return { status: response.status, total, body: body.slice(0, 300) };
    }, request);
  }

  for (const { what, base, query, withIt: replacement, mode } of PROBES) {
    it(
      `still narrows the search by ${what}`,
      async () => {
        const withoutIt = await total(base);
        const withIt = await total(replacement ?? `${base}&${query}`);

        expect(withoutIt, 'the baseline search found nothing, so nothing below can be told apart').toBeGreaterThan(0);
        const because = `${what} changed nothing, so the BFF is ignoring the field this url maps to`;
        if (mode === 'different') {
          expect(withIt, because).not.toBe(withoutIt);
        } else {
          expect(withIt, because).toBeLessThan(withoutIt);
        }
      },
      TEST_TIMEOUT,
    );
  }

  // Without this, every case above could be passing for the wrong reason: an ignored key answers
  // 200 like a working one, and only the totals tell them apart.
  it(
    'detects a field the BFF ignores, which is what every case above relies on',
    async () => {
      const request = convertSearchUrlToRequest(`${IMMOWELT_ORIGIN}/classified-search?${BUY_BASE}`, { size: 1 });
      const ignored = await searchTotal({ ...request, criteria: { ...request.criteria, spaceMinimum: 100000 } });

      expect(ignored.status).toBe(200);
      expect(ignored.total, 'the BFF started rejecting unknown criteria - the silent case is gone').toBe(
        await total(BUY_BASE),
      );
    },
    TEST_TIMEOUT,
  );
});
