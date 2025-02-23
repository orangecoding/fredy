import utils from '../../lib/utils.js';
import assert from 'assert';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'chai... Remove this comment to see the full error message
import { expect } from 'chai';

// @ts-expect-error TS(7006): Parameter 'from' implicitly has an 'any' type.
const fakeWorkingHoursConfig = (from, to) => ({
  workingHours: {
    to,
    from,
  }
});
// @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
describe('utils', () => {
  // @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
  describe('#isOneOf()', () => {
    // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
    it('should be false', () => {
      assert.equal(utils.isOneOf('bla', ['blub']), false);
    });
    // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
    it('should be true', () => {
      assert.equal(utils.isOneOf('bla blub blubber', ['bla']), true);
    });
  });
  // @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
  describe('#duringWorkingHoursOrNotSet()', () => {
    // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
    it('should be false', () => {
      expect(utils.duringWorkingHoursOrNotSet(fakeWorkingHoursConfig('12:00', '13:00'), 0)).to.be.false;
    });
    // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
    it('should be true', () => {
      expect(utils.duringWorkingHoursOrNotSet(fakeWorkingHoursConfig('10:00', '16:00'), 1622026740000)).to.be.true;
    });
    // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
    it('should be true if nothing set', () => {
      expect(utils.duringWorkingHoursOrNotSet(fakeWorkingHoursConfig(null, null), 1622026740000)).to.be.true;
    });
    // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
    it('should be true if only to is set', () => {
      expect(utils.duringWorkingHoursOrNotSet(fakeWorkingHoursConfig(null, '13:00'), 1622026740000)).to.be.true;
    });
    // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
    it('should be true if only from is set', () => {
      expect(utils.duringWorkingHoursOrNotSet(fakeWorkingHoursConfig('12:00', null), 1622026740000)).to.be.true;
    });
  });
});
