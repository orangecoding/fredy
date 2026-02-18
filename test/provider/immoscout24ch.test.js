/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { expect } from 'chai';
import { getPropertyTypeSlug, sanitizeLocality } from '../../lib/provider/immoscout24ch.js';

describe('#immoscout24ch URL helpers', () => {
  describe('getPropertyTypeSlug()', () => {
    it('should return "flat" for APARTMENT category', () => {
      expect(getPropertyTypeSlug(['APARTMENT'])).to.equal('flat');
    });

    it('should return "flat" for FLAT category', () => {
      expect(getPropertyTypeSlug(['FLAT'])).to.equal('flat');
    });

    it('should return "flat" for mixed apartment categories', () => {
      expect(getPropertyTypeSlug(['APARTMENT', 'FLAT'])).to.equal('flat');
    });

    it('should return "house" for HOUSE category', () => {
      expect(getPropertyTypeSlug(['HOUSE'])).to.equal('house');
    });

    it('should return "house" for VILLA category', () => {
      expect(getPropertyTypeSlug(['VILLA'])).to.equal('house');
    });

    it('should return "house" for CHALET category', () => {
      expect(getPropertyTypeSlug(['CHALET'])).to.equal('house');
    });

    it('should return "parking" for PARKING category', () => {
      expect(getPropertyTypeSlug(['PARKING'])).to.equal('parking');
    });

    it('should return "parking" for GARAGE category', () => {
      expect(getPropertyTypeSlug(['GARAGE'])).to.equal('parking');
    });

    it('should return "commercial" for OFFICE category', () => {
      expect(getPropertyTypeSlug(['OFFICE'])).to.equal('commercial');
    });

    it('should return "commercial" for RETAIL category', () => {
      expect(getPropertyTypeSlug(['RETAIL'])).to.equal('commercial');
    });

    it('should return "plot" for LAND category', () => {
      expect(getPropertyTypeSlug(['LAND'])).to.equal('plot');
    });

    it('should return "property" for empty array', () => {
      expect(getPropertyTypeSlug([])).to.equal('property');
    });

    it('should return "property" for null input', () => {
      expect(getPropertyTypeSlug(null)).to.equal('property');
    });

    it('should return "property" for undefined input', () => {
      expect(getPropertyTypeSlug(undefined)).to.equal('property');
    });

    it('should return "property" for unknown category', () => {
      expect(getPropertyTypeSlug(['UNKNOWN_TYPE'])).to.equal('property');
    });

    it('should handle lowercase categories', () => {
      expect(getPropertyTypeSlug(['apartment'])).to.equal('flat');
    });

    it('should handle mixed case categories', () => {
      expect(getPropertyTypeSlug(['Apartment'])).to.equal('flat');
    });

    it('should use first matching category', () => {
      expect(getPropertyTypeSlug(['UNKNOWN', 'HOUSE', 'APARTMENT'])).to.equal('house');
    });
  });

  describe('sanitizeLocality()', () => {
    it('should lowercase simple locality', () => {
      expect(sanitizeLocality('Zurich')).to.equal('zurich');
    });

    it('should replace German umlauts', () => {
      expect(sanitizeLocality('Zürich')).to.equal('zuerich');
      expect(sanitizeLocality('Köln')).to.equal('koeln');
      expect(sanitizeLocality('München')).to.equal('muenchen');
    });

    it('should replace ß with ss', () => {
      expect(sanitizeLocality('Straße')).to.equal('strasse');
    });

    it('should replace French accents', () => {
      expect(sanitizeLocality('Genève')).to.equal('geneve');
      expect(sanitizeLocality('Neuchâtel')).to.equal('neuchatel');
    });

    it('should replace spaces with dashes', () => {
      expect(sanitizeLocality('St. Gallen')).to.equal('st-gallen');
      expect(sanitizeLocality('Zürich HB')).to.equal('zuerich-hb');
    });

    it('should handle multiple spaces', () => {
      expect(sanitizeLocality('New   York')).to.equal('new-york');
    });

    it('should remove special characters', () => {
      expect(sanitizeLocality('City (Center)')).to.equal('city-center');
      expect(sanitizeLocality('Area/District')).to.equal('area-district');
    });

    it('should remove leading and trailing dashes', () => {
      expect(sanitizeLocality('  Zurich  ')).to.equal('zurich');
      expect(sanitizeLocality('--Zurich--')).to.equal('zurich');
    });

    it('should return "switzerland" for null input', () => {
      expect(sanitizeLocality(null)).to.equal('switzerland');
    });

    it('should return "switzerland" for undefined input', () => {
      expect(sanitizeLocality(undefined)).to.equal('switzerland');
    });

    it('should return "switzerland" for empty string', () => {
      expect(sanitizeLocality('')).to.equal('switzerland');
    });

    it('should return "switzerland" for non-string input', () => {
      expect(sanitizeLocality(123)).to.equal('switzerland');
      expect(sanitizeLocality({})).to.equal('switzerland');
    });

    it('should handle complex Swiss localities', () => {
      expect(sanitizeLocality('Bern Länggasse-Felsenau')).to.equal('bern-laenggasse-felsenau');
      expect(sanitizeLocality('La Chaux-de-Fonds')).to.equal('la-chaux-de-fonds');
    });
  });
});
