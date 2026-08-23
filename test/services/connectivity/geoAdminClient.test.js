/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';

import { parseFeatureInfo } from '../../../lib/services/connectivity/client/geoAdminClient.js';

/**
 * Reading the Swiss map service's plain-text answer.
 *
 * Plain text rather than GeoJSON because the service refuses to write GeoJSON for more than one
 * layer at a time, and asking for nine layers separately would be nine requests per listing. The
 * parser is the price of that, so it is worth a test.
 */
describe('services/connectivity/geoAdminClient', () => {
  const answer = `GetFeatureInfo results:

Layer 'ch.bakom.anschlussart-glasfaser'
  Feature 0: 
    ch.bakom.anschlussart-glasfaser.value_0.name = '4'

Layer 'ch.bakom.downlink1000'
  Feature 0: 
    ch.bakom.downlink1000.value_0.name = '3'

Layer 'ch.bakom.mobilnetz-5g'
  Feature 0: 
    ch.bakom.mobilnetz-5g.value_0.name = '2'
`;

  it('reads a class number per layer', () => {
    expect(parseFeatureInfo(answer)).toEqual({
      'ch.bakom.anschlussart-glasfaser': 4,
      'ch.bakom.downlink1000': 3,
      'ch.bakom.mobilnetz-5g': 2,
    });
  });

  it('leaves out a layer that had nothing to say', () => {
    // The service omits a layer entirely where it has no data, which is the difference between
    // "no coverage" and "nothing known here" and must not become a zero.
    const bands = parseFeatureInfo(answer);

    expect('ch.bakom.downlink10' in bands).toBe(false);
  });

  it('reads an empty result rather than inventing one', () => {
    expect(parseFeatureInfo('GetFeatureInfo results:\n\n')).toEqual({});
  });

  it('keeps its hands off a service exception', () => {
    // The service reports its own errors with a 200 and an XML body. Nothing in it looks like a
    // value line, so the parser must come back empty rather than half-reading it.
    expect(parseFeatureInfo('<ServiceExceptionReport><ServiceException>boom</ServiceException>')).toEqual({});
  });
});
