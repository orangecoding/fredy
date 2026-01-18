/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/*
 * Newhome.ch provider test
 *
 * NOTE: Integration tests are skipped because Newhome.ch uses Cloudflare Turnstile
 * protection that requires Bright Data Web Unlocker to bypass. These unit tests
 * verify the transformation functions work correctly.
 */

import { expect } from 'chai';
import { init, config, metaInformation } from '../../lib/provider/newhome.js';

describe('#newhome provider', () => {
  describe('metaInformation', () => {
    it('should have correct name', () => {
      expect(metaInformation.name).to.equal('Newhome');
    });

    it('should have correct baseUrl', () => {
      expect(metaInformation.baseUrl).to.equal('https://www.newhome.ch/');
    });

    it('should have correct id', () => {
      expect(metaInformation.id).to.equal('newhome');
    });
  });

  describe('init()', () => {
    it('should set enabled from sourceConfig', () => {
      init({ enabled: true, url: 'https://example.com' }, []);
      expect(config.enabled).to.be.true;
    });

    it('should set url from sourceConfig', () => {
      const testUrl = 'https://www.newhome.ch/en/rent/apartment/location-bern/list';
      init({ enabled: true, url: testUrl }, []);
      expect(config.url).to.equal(testUrl);
    });

    it('should handle empty blacklist', () => {
      init({ enabled: true, url: 'https://example.com' }, []);
      // No error thrown
    });

    it('should handle null blacklist', () => {
      init({ enabled: true, url: 'https://example.com' }, null);
      // No error thrown
    });
  });

  describe('config', () => {
    it('should have getListings function', () => {
      expect(config.getListings).to.be.a('function');
    });

    it('should have normalize function', () => {
      expect(config.normalize).to.be.a('function');
    });

    it('should have filter function', () => {
      expect(config.filter).to.be.a('function');
    });

    it('should have crawlFields defined', () => {
      expect(config.crawlFields).to.be.an('object');
      expect(config.crawlFields.id).to.equal('id');
      expect(config.crawlFields.title).to.equal('title');
      expect(config.crawlFields.price).to.equal('price');
      expect(config.crawlFields.address).to.equal('address');
      expect(config.crawlFields.link).to.equal('link');
    });
  });

  describe('normalize()', () => {
    it('should create hash-based id from id and price', () => {
      const listing = {
        id: '12345',
        title: 'Test Apartment',
        price: 'CHF 2000',
        address: 'Bern',
      };

      const normalized = config.normalize(listing);

      expect(normalized.id).to.be.a('string');
      expect(normalized.id).to.not.equal('12345'); // Should be hashed
    });

    it('should trim title', () => {
      const listing = {
        id: '12345',
        title: '  Test Apartment  ',
        price: 'CHF 2000',
        address: 'Bern',
      };

      const normalized = config.normalize(listing);

      expect(normalized.title).to.equal('Test Apartment');
    });

    it('should handle empty title', () => {
      const listing = {
        id: '12345',
        title: '',
        price: 'CHF 2000',
        address: 'Bern',
      };

      const normalized = config.normalize(listing);

      expect(normalized.title).to.equal('NO TITLE FOUND');
    });

    it('should handle null title', () => {
      const listing = {
        id: '12345',
        title: null,
        price: 'CHF 2000',
        address: 'Bern',
      };

      const normalized = config.normalize(listing);

      expect(normalized.title).to.equal('NO TITLE FOUND');
    });

    it('should trim address', () => {
      const listing = {
        id: '12345',
        title: 'Test',
        price: 'CHF 2000',
        address: '  3000 Bern  ',
      };

      const normalized = config.normalize(listing);

      expect(normalized.address).to.equal('3000 Bern');
    });

    it('should handle empty address', () => {
      const listing = {
        id: '12345',
        title: 'Test',
        price: 'CHF 2000',
        address: '',
      };

      const normalized = config.normalize(listing);

      expect(normalized.address).to.equal('NO ADDRESS FOUND');
    });
  });

  describe('filter()', () => {
    beforeEach(() => {
      // Reset with test blacklist
      init({ enabled: true, url: 'https://example.com' }, ['spam', 'scam']);
    });

    it('should return true for listing with no blacklisted words', () => {
      const listing = {
        title: 'Beautiful Apartment',
        description: 'Great location in Bern',
      };

      expect(config.filter(listing)).to.be.true;
    });

    it('should return false for listing with blacklisted word in title', () => {
      const listing = {
        title: 'Spam apartment for rent',
        description: 'Great location',
      };

      expect(config.filter(listing)).to.be.false;
    });

    it('should return false for listing with blacklisted word in description', () => {
      const listing = {
        title: 'Beautiful Apartment',
        description: 'This might be a scam',
      };

      expect(config.filter(listing)).to.be.false;
    });

    it('should be case insensitive', () => {
      const listing = {
        title: 'SPAM apartment',
        description: 'Great location',
      };

      expect(config.filter(listing)).to.be.false;
    });
  });
});
