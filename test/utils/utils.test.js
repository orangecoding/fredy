/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { expect } from 'vitest';
import { buildHash } from '../../lib/utils.js';

describe('utilsCheck', () => {
  describe('#utilsCheck()', () => {
    it('should be null when null input', () => {
      expect(buildHash(null)).toBeNull();
    });
    it('should be null when null empty', () => {
      expect(buildHash('')).toBeNull();
    });
    it('should return a value', () => {
      expect(buildHash('bla', '', null)).toBeTypeOf('string');
    });
  });
});
