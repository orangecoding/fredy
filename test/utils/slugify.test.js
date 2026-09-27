/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it } from 'vitest';
import { slugify } from '../../lib/utils/slugify.js';

describe('#slugify', () => {
  it('drops accents and turns everything else into single dashes', () => {
    expect(slugify('Île-de-France')).toBe('ile-de-france');
    expect(slugify("L'Haÿ-les-Roses")).toBe('l-hay-les-roses');
    expect(slugify("Reggio nell'Emilia")).toBe('reggio-nell-emilia');
    expect(slugify('Paris 11e')).toBe('paris-11e');
  });

  // NFD splits an accent off its letter, but a ligature is one letter of its own and survives it.
  // Dropped as "not a letter", Vandœuvre-lès-Nancy became `vand-uvre-les-nancy`, which no portal
  // writes - Bien'ici spells it `vandoeuvre-les-nancy` and refused every search there as unknown.
  it('spells the ligatures out the way the portals do', () => {
    expect(slugify('Vandœuvre-lès-Nancy')).toBe('vandoeuvre-les-nancy');
    expect(slugify('Plœmeur')).toBe('ploemeur');
    expect(slugify('ŒTING')).toBe('oeting');
    expect(slugify('Lætitia')).toBe('laetitia');
    expect(slugify('Æbeltoft')).toBe('aebeltoft');
  });

  it('answers the empty string for nothing to slug', () => {
    expect(slugify(null)).toBe('');
    expect(slugify(' - ')).toBe('');
  });
});
