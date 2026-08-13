/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { toPolyline } from '../../../lib/services/immoscout/shape.js';
import { describe, expect, it } from 'vitest';

describe('#immoscout shape parameter', () => {
  // A shape drawn by hand on the map arrives as a bare polyline rather than base64. Decoding one of
  // those does not throw, it quietly returns broken UTF-8, and ImmoScout answers 400 "Cannot parse
  // shape", so the polyline has to reach the mobile API byte for byte.
  it('should pass a raw polyline through untouched', () => {
    const polyline =
      '}{jwHy|qh@jCKdCgAvB_BdB}BzAaCjAqCfAqC~@uCt@iCh@eCZkCLyC?_EO}Ea@}Ea@iE_@{D]aDe@gDi@gDo@uCu@kBcB_AeDOiE?iDCgCMuBOkDCkG?yFRgD`@cB\\{A`@eBx@aB|@kAbAy@rAe@bBUxCAhE?dFh@fGlAzGbBbHlBxGdB`FrAhDz@xBh@nAf@l@RNNXkCkMJR~B|EnCpErCnDtClCvC~ApCh@rCJpC?';

    const result = toPolyline(polyline);

    expect(result).toBe(polyline);
    // U+FFFD is what a base64 decode of a polyline leaves behind, and the symptom the API rejects.
    expect(result).not.toContain('�');
  });

  // The base64 flavour uses `.` where base64 would use `=`, because a bare `=` in a query string
  // value is asking for trouble. Both padding lengths have to survive the substitution, so the two
  // polylines below are picked for byte lengths that pad to `..` and to `.` respectively.
  it.each([
    ['..', 'ymrwHidih@`IkS_Aal@oTsVoViClw@g'],
    ['.', 'ymrwHidih@`IkS_Aal@oTsVoViClw@g@'],
  ])('should decode a base64 shape padded with %s', (padding, polyline) => {
    const padded = Buffer.from(polyline, 'utf-8').toString('base64').replace(/=+$/, padding);
    expect(padded.endsWith(padding)).toBe(true);

    expect(toPolyline(padded)).toBe(polyline);
  });

  it('should decode a base64 shape that needs no padding', () => {
    const polyline = 'ymrwHidih@`IkS_Aal@oTsVoViClw@';
    const encoded = Buffer.from(polyline, 'utf-8').toString('base64');
    expect(encoded).not.toContain('=');

    expect(toPolyline(encoded)).toBe(polyline);
  });

  // Base64 that decodes to bytes no polyline could contain is not a shape we can use. Sending the
  // mangled decode would be strictly worse than sending what we were given, so the input wins.
  it('should keep the original value when a base64 decode yields no polyline', () => {
    const shape = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]).toString('base64');

    expect(toPolyline(shape)).toBe(shape);
  });

  // The two alphabets overlap on letters alone, so the characters that appear in only one of them
  // are what decides. A polyline containing any of `?@[\]^_{|}~` can never be read as base64.
  it.each(['?@[\\]^_{|}~', 'ior~H_kxmAr`Pig`@fzH', 'a@b?c~d'])('should treat %s as a polyline', (shape) => {
    expect(toPolyline(shape)).toBe(shape);
  });
});
