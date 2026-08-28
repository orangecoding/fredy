/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';

import { extractBuildingFacts, normalizeBuildYear, normalizeEnergyClass } from '../../lib/utils/buildingFacts.js';

/**
 * The two facts a portal states about the building rather than the flat. Both are read out of
 * whatever the provider offers - a structured field, a label picture, or the running ad text -
 * so the failure mode that matters is a plausible-looking wrong answer, not a missing one.
 */
describe('normalizeBuildYear', () => {
  it('reads the year out of whatever a portal states it as', () => {
    expect(normalizeBuildYear('1950')).toBe(1950);
    expect(normalizeBuildYear(1950)).toBe(1950);
    expect(normalizeBuildYear('ca. 1950')).toBe(1950);
  });

  it('refuses four-digit numbers that cannot be a Baujahr', () => {
    expect(normalizeBuildYear('999')).toBeNull();
    expect(normalizeBuildYear('12345')).toBe(1234);
    expect(normalizeBuildYear(null)).toBeNull();
    expect(normalizeBuildYear('keine Angabe')).toBeNull();
  });

  it('accepts the completion year a new build advertises, but not an arbitrary future one', () => {
    const now = new Date('2026-08-28').getTime();

    expect(normalizeBuildYear('2029', now)).toBe(2029);
    expect(normalizeBuildYear('2099', now)).toBeNull();
  });
});

describe('normalizeEnergyClass', () => {
  it('normalizes the spellings the portals use for the best class', () => {
    expect(normalizeEnergyClass('A+')).toBe('A+');
    expect(normalizeEnergyClass('A +')).toBe('A+');
    expect(normalizeEnergyClass('a+')).toBe('A+');
  });

  it('reads a class out of a label', () => {
    expect(normalizeEnergyClass('Klasse C')).toBe('C');
  });

  it('reads the class off a label picture, extension and all', () => {
    expect(normalizeEnergyClass('C.png')).toBe('C');
  });

  it('refuses letters the energy certificate does not define', () => {
    expect(normalizeEnergyClass('I')).toBeNull();
    expect(normalizeEnergyClass('KfW')).toBeNull();
    expect(normalizeEnergyClass(null)).toBeNull();
  });
});

describe('extractBuildingFacts', () => {
  it('reads both facts out of an attribute list rendered into lines', () => {
    const text = 'Objektzustand: gepflegt\nBaujahr: 1993\nEnergieeffizienzklasse: E\nHeizung: Gas';

    expect(extractBuildingFacts(text)).toEqual({ buildYear: 1993, energyClass: 'E' });
  });

  it('reads the year through the hedge a listing puts in front of it', () => {
    expect(extractBuildingFacts('Baujahr ca. 1950').buildYear).toBe(1950);
  });

  it('ignores the certificate year, which on a modernised building is not the Baujahr', () => {
    expect(extractBuildingFacts('Baujahr laut Energieausweis: 2025').buildYear).toBeNull();
    expect(extractBuildingFacts('Baujahr (lt. Energieausweis): 2025').buildYear).toBeNull();
    // The real label still wins when both are stated, as on an immoscout exposé.
    expect(extractBuildingFacts('Baujahr: 1950\nBaujahr laut Energieausweis: 2025').buildYear).toBe(1950);
  });

  it('does not mistake a KfW standard for an energy class', () => {
    const text = 'Die Energieeffizienzklasse KfW 40 wird mit dem Siegel QNG erreicht.';

    expect(extractBuildingFacts(text).energyClass).toBeNull();
  });

  it('states nothing when the text states nothing', () => {
    expect(extractBuildingFacts('Schöne Wohnung in ruhiger Lage')).toEqual({ buildYear: null, energyClass: null });
    expect(extractBuildingFacts(null)).toEqual({ buildYear: null, energyClass: null });
  });
});
