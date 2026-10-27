/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';

import { getProviders } from '../../../lib/utils.js';

/**
 * Which portals the "add listing" dialog can read single adverts from.
 *
 * Pinned, so a provider losing its `fetchListingByUrl` fails here rather than turning the dialog's
 * answer into a quiet "not supported yet", and one gaining it is a decision somebody made.
 *
 * Left out on purpose: immoscoutAt (its exposé ids are not the mobile API's), idealista (no recorded
 * exposé and no price tracking, so a wrong hash could not be healed by link), inberlinwohnen (its
 * adverts live on the housing companies' own hosts), and every portal without a detail fetch.
 */
const SUPPORTED = [
  'betterhomes',
  'deutscheWohnen',
  'engelVoelkers',
  'imaxx',
  'immobilienDe',
  'immoscout',
  'immowelt',
  'kleinanzeigen',
  'schwarzesbrett',
  'seloger',
  'sparkasse',
  'tecnocasa',
  'tecnorete',
  'wgGesucht',
];

describe('fetchListingByUrl roster', () => {
  it('is offered by exactly the providers that can read a single advert', async () => {
    const providers = await getProviders();
    const offering = providers
      .filter((module) => typeof module.config?.fetchListingByUrl === 'function')
      .map((module) => module.metaInformation.id)
      .sort();

    expect(offering).toEqual(SUPPORTED);
  });
});
