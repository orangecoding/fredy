/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it } from 'vitest';
import { convertSearchUrlToBody, parseLocation } from '../../../lib/services/leboncoin/search-model.js';

const SEARCH = 'https://www.leboncoin.fr/recherche';

/**
 * The rules are the site's own: the parameters with a place of their own in the body, and for every
 * other one its value says what it is - a range written `min-max`, or a list of enum values. Getting
 * one wrong is silent, since the endpoint answers a wider search without complaint.
 */
describe('#leboncoin search model', () => {
  it('translates a search url into the body the search page posts', () => {
    const body = convertSearchUrlToBody(
      `${SEARCH}?category=10&locations=Paris_75011&real_estate_type=1,2&price=min-1500&square=20-max&furnished=1` +
        `&sort=time&order=desc`,
    );

    expect(body).toEqual({
      limit: 35,
      limit_alu: 0,
      offset: 0,
      sort_by: 'time',
      sort_order: 'desc',
      filters: {
        category: { id: '10' },
        location: { locations: [{ locationType: 'city', city: 'Paris', zipcode: '75011' }] },
        enums: { real_estate_type: ['1', '2'], furnished: ['1'], ad_type: ['offer'] },
        ranges: { price: { max: 1500 }, square: { min: 20 } },
      },
    });
  });

  it('reads a closed range and a soft one', () => {
    const { filters } = convertSearchUrlToBody(`${SEARCH}?category=9&rooms=2-3&bedrooms=1-2-lax`);
    expect(filters.ranges).toEqual({ rooms: { min: 2, max: 3 }, bedrooms: { min: 1, max: 2, lax: true } });
  });

  // The site writes `-strict` where the user turned the widening off. Read as an enum value it
  // dropped the price cap out of the search altogether.
  it('reads a strict range as a range', () => {
    const { filters } = convertSearchUrlToBody(`${SEARCH}?category=10&price=min-1500-strict`);
    expect(filters.ranges).toEqual({ price: { max: 1500, lax: false } });
    expect(filters.enums).toEqual({ ad_type: ['offer'] });
  });

  it('reads the keywords, where they are searched and whose adverts', () => {
    const body = convertSearchUrlToBody(`${SEARCH}?category=10&text=balcon&search_in=subject&owner_type=private`);
    expect(body.filters.keywords).toEqual({ text: 'balcon', type: 'subject' });
    expect(body.owner_type).toBe('private');
  });

  it('searches offers unless the url asks for the wanted ads', () => {
    expect(convertSearchUrlToBody(`${SEARCH}?category=10`).filters.enums.ad_type).toEqual(['offer']);
    expect(convertSearchUrlToBody(`${SEARCH}?category=10&ad_type=demand`).filters.enums.ad_type).toEqual(['demand']);
  });

  it('reads a radius around a point', () => {
    const { filters } = convertSearchUrlToBody(`${SEARCH}?category=10&lat=48.85&lng=2.34&radius=5000`);
    expect(filters.location).toEqual({ area: { lat: 48.85, lng: 2.34, radius: 5000 } });
  });

  // `around` is the label the site shows for the point ("Rue de Rivoli, Paris"). The point itself is
  // lat/lng/radius; taken for a filter, the label became an enum no advert carries.
  it('reads the label of a point as the label it is, not as a filter', () => {
    const { filters } = convertSearchUrlToBody(
      `${SEARCH}?category=10&lat=48.8566&lng=2.3522&radius=10000&around=Rue%20de%20Rivoli%2C%20Paris`,
    );
    expect(filters.location).toEqual({ area: { lat: 48.8566, lng: 2.3522, radius: 10000 } });
    expect(filters.enums).toEqual({ ad_type: ['offer'] });
  });

  it('ignores what the site ignores, and the page - Fredy reads the newest page', () => {
    const { filters } = convertSearchUrlToBody(
      `${SEARCH}?category=10&from=hc&kst=r&pi=abc&page=4&utm_source=x&gclid=y&cities=Paris`,
    );
    expect(filters).toEqual({ category: { id: '10' }, enums: { ad_type: ['offer'] } });
  });

  it('ignores the campaign tags an alert mail or an ad click appends', () => {
    const { filters } = convertSearchUrlToBody(`${SEARCH}?category=10&xtor=EPR-123&at_medium=email&msclkid=abc`);
    expect(filters).toEqual({ category: { id: '10' }, enums: { ad_type: ['offer'] } });
  });

  it("reads a browse page's category off its path", () => {
    expect(convertSearchUrlToBody('https://www.leboncoin.fr/c/locations?real_estate_type=2').filters.category).toEqual({
      id: '10',
    });
  });

  it('refuses a url that is not a search', () => {
    expect(() => convertSearchUrlToBody('https://www.leboncoin.fr/ad/locations/3276619393')).toThrow(/recherche/);
    expect(() => convertSearchUrlToBody('https://www.leboncoin.fr/c/voitures')).toThrow(/not a leboncoin search/);
  });

  it('refuses a radius that is not a number', () => {
    expect(() => convertSearchUrlToBody(`${SEARCH}?category=10&radius=far`)).toThrow(/radius/);
  });
});

