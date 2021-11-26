const testData = require('./testData.json');
const expect = require('chai').expect;
const fs = require('fs');

const mutator = require('../../lib/services/queryStringMutator.js');
const queryString = require('query-string');

/**
 * Test test might look a bit weird at first, but listen stranger...
 * It's not wise to compare 2 urls, as this means all url params must be in the expected order. This is however not
 * guaranteed, as params (and their order) are totally variable.
 */
describe('queryStringMutator', () => {
  it('should fix all urls', () => {
    let _provider = fs.readdirSync('./lib/provider/').map((integPath) => require(`../../lib/provider/${integPath}`));

    for (let test of testData) {
      const provider = _provider.find((p) => p.metaInformation.id === test.id);
      if (provider == null) {
        throw new Error(`Cannot find provider for given id: ${test.id}`);
      }

      const fixedUrl = mutator(test.url, provider.config.sortByDateParam);
      const expectedParams = queryString.parseUrl(test.shouldBecome);
      const actualParams = queryString.parseUrl(fixedUrl);

      //check if all new params are existing
      expect(Object.keys(expectedParams.query)).to.include.members(Object.keys(actualParams.query));
      expect(Object.values(expectedParams.query)).to.include.members(Object.values(actualParams.query));
    }
  });
});
