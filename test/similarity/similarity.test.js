import { expect } from 'chai';
import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';

describe('similarityCheck', () => {
  it('should return true on duplicate', () => {
    similarityCache.addCacheEntry('Hello World', 'Test');
    expect(similarityCache.hasSimilarEntries('Hello World', 'Test')).to.be.true;
  });

  it('should return true even if one value is null', () => {
    similarityCache.addCacheEntry('Hello World', null);
    expect(similarityCache.hasSimilarEntries('Hello World', null)).to.be.true;
  });

  it('should return true even if one value is an obj', () => {
    similarityCache.addCacheEntry('Hello World', [{ TR: 'OLOLO' }]);
    expect(similarityCache.hasSimilarEntries('Hello World', [{ TR: 'OLOLO' }])).to.be.true;
  });

  it('should return false when no duplicate', () => {
    similarityCache.addCacheEntry('Hello World__', 'Test');
    expect(similarityCache.hasSimilarEntries('Hello World___', 'Test')).to.be.false;
  });

  it('should return false when no duplicate', () => {
    expect(similarityCache.hasSimilarEntries('Hello World', 'Test')).to.be.true;
    similarityCache.invalidateAllForTest();
    expect(similarityCache.hasSimilarEntries('Hello World', 'Test')).to.be.false;
  });
});
