const utils = require('../lib/utils');
const assert = require('assert');

describe('utils', () => {
  describe('#isOneOf()', () => {
    it('should be false', () => {
      assert.equal(utils.isOneOf('bla', ['blub']), false);
    });
    it('should be true', () => {
      assert.equal(utils.isOneOf('bla blub blubber', ['bla']), true);
    });
  });
});
