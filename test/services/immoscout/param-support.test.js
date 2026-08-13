/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { PARAM_SUPPORT, isSupported, keepSupported } from '../../../lib/services/immoscout/param-support.js';
import { ALL_TYPES } from '../../../lib/services/immoscout/real-estate-types.js';
import logger from '../../../lib/services/logger.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('#immoscout parameter support', () => {
  beforeEach(() => vi.spyOn(logger, 'warn').mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  describe('isSupported', () => {
    // Recorded against search/total per type. Sending an unsupported one answers 412
    // ERROR_COMMON_URL_PARAMETER_NOT_SUPPORTED and the search returns nothing at all.
    it.each([
      ['haspromotion', 'apartmentrent'],
      ['ground', 'housebuy'],
      ['ground', 'houserent'],
      ['floor', 'apartmentbuy'],
      ['apartmenttypes', 'apartmentrent'],
      ['buildingtypes', 'housebuy'],
      ['rented', 'apartmentbuy'],
      ['luxurypromotion', 'housebuy'],
      ['constructionphasetypes', 'housebuy'],
      ['newhomebuilder', 'housebuy'],
      ['petsallowedtypes', 'flatshareroom'],
      ['equipment', 'shorttermaccommodation'],
      ['livingspace', 'flatshareroom'],
      ['numberofrooms', 'shorttermaccommodation'],
      ['minimuminternetspeed', 'compulsoryauction'],
      ['price', 'garagerent'],
    ])('should accept %s for %s', (param, realType) => {
      expect(isSupported(param, 'anything', realType)).toBe(true);
    });

    it.each([
      ['haspromotion', 'housebuy'],
      ['haspromotion', 'apartmentbuy'],
      ['ground', 'apartmentrent'],
      ['floor', 'houserent'],
      ['apartmenttypes', 'housebuy'],
      ['buildingtypes', 'apartmentbuy'],
      ['rented', 'apartmentrent'],
      ['luxurypromotion', 'houserent'],
      ['constructionphasetypes', 'houserent'],
      ['newhomebuilder', 'apartmentbuy'],
      ['petsallowedtypes', 'apartmentbuy'],
      ['equipment', 'investment'],
      ['livingspace', 'livingbuysite'],
      ['numberofrooms', 'garagerent'],
      ['minimuminternetspeed', 'garagebuy'],
      ['price', 'assistedliving'],
      ['price', 'compulsoryauction'],
      ['energyefficiencyclasses', 'garagerent'],
      ['freeofcourtageonly', 'assistedliving'],
    ])('should reject %s for %s', (param, realType) => {
      expect(isSupported(param, 'anything', realType)).toBe(false);
    });

    it('should reject a parameter the mobile API does not know at all', () => {
      expect(isSupported('enteredFrom', 'result_list', 'apartmentrent')).toBe(false);
      expect(isSupported('minimuminternetspeeeed', '100000', 'apartmentrent')).toBe(false);
    });

    // Some parameters are accepted by a type only for certain values. "Warmmiete" is one:
    // houserent answers 412 ERROR_COMMON_URL_PARAMETER_VALIDATION_FAILED for it.
    it.each([
      ['rentpermonth', 'apartmentrent', true],
      ['rentpermonth', 'houserent', true],
      ['calculatedtotalrent', 'apartmentrent', true],
      ['calculatedtotalrent', 'houserent', false],
      ['purchaseprice', 'apartmentrent', false],
      ['buy', 'houserent', false],
      ['rentpersqm', 'apartmentrent', false],
    ])('should treat pricetype=%s on %s as %s', (value, realType, expected) => {
      expect(isSupported('pricetype', value, realType)).toBe(expected);
    });

    // Parameters accepted everywhere have to hold for every type, not just the popular ones.
    it.each([
      'exclusioncriteria',
      'osmtags',
      'fulltext',
      'semanticquery',
      'tenantNetwork',
      'sorting',
      'publishedafter',
    ])('should accept %s for every type', (param) => {
      expect(ALL_TYPES.filter((realType) => !isSupported(param, 'x', realType))).toEqual([]);
    });
  });

  describe('keepSupported', () => {
    it('should keep what the type accepts', () => {
      const kept = keepSupported({ price: '-500000', ground: '300-', buildingtypes: ['villa'] }, 'housebuy', 'test');

      expect(kept).toEqual({ price: '-500000', ground: '300-', buildingtypes: ['villa'] });
      expect(logger.warn).not.toHaveBeenCalled();
    });

    // Dropping is the safe half of the trade: a wider search beats a search that returns nothing.
    it('should drop what the type rejects and say so', () => {
      const kept = keepSupported({ price: '-500000', floor: '2-7', haspromotion: 'true' }, 'housebuy', 'query param');

      expect(kept).toEqual({ price: '-500000' });
      expect(logger.warn).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('query param "floor=2-7"'));
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('housebuy'));
    });

    // A filter ImmoScout has and this table does not know about yet is a gap in Fredy. It cannot be
    // forwarded, but it must not vanish without a trace either - the log line is the only place the
    // gap can surface.
    it('should name a filter it has no translator for', () => {
      const kept = keepSupported({ listingtags: 'holzbalken' }, 'apartmentrent', 'query parameter');

      expect(kept).toEqual({});
      expect(logger.warn).toHaveBeenCalledTimes(1);
      const [message] = logger.warn.mock.calls[0];
      expect(message).toContain('no translator');
      expect(message).toContain('listingtags=holzbalken');
      expect(message).toContain('apartmentrent');
      expect(message).toContain('github.com/orangecoding/fredy/issues');
    });

    // The two reasons for dropping have to be told apart in the log: one is expected, the other is
    // a gap worth reporting.
    it('should word the two drop reasons differently', () => {
      keepSupported({ floor: '2-7', listingtags: 'holzbalken' }, 'housebuy', 'query parameter');

      const messages = logger.warn.mock.calls.map(([message]) => message);
      expect(messages.filter((message) => message.includes('not supported for housebuy'))).toHaveLength(1);
      expect(messages.filter((message) => message.includes('no translator'))).toHaveLength(1);
    });

    // Only the website's own tracking and paging noise passes without a word - warning about it on
    // every single job run would bury the lines that matter.
    it.each([
      'enteredFrom',
      'centerofsearchaddress',
      'pagenumber',
      'pagesize',
      'searchId',
      'referrer',
      'utm_source',
      'utm_campaign',
      'cmp_id',
    ])('should drop the noise parameter %s silently', (param) => {
      const kept = keepSupported({ [param]: 'whatever' }, 'apartmentrent', 'query parameter');

      expect(kept).toEqual({});
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should return an empty object for empty input', () => {
      expect(keepSupported({}, 'apartmentrent', 'test')).toEqual({});
    });
  });

  describe('the support table itself', () => {
    // A typo in a type id would silently disable a parameter for that type, and nothing else would
    // notice: the parameter would just be dropped from every search.
    it('should only name types that exist', () => {
      const unknown = Object.entries(PARAM_SUPPORT).flatMap(([param, types]) =>
        types.filter((type) => !ALL_TYPES.includes(type)).map((type) => `${param}: ${type}`),
      );

      expect(unknown).toEqual([]);
    });

    it('should list no type twice for the same parameter', () => {
      const duplicated = Object.entries(PARAM_SUPPORT)
        .filter(([, types]) => new Set(types).size !== types.length)
        .map(([param]) => param);

      expect(duplicated).toEqual([]);
    });
  });
});
