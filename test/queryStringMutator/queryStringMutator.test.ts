import fs from 'fs';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'chai... Remove this comment to see the full error message
import { expect } from 'chai';
import { readFile } from 'fs/promises';
import mutator from '../../lib/services/queryStringMutator.js';
import queryString from 'query-string';

// @ts-expect-error TS(1378): Top-level 'await' expressions are only allowed whe... Remove this comment to see the full error message
const data = await readFile(new URL('./testData.json', import.meta.url));

// @ts-expect-error TS(2345): Argument of type 'Buffer' is not assignable to par... Remove this comment to see the full error message
const testData = JSON.parse(data);

// @ts-expect-error TS(1378): Top-level 'await' expressions are only allowed whe... Remove this comment to see the full error message
let _provider = await Promise.all(
  fs.readdirSync('./lib/provider/').map(async (integPath) => await import(`../../lib/provider/${integPath}`)),
);

/**
 * Test test might look a bit weird at first, but listen stranger...
 * It's not wise to compare 2 urls, as this means all url params must be in the expected order. This is however not
 * guaranteed, as params (and their order) are totally variable.
 */
// @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
describe('queryStringMutator', () => {
  // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
  it('should fix all urls', () => {
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
