import utils from '../../lib/utils.js';
import assert from 'assert';
import chai from 'chai';
const expect = chai.expect;
const fakeWorkingHoursConfig = (from, to) => ({
  workingHours: {
    to,
    from,
  },
});
describe('utils', () => {
  describe('#isOneOf()', () => {
    it('should be false', () => {
      assert.equal(utils.isOneOf('bla', ['blub']), false);
    });
    it('should be true', () => {
      assert.equal(utils.isOneOf('bla blub blubber', ['bla']), true);
    });
  });
  describe('#duringWorkingHoursOrNotSet()', () => {
    it('should be false', () => {
      expect(utils.duringWorkingHoursOrNotSet(fakeWorkingHoursConfig('12:00', '13:00'), 0)).to.be.false;
    });
    it('should be true', () => {
      expect(utils.duringWorkingHoursOrNotSet(fakeWorkingHoursConfig('10:00', '16:00'), 1622026740000)).to.be.true;
    });
    it('should be true if nothing set', () => {
      expect(utils.duringWorkingHoursOrNotSet(fakeWorkingHoursConfig(null, null), 1622026740000)).to.be.true;
    });
    it('should be true if only to is set', () => {
      expect(utils.duringWorkingHoursOrNotSet(fakeWorkingHoursConfig(null, '13:00'), 1622026740000)).to.be.true;
    });
    it('should be true if only from is set', () => {
      expect(utils.duringWorkingHoursOrNotSet(fakeWorkingHoursConfig('12:00', null), 1622026740000)).to.be.true;
    });
  });
});
