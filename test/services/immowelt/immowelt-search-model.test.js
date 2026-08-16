/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it, vi } from 'vitest';
import {
  convertSearchUrlToRequest,
  DEFAULT_ORDER,
  DEFAULT_PAGE_SIZE,
} from '../../../lib/services/immowelt/immowelt-search-model.js';
import logger from '../../../lib/services/logger.js';

const BASE = 'https://www.immowelt.de/classified-search';

describe('#immowelt search model', () => {
  it('translates the minimal search a job url carries', () => {
    const { criteria, paging } = convertSearchUrlToRequest(
      `${BASE}?distributionTypes=Rent&estateTypes=Apartment&locations=AD08DE8634&order=DateDesc`,
    );

    expect(criteria).toEqual({
      distributionTypes: ['Rent'],
      estateTypes: ['Apartment'],
      location: { placeIds: ['AD08DE8634'] },
    });
    expect(paging).toEqual({ page: 1, size: DEFAULT_PAGE_SIZE, order: 'DateDesc' });
  });

  it('splits every comma separated list, including multi valued distribution types', () => {
    const { criteria } = convertSearchUrlToRequest(
      `${BASE}?distributionTypes=Buy,Buy_Auction,Compulsory_Auction&estateTypes=House,Apartment` +
        `&estateSubTypes=Penthouse,Maisonette&projectTypes=Stock,New_Build&featuresIncluded=Balcony_Terrace,Elevator` +
        `&locations=AD08DE2350,AD08DE8634`,
    );

    expect(criteria.distributionTypes).toEqual(['Buy', 'Buy_Auction', 'Compulsory_Auction']);
    expect(criteria.estateTypes).toEqual(['House', 'Apartment']);
    expect(criteria.estateSubTypes).toEqual(['Penthouse', 'Maisonette']);
    expect(criteria.projectTypes).toEqual(['Stock', 'New_Build']);
    expect(criteria.featuresIncluded).toEqual(['Balcony_Terrace', 'Elevator']);
    expect(criteria.location.placeIds).toEqual(['AD08DE2350', 'AD08DE8634']);
  });

  it('carries the range filters over as numbers', () => {
    const { criteria } = convertSearchUrlToRequest(
      `${BASE}?distributionTypes=Rent&locations=AD08DE8634` +
        `&priceMin=500&priceMax=2000&numberOfRoomsMin=2&numberOfRoomsMax=5&spaceMin=40&spaceMax=120`,
    );

    expect(criteria).toMatchObject({
      priceMin: 500,
      priceMax: 2000,
      numberOfRoomsMin: 2,
      numberOfRoomsMax: 5,
      spaceMin: 40,
      spaceMax: 120,
    });
  });

  // NaN serialises to null, which the BFF reads as "no limit" - the user would silently get
  // listings far outside the budget they typed.
  it('drops a range filter that is not a number instead of sending NaN', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const { criteria } = convertSearchUrlToRequest(`${BASE}?distributionTypes=Rent&locations=AD08DE8634&priceMax=abc`);

    expect(criteria).not.toHaveProperty('priceMax');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('priceMax'));
    warn.mockRestore();
  });

  it('normalises the single-value enums to the PascalCase the BFF insists on', () => {
    const { criteria } = convertSearchUrlToRequest(
      `${BASE}?distributionTypes=Rent&locations=AD08DE8634&classifiedBusiness=PRIVATE&priceType=WARM_RENT`,
    );

    expect(criteria.classifiedBusiness).toBe('Private');
    expect(criteria.priceType).toBe('WarmRent');
  });

  it('honours the page the url points at and defaults the sort order', () => {
    const { paging } = convertSearchUrlToRequest(`${BASE}?distributionTypes=Rent&locations=AD08DE8634&page=3`);

    expect(paging).toEqual({ page: 3, size: DEFAULT_PAGE_SIZE, order: DEFAULT_ORDER });
  });

  it('falls back to page 1 for a page number that makes no sense', () => {
    const { paging } = convertSearchUrlToRequest(`${BASE}?distributionTypes=Rent&locations=AD08DE8634&page=0`);
    expect(paging.page).toBe(1);
  });

  it('accepts a caller supplied page size', () => {
    const { paging } = convertSearchUrlToRequest(`${BASE}?distributionTypes=Rent&locations=AD08DE8634`, { size: 30 });
    expect(paging.size).toBe(30);
  });

  it('refuses a url without a location rather than searching all of Germany', () => {
    expect(() => convertSearchUrlToRequest(`${BASE}?distributionTypes=Rent&estateTypes=Apartment`)).toThrow(
      /no 'locations' parameter/,
    );
  });

  // A filter that is dropped without a word turns into notifications for exactly the flats the
  // user excluded on purpose.
  it('warns about a filter it cannot translate', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    convertSearchUrlToRequest(`${BASE}?distributionTypes=Rent&locations=AD08DE8634&constructionYearMin=1990`);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('constructionYearMin'));
    warn.mockRestore();
  });

  it('stays quiet about the tracking and view parameters every copied url carries', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    convertSearchUrlToRequest(
      `${BASE}?distributionTypes=Rent&locations=AD08DE8634&serp_view=list&m=homepage_search&utm_source=newsletter&sr=1`,
    );

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
