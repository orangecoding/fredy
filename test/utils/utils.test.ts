// @ts-expect-error TS(7016): Could not find a declaration file for module 'chai... Remove this comment to see the full error message
import { expect } from 'chai';
import {buildHash} from '../../lib/utils.js';

// @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
describe('utilsCheck', () => {
  // @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
  describe('#utilsCheck()', () => {
      // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
      it('should be null when null input', () => {
          expect(buildHash(null)).to.be.null;
      });
      // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
      it('should be null when null empty', () => {
          expect(buildHash('')).to.be.null;
      });
      // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
      it('should return a value', () => {
          expect(buildHash('bla', '', null)).to.be.a.string;
      });
  });
});
