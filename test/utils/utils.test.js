/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { expect } from 'chai';
import { buildHash } from '../../lib/utils.js';

describe('utilsCheck', () => {
  describe('#utilsCheck()', () => {
    it('should be null when null input', () => {
      expect(buildHash(null)).to.be.null;
    });
    it('should be null when null empty', () => {
      expect(buildHash('')).to.be.null;
    });
    it('should return a value', () => {
      expect(buildHash('bla', '', null)).to.be.a.string;
    });
  });
});
