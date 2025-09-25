import { isOneOf, duringWorkingHoursOrNotSet } from '../../lib/utils.js';
import assert from 'assert';
import { expect } from 'chai';

const fakeWorkingHoursConfig = (from, to) => ({
  workingHours: {
    to,
    from,
  },
});
describe('utils', () => {
  describe('#isOneOf()', () => {
    it('should be false', () => {
      assert.equal(isOneOf('bla', ['blub']), false);
    });
    it('should be true', () => {
      assert.equal(isOneOf('bla blub blubber', ['bla']), true);
    });
  });
  describe('#duringWorkingHoursOrNotSet()', () => {
    it('should be false', () => {
      expect(duringWorkingHoursOrNotSet(fakeWorkingHoursConfig('12:00', '13:00'), 0)).to.be.false;
    });
    it('should be true', () => {
      expect(duringWorkingHoursOrNotSet(fakeWorkingHoursConfig('10:00', '16:00'), 1622026740000)).to.be.true;
    });
    it('should be true if nothing set', () => {
      expect(duringWorkingHoursOrNotSet(fakeWorkingHoursConfig(null, null), 1622026740000)).to.be.true;
    });
    it('should be true if only to is set', () => {
      expect(duringWorkingHoursOrNotSet(fakeWorkingHoursConfig(null, '13:00'), 1622026740000)).to.be.true;
    });
    it('should be true if only from is set', () => {
      expect(duringWorkingHoursOrNotSet(fakeWorkingHoursConfig('12:00', null), 1622026740000)).to.be.true;
    });
  });
});
