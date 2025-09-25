import { expect } from 'chai';
import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { mockFredy } from '../utils.js';

describe('FredyRuntime', () => {
  afterEach(() => {
    similarityCache.invalidateAllForTest();
  });

  after(() => {
    similarityCache.stopCacheCleanup();
  });

  describe('_filterBySimilarListings', () => {
    let fredyRuntime;

    beforeEach(async () => {
      const FredyRuntime = await mockFredy();
      fredyRuntime = new FredyRuntime({}, null, 'dummy-provider', 'dummy-job', similarityCache);
    });

    it('should filter out listings with similar title and address already in cache', () => {
      similarityCache.addCacheEntry('Penthouse', 'Mustermann Straße 1');

      const listings = [
        { id: '1', title: 'Penthouse', address: 'Mustermann Straße 1' },
        { id: '2', title: 'Nice apartment', address: 'Mustermann Straße 15' },
      ];

      const result = fredyRuntime._filterBySimilarListings(listings);

      expect(result).to.have.length(1);
      expect(result[0].id).to.equal('2');
      expect(result[0].title).to.equal('Nice apartment');

      expect(similarityCache.hasSimilarEntries('Nice apartment', 'Mustermann Straße 15')).to.be.true;
    });

    it('should handle listings with null or undefined address', () => {
      const listings = [
        { id: '1', title: 'Penthouse', address: null },
        { id: '2', title: 'Nice apartment', address: undefined },
      ];

      const result = fredyRuntime._filterBySimilarListings(listings);

      expect(result).to.have.length(2);

      expect(similarityCache.hasSimilarEntries('Penthouse', null)).to.be.true;
      expect(similarityCache.hasSimilarEntries('Nice apartment', undefined)).to.be.true;
    });
  });
});
