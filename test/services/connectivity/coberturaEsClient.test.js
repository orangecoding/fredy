/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';

import { newestEdition } from '../../../lib/services/connectivity/client/coberturaEsClient.js';

/**
 * Finding the current edition of a Spanish coverage map.
 *
 * Each map carries its vintage in its own name and the four do not move in step - the 5G map was
 * already on 2025 while the rest were still on 2024 - so a hard-coded name breaks one map at a
 * time, silently, on a date nobody is watching for. The old editions stay published alongside the
 * new ones, which is why picking the right one is a decision rather than a lookup.
 */
describe('services/connectivity/coberturaEsClient', () => {
  const names = [
    'CobBAFija_2022_vista',
    'CobBAFija_2024_vista',
    'CobBAFija_2023_vista',
    'CobFWA_2024_Vista',
    'InfoCob4G_2024',
    'InfoCob5G_2025',
    'Datos_Operadores_BA',
  ];

  it('picks the newest edition of a map with several published', () => {
    expect(newestEdition(names, /^CobBAFija_(\d{4})/i)).toBe('CobBAFija_2024_vista');
  });

  it('picks an edition published after this was written', () => {
    expect(newestEdition([...names, 'CobBAFija_2027_vista'], /^CobBAFija_(\d{4})/i)).toBe('CobBAFija_2027_vista');
  });

  it('keeps the maps apart although their names start alike', () => {
    // `InfoCob4G_` and `InfoCob5G_` differ by one character, and matching the wrong one would put
    // 5G coverage on the 4G row without anything looking broken.
    expect(newestEdition(names, /^InfoCob4G_(\d{4})/i)).toBe('InfoCob4G_2024');
    expect(newestEdition(names, /^InfoCob5G_(\d{4})/i)).toBe('InfoCob5G_2025');
  });

  it('is not fooled by a year in the middle of another name', () => {
    expect(newestEdition(['Zonas_CobBAFija_2099', 'CobBAFija_2024_vista'], /^CobBAFija_(\d{4})/i)).toBe(
      'CobBAFija_2024_vista',
    );
  });

  it('says so when the map is gone rather than guessing', () => {
    // The caller falls back to the built-in default on null, which is the difference between an
    // answer that is a year old and no answer for the country at all.
    expect(newestEdition(names, /^CobSatelite_(\d{4})/i)).toBeNull();
    expect(newestEdition([], /^CobBAFija_(\d{4})/i)).toBeNull();
  });
});
