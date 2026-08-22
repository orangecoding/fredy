/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it } from 'vitest';
import {
  convertSearchUrlToRequest,
  encodePolyline,
  isochroneToPolylines,
  DEFAULT_ORDER,
  DEFAULT_PAGE_SIZE,
} from '../../../lib/services/immowelt/immowelt-search-model.js';

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

  // The sample values are ones immowelt actually accepts - `Maisonette`, which stood here
  // before, is not in its vocabulary at all (it calls that shape `Duplex`).
  it('splits every comma separated list, including multi valued distribution types', () => {
    const { criteria } = convertSearchUrlToRequest(
      `${BASE}?distributionTypes=Buy,Buy_Auction,Compulsory_Auction&estateTypes=House,Apartment` +
        `&estateSubTypes=Penthouse,Loft&projectTypes=Stock,New_Build&featuresIncluded=Balcony_Terrace,Elevator` +
        `&locations=AD08DE2350,AD08DE8634`,
    );

    expect(criteria.distributionTypes).toEqual(['Buy', 'Buy_Auction', 'Compulsory_Auction']);
    expect(criteria.estateTypes).toEqual(['House', 'Apartment']);
    expect(criteria.estateSubTypes).toEqual(['Penthouse', 'Loft']);
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
  it('refuses a range filter that is not a number instead of sending NaN', () => {
    expect(() => convertSearchUrlToRequest(`${BASE}?distributionTypes=Rent&locations=AD08DE8634&priceMax=abc`)).toThrow(
      /priceMax/,
    );
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

  it('translates the construction year immowelt spells the same way in url and criteria', () => {
    const { criteria } = convertSearchUrlToRequest(
      `${BASE}?distributionTypes=Buy&locations=AD08DE9991&yearOfConstructionMin=2010&yearOfConstructionMax=2024`,
    );

    expect(criteria).toMatchObject({ yearOfConstructionMin: 2010, yearOfConstructionMax: 2024 });
  });

  // Every name and type below was read off immowelt's own search model and then confirmed against
  // the live BFF: it validates each field with typia and names the type it wanted.
  it('carries the plot and bedroom ranges over as numbers', () => {
    const { criteria } = convertSearchUrlToRequest(
      `${BASE}?distributionTypes=Buy&locations=AD08DE9991` +
        `&plotSpaceMin=500&plotSpaceMax=1200&numberOfBedroomsMin=2&numberOfBedroomsMax=4`,
    );

    expect(criteria).toMatchObject({
      plotSpaceMin: 500,
      plotSpaceMax: 1200,
      numberOfBedroomsMin: 2,
      numberOfBedroomsMax: 4,
    });
  });

  it('splits the furnishing, use, build state and energy lists', () => {
    const { criteria } = convertSearchUrlToRequest(
      `${BASE}?distributionTypes=Rent&locations=AD08DE9991&furnished=Full,Part&useFor=Living` +
        `&buildState=Mint_Condition&energyTypes=HEAT_PUMP&energyCertificateClass=A_PLUS,A` +
        `&locationsInBuildingIncluded=Groundfloor&locationsInBuildingExcluded=Half_Basement`,
    );

    expect(criteria).toMatchObject({
      furnished: ['Full', 'Part'],
      useFor: ['Living'],
      buildState: ['Mint_Condition'],
      energyTypes: ['HEAT_PUMP'],
      energyCertificateClass: ['A_PLUS', 'A'],
      locationsInBuildingIncluded: ['Groundfloor'],
      locationsInBuildingExcluded: ['Half_Basement'],
    });
  });

  // `priceType` wants `WarmRent`, the WBS filter wants `Not_Applicable`. Running the second through
  // the PascalCase rule of the first produces a value the BFF rejects outright.
  it('leaves the WBS filter spelled the way the BFF wants it', () => {
    const { criteria } = convertSearchUrlToRequest(
      `${BASE}?distributionTypes=Rent&locations=AD08DE9991&certificateOfEligibilityNeeded=Not_Applicable`,
    );

    expect(criteria.certificateOfEligibilityNeeded).toBe('Not_Applicable');
  });

  it('reads the boolean filters as booleans, not as the strings they arrive in', () => {
    const { criteria } = convertSearchUrlToRequest(
      `${BASE}?distributionTypes=Rent&locations=AD08DE9991&isSaleGoodwill=false&availableFromIsLooseMode=true`,
    );

    expect(criteria).toMatchObject({ isSaleGoodwill: false, availableFromIsLooseMode: true });
  });

  it('refuses a boolean filter that is neither true nor false', () => {
    expect(() =>
      convertSearchUrlToRequest(`${BASE}?distributionTypes=Rent&locations=AD08DE9991&isSaleGoodwill=maybe`),
    ).toThrow(/isSaleGoodwill/);
  });

  it('passes the move-in date through and refuses one the BFF would reject', () => {
    const { criteria } = convertSearchUrlToRequest(
      `${BASE}?distributionTypes=Rent&locations=AD08DE9991&availableFromMax=2026-09-01`,
    );
    expect(criteria.availableFromMax).toBe('2026-09-01');

    expect(() =>
      convertSearchUrlToRequest(`${BASE}?distributionTypes=Rent&locations=AD08DE9991&availableFromMax=01.09.2026`),
    ).toThrow(/availableFromMax/);
  });

  // The BFF drops criteria keys it does not know without a word - a made-up key answers with the
  // unfiltered result set - so mapping these would widen the search instead of narrowing it.
  it('refuses the filters the search BFF has no field for at all', () => {
    expect(() =>
      convertSearchUrlToRequest(`${BASE}?distributionTypes=Rent&locations=AD08DE9991&keywords=Altbau`),
    ).toThrow(/no field for keywords/);
  });

  // A filter that is dropped without a word turns into notifications for exactly the flats the
  // user excluded on purpose, which is worse than a job that stops and says which filter it was.
  it('refuses a filter it cannot translate instead of running a wider search', () => {
    expect(() =>
      convertSearchUrlToRequest(`${BASE}?distributionTypes=Rent&locations=AD08DE8634&energyCertificate=A_PLUS`),
    ).toThrow(/energyCertificate/);
  });

  it('accepts the tracking and view parameters every copied url carries', () => {
    const { criteria } = convertSearchUrlToRequest(
      `${BASE}?distributionTypes=Rent&locations=AD08DE8634&serp_view=list&m=homepage_search&utm_source=newsletter&sr=1`,
    );

    expect(criteria.location).toEqual({ placeIds: ['AD08DE8634'] });
  });
});

// The values in here are what immowelt itself put in the url and sent to `/serp-bff/search` for a
// search area drawn on the map at Dresden.
describe('#immowelt search model, map searches', () => {
  const DRAWN = 'eyJkcmF3aW5ncyI6WyJhaHt2SG1geHJBP2l2SWpgQz8_aHZJa2BDPyJdfQ';
  const POLYLINE = 'ah{vHm`xrA?ivIj`C??hvIk`C?';
  const BBOX = 'MTMuNzIxNDU3MDAwMDAwMDAxLDUxLjA3NjI4LDEzLjc4NzM3Mjk5OTk5OTk5OSw1MS4xMDExMTk5OTk5OTk5OTU';

  // Sent as a place id, this is the `PlaceIds must contain only alphanumeric valid location type`
  // 400 that every map-drawn job died on after the upgrade.
  it('decodes a drawn search area into the polylines the BFF expects', () => {
    const { criteria } = convertSearchUrlToRequest(`${BASE}?distributionTypes=Buy&locations=${DRAWN}`);

    expect(criteria.location).toEqual({ polylines: [POLYLINE] });
  });

  // The BFF intersects the two: Dresden plus a rectangle over one district answers with the 34
  // listings of the rectangle rather than the city's 1411, so keeping the id would cut away the
  // surroundings the area was drawn for. Immowelt's own map drops it too.
  it('lets a drawn area replace the place it was drawn over', () => {
    const { criteria } = convertSearchUrlToRequest(`${BASE}?distributionTypes=Buy&locations=AD08DE9991,${DRAWN}`);

    expect(criteria.location).toEqual({ polylines: [POLYLINE] });
  });

  // The shape a radius saved around a place arrives in, reported in #424: the polyline is the
  // circle's boundary, `radius` and `coordinates` describe the same circle a second time.
  it('translates a saved radius into the polyline of its boundary', () => {
    const encoded = Buffer.from(
      JSON.stringify({ placeId: 'AD08DE9991', radius: 2, polyline: POLYLINE, coordinates: { lat: 51.05, lng: 13.73 } }),
    ).toString('base64url');

    const { criteria } = convertSearchUrlToRequest(`${BASE}?distributionTypes=Buy&locations=${encoded}`);

    expect(criteria.location).toEqual({ polylines: [POLYLINE] });
  });

  it('keeps the place id of an encoded location that never had a boundary', () => {
    const encoded = Buffer.from(JSON.stringify({ placeId: 'AD08DE9991' })).toString('base64url');

    const { criteria } = convertSearchUrlToRequest(`${BASE}?distributionTypes=Buy&locations=${encoded}`);

    expect(criteria.location).toEqual({ placeIds: ['AD08DE9991'] });
  });

  // Searching the place instead would cover the whole city rather than the 2 km the user saved.
  it('refuses a radius whose boundary it cannot reproduce', () => {
    const encoded = Buffer.from(JSON.stringify({ placeId: 'AD08DE9991', radius: 2 })).toString('base64url');

    expect(() => convertSearchUrlToRequest(`${BASE}?distributionTypes=Buy&locations=${encoded}`)).toThrow(/radius/);
  });

  it('translates the map section into the polygon the BFF calls geometry', () => {
    const { criteria } = convertSearchUrlToRequest(`${BASE}?distributionTypes=Buy&locations=AD08DE9991&bbox=${BBOX}`);

    expect(criteria.location.geometry).toEqual({
      type: 'Polygon',
      coordinates: [
        [
          [13.721457000000001, 51.07628],
          [13.787372999999999, 51.07628],
          [13.787372999999999, 51.101119999999995],
          [13.721457000000001, 51.101119999999995],
          [13.721457000000001, 51.07628],
        ],
      ],
    });
  });

  it('refuses a search area it would have to drop half of', () => {
    const encoded = Buffer.from(JSON.stringify({ drawings: [POLYLINE], travelTimeMinutes: 25 })).toString('base64url');

    expect(() => convertSearchUrlToRequest(`${BASE}?distributionTypes=Buy&locations=${encoded}`)).toThrow(
      /travelTimeMinutes/,
    );
  });

  it('refuses a map section that is not a bounding box', () => {
    const broken = Buffer.from('somewhere near Dresden').toString('base64url');

    expect(() =>
      convertSearchUrlToRequest(`${BASE}?distributionTypes=Buy&locations=AD08DE9991&bbox=${broken}`),
    ).toThrow(/map section/);
  });

  it('refuses an encoded area that carries nothing to search in', () => {
    const empty = Buffer.from(JSON.stringify({ drawings: [] })).toString('base64url');

    expect(() => convertSearchUrlToRequest(`${BASE}?distributionTypes=Buy&locations=${empty}`)).toThrow(/nothing to/);
  });
});

// Everything in here was read off immowelt's own "search by commute time", and the numbers were
// confirmed against it: the url of #430 shows 17 flats in the browser, and the polylines this
// produces answer with the same 17.
describe('#immowelt search model, commute areas', () => {
  /** `{"placeIds":["STRTDE197842"],"duration":"15","mode":"Walk"}` - 15 minutes' walk of a Munich street. */
  const COMMUTE = 'eyJwbGFjZUlkcyI6WyJTVFJUREUxOTc4NDIiXSwiZHVyYXRpb24iOiIxNSIsIm1vZGUiOiJXYWxrIn0';

  /**
   * @param {Record<string, any>} area a decoded commute entry
   * @returns {string} it as a `locations` entry
   */
  const encoded = (area) => Buffer.from(JSON.stringify(area)).toString('base64url');

  // The url of #430, which stopped the job with `describes its search area with duration, mode`.
  it('reads the place, the travel time and the mode out of a commute search', () => {
    const { criteria, commutes } = convertSearchUrlToRequest(
      `${BASE}?distributionTypes=Buy&estateTypes=Apartment&locations=${COMMUTE}&priceMax=500000`,
    );

    expect(commutes).toEqual([{ placeId: 'STRTDE197842', duration: 15, mode: 'Walk' }]);
    expect(criteria.location).toEqual({});
    expect(criteria.priceMax).toBe(500000);
  });

  // The boundary lands in `polylines` once it is drawn, and the BFF intersects those with
  // `placeIds` - keeping the ids would cut the commute area down to the street it starts on.
  it('lets a commute area replace the places named beside it', () => {
    const { criteria, commutes } = convertSearchUrlToRequest(
      `${BASE}?distributionTypes=Buy&locations=AD08DE9991,${COMMUTE}`,
    );

    expect(criteria.location).toEqual({});
    expect(commutes).toHaveLength(1);
  });

  it('keeps a drawn area next to a commute area, because the BFF unions the two', () => {
    const drawn = 'eyJkcmF3aW5ncyI6WyJhaHt2SG1geHJBP2l2SWpgQz8_aHZJa2BDPyJdfQ';

    const { criteria, commutes } = convertSearchUrlToRequest(
      `${BASE}?distributionTypes=Buy&locations=${drawn},${COMMUTE}`,
    );

    expect(criteria.location).toEqual({ polylines: ['ah{vHm`xrA?ivIj`C??hvIk`C?'] });
    expect(commutes).toHaveLength(1);
  });

  it('reads a second commute area as a second area rather than overwriting the first', () => {
    const other = encoded({ placeIds: ['AD08DE9991'], duration: '30', mode: 'Transit' });

    const { commutes } = convertSearchUrlToRequest(`${BASE}?distributionTypes=Buy&locations=${COMMUTE},${other}`);

    expect(commutes).toEqual([
      { placeId: 'STRTDE197842', duration: 15, mode: 'Walk' },
      { placeId: 'AD08DE9991', duration: 30, mode: 'Transit' },
    ]);
  });

  it('leaves a url without a commute area with an empty list of them', () => {
    const { commutes } = convertSearchUrlToRequest(`${BASE}?distributionTypes=Buy&locations=AD08DE9991`);

    expect(commutes).toEqual([]);
  });

  // Immowelt's routing service answers 500 for anything outside these four, which would end the run
  // with its error page rather than with something the user can act on.
  it('refuses a travel mode immowelt cannot route', () => {
    const flying = encoded({ placeIds: ['STRTDE197842'], duration: '15', mode: 'Helicopter' });

    expect(() => convertSearchUrlToRequest(`${BASE}?distributionTypes=Buy&locations=${flying}`)).toThrow(/Helicopter/);
  });

  it('refuses a travel time that is not a number of minutes', () => {
    const forever = encoded({ placeIds: ['STRTDE197842'], duration: 'soon', mode: 'Walk' });

    expect(() => convertSearchUrlToRequest(`${BASE}?distributionTypes=Buy&locations=${forever}`)).toThrow(/soon/);
  });

  // Only the first id would reach the routing service, so the other places would silently vanish.
  it('refuses a commute area drawn around more than one place', () => {
    const two = encoded({ placeIds: ['STRTDE197842', 'AD08DE9991'], duration: '15', mode: 'Walk' });

    expect(() => convertSearchUrlToRequest(`${BASE}?distributionTypes=Buy&locations=${two}`)).toThrow(/2 places/);
  });

  it('still refuses an area whose other half it would have to drop', () => {
    const partly = encoded({ placeIds: ['STRTDE197842'], duration: '15', mode: 'Walk', travelTimeMinutes: 25 });

    expect(() => convertSearchUrlToRequest(`${BASE}?distributionTypes=Buy&locations=${partly}`)).toThrow(
      /travelTimeMinutes/,
    );
  });
});

// The ring below is what immowelt's routing service answered for the commute area of #430, and the
// polyline is the string immowelt's own page sent to the BFF for it. Encoding the one has to
// produce the other character for character, because the BFF reads nothing else.
describe('#immowelt search model, polyline encoding', () => {
  const RING = [
    [11.60531158, 48.09858673],
    [11.60553739, 48.09829432],
    [11.60573394, 48.0978433],
    [11.60581443, 48.09735794],
    [11.605774, 48.09686761],
    [11.60561509, 48.096402],
  ];
  // The trailing backslash is part of the encoding, not an escape gone missing.
  const ENCODED = 'egqdHetyeAz@m@xAe@~AO`BF|A\\';

  it('encodes a ring the way immowelt encodes its own', () => {
    expect(encodePolyline(RING)).toBe(ENCODED);
  });

  it('encodes nothing as nothing', () => {
    expect(encodePolyline([])).toBe('');
  });

  // A transit area comes back as dozens of disjoint islands, and the BFF searches the union of them
  // - so every ring has to become an entry rather than only the biggest one.
  it('turns every ring of an isochrone into its own polyline', () => {
    expect(isochroneToPolylines([[RING], [RING.slice(0, 2)]])).toEqual([ENCODED, 'egqdHetyeAz@m@']);
  });

  it('turns an empty answer into no polylines at all', () => {
    expect(isochroneToPolylines([])).toEqual([]);
  });
});
