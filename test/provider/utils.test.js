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
    it('should handle working hours that cross midnight (e.g., 05:00 → 00:30)', () => {
      const cfg = fakeWorkingHoursConfig('05:00', '00:30');
      const mkTs = (h, m = 0) => {
        const d = new Date();
        d.setHours(h);
        d.setMinutes(m);
        d.setSeconds(0);
        d.setMilliseconds(0);
        return d.getTime();
      };
      expect(duringWorkingHoursOrNotSet(cfg, mkTs(23, 0))).to.be.true; // 23:00 => within window
      expect(duringWorkingHoursOrNotSet(cfg, mkTs(1, 0))).to.be.false; // 01:00 => outside window
      expect(duringWorkingHoursOrNotSet(cfg, mkTs(6, 0))).to.be.true; // 06:00 => within window
    });
  });
});
