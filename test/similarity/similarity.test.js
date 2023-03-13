import SimilarityCacheEntry from '../../lib/services/similarity-check/SimilarityCacheEntry.js';
import chai from 'chai';
const expect = chai.expect;
describe('similarityCheck', () => {
  describe('#similarityCheck()', () => {
    it('should be false', () => {
      const check = new SimilarityCacheEntry(0);
      check.setCacheEntry('Hallo');
      expect(check.hasSimilarEntries('Welt')).to.be.false;
    });
    it('should be true', () => {
      const check = new SimilarityCacheEntry(0);
      check.setCacheEntry('Hallo');
      expect(check.hasSimilarEntries('hallo')).to.be.true;
    });
    it('should be true', () => {
      const check = new SimilarityCacheEntry(0);
      check.setCacheEntry('Selling an incredible house in san francisco');
      expect(check.hasSimilarEntries('incredible house in san francisco for sale')).to.be.true;
    });
    it('should be true', () => {
      const check = new SimilarityCacheEntry(0);
      check.setCacheEntry('a');
      check.setCacheEntry('b');
      check.setCacheEntry('c');
      check.setCacheEntry('d');
      expect(check.hasSimilarEntries('b')).to.be.true;
    });
    it('should be false', () => {
      const check = new SimilarityCacheEntry(0);
      check.setCacheEntry(
        'The index is known by several other names, especially Sørensen–Dice index,[3] Sørensen index and Dice\'s coefficient. Other variations include the "similarity coefficient" or "index", such as Dice similarity coefficient (DSC). Common alternate spellings for Sørensen are Sorenson, Soerenson and Sörenson, and all three can also be seen with the –sen ending.'
      );
      check.setCacheEntry(
        'where |X| and |Y| are the cardinalities of the two sets (i.e. the number of elements in each set). The Sørensen index equals twice the number of elements common to both sets divided by the sum of the number of elements in each set.'
      );
    });
  });
});
