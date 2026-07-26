/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { selectProviders } from '../../tools/testFixtures/downloadFixtures.js';

const providerConfig = {
  immowelt: { url: 'https://www.immowelt.de' },
  kleinanzeigen: { url: 'https://www.kleinanzeigen.de' },
  immoscout: { url: 'https://www.immobilienscout24.de' },
};

describe('selectProviders', () => {
  it('returns every provider when no provider was requested', () => {
    expect(selectProviders(providerConfig, [])).toEqual(providerConfig);
  });

  it('returns only the requested provider', () => {
    expect(selectProviders(providerConfig, ['immowelt'])).toEqual({ immowelt: providerConfig.immowelt });
  });

  it('returns multiple requested providers', () => {
    expect(Object.keys(selectProviders(providerConfig, ['immowelt', 'immoscout']))).toEqual(['immowelt', 'immoscout']);
  });

  it('matches provider names case insensitively', () => {
    expect(Object.keys(selectProviders(providerConfig, ['KLEINANZEIGEN']))).toEqual(['kleinanzeigen']);
  });

  it('throws for an unknown provider and lists the available ones', () => {
    expect(() => selectProviders(providerConfig, ['doesNotExist'])).toThrow(/Unknown provider 'doesNotExist'/);
    expect(() => selectProviders(providerConfig, ['doesNotExist'])).toThrow(/immowelt, kleinanzeigen, immoscout/);
  });
});