/** The inverse of the site's `getSearchLocationsUrlParam`, one kind of place at a time. */
describe('#leboncoin locations', () => {
  it('reads a town, with its postcode or its department', () => {
    expect(parseLocation('Paris_75011')).toEqual({ locationType: 'city', city: 'Paris', zipcode: '75011' });
    expect(parseLocation('Lyon_69')).toEqual({ locationType: 'city', city: 'Lyon', department_id: '69' });
    expect(parseLocation('Paris')).toEqual({ locationType: 'city', city: 'Paris' });
  });

  it('reads a bare postcode', () => {
    expect(parseLocation('75011')).toEqual({ locationType: 'city', zipcode: '75011' });
  });

  it('reads the area a town was widened to', () => {
    expect(parseLocation('Paris__48.85717_2.3414_9256_20000')).toEqual({
      locationType: 'city',
      city: 'Paris',
      area: { lat: 48.85717, lng: 2.3414, default_radius: 9256, radius: 20000 },
    });
  });

  it('reads regions and departments, and their surroundings', () => {
    expect(parseLocation('r_12')).toEqual({ locationType: 'region', region_id: '12' });
    expect(parseLocation('rn_12')).toEqual({ locationType: 'region_near', region_id: '12' });
    expect(parseLocation('d_69')).toEqual({ locationType: 'department', department_id: '69' });
    expect(parseLocation('dn_2A')).toEqual({ locationType: 'department_near', department_id: '2A' });
  });

  it('reads a district and a place', () => {
    expect(parseLocation('district_Montmartre_75018__48.88_2.34_800')).toEqual({
      locationType: 'district',
      district: 'Montmartre',
      zipcode: '75018',
      area: { lat: 48.88, lng: 2.34, default_radius: 800 },
    });
    expect(parseLocation('p_Gare de Lyon_75012')).toEqual({
      locationType: 'place',
      place: 'Gare de Lyon',
      zipcode: '75012',
    });
  });

  it('reads a map section and a drawn area', () => {
    expect(parseLocation('bbox_2.4|48.9|2.3|48.8')).toEqual({
      locationType: 'bbox',
      area: { bbox: [2.4, 48.9, 2.3, 48.8] },
    });
    expect(parseLocation('polygon_2.3|48.8;2.4|48.8;2.4|48.9')).toEqual({
      locationType: 'polygon',
      area: {
        polygon: [
          [2.3, 48.8],
          [2.4, 48.8],
          [2.4, 48.9],
        ],
      },
    });
  });

  it('refuses a shape it cannot read rather than searching without it', () => {
    expect(() => parseLocation('bbox_2.4|48.9', 'u')).toThrow(/map section/);
    expect(() => parseLocation('polygon_2.3|48.8', 'u')).toThrow(/drawn area/);
    expect(() => parseLocation('Paris__north_2.34_9256', 'u')).toThrow(/area/);
  });

  it('reads several places at once', () => {
    const { filters } = convertSearchUrlToBody(`${SEARCH}?category=10&locations=Paris_75011,d_92,r_11`);
    expect(filters.location.locations.map((location) => location.locationType)).toEqual([
      'city',
      'department',
      'region',
    ]);
  });
});
