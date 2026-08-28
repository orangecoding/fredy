/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/** Oldest year that still reads as a Baujahr rather than a stray four-digit number. */
const MIN_BUILD_YEAR = 1000;

/** How far into the future a stated Baujahr may lie - new builds advertise their completion year. */
const FUTURE_BUILD_YEARS = 5;

/** The classes the German energy certificate defines, best first. */
const ENERGY_CLASSES = ['A+', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

/**
 * The classes as a regex alternation, built from {@link ENERGY_CLASSES} so the alphabet is stated
 * once. Best first, so `A+` wins over the `A` that follows it. The best class is spelled `A+`,
 * `A +` and `a+` depending on who is asked, hence the optional space.
 */
const ENERGY_CLASS = ENERGY_CLASSES.map((energyClass) => energyClass.replace('+', '\\s?\\+')).join('|');

/**
 * The letter has to stand on its own, or the "H" of the next word answers for a listing that never
 * stated a class - while still allowing the `+` of the best class. `KfW 40`, which follows the
 * label on new builds, falls out with it.
 * @type {RegExp}
 */
const ENERGY_CLASS_ONLY = new RegExp(`\\b(${ENERGY_CLASS})(?![\\w+])`, 'i');

/**
 * The same class, but only where a label introduces it - which is what makes it safe to look for
 * in free text, where a bare "C" is just a letter.
 * @type {RegExp}
 */
const ENERGY_CLASS_LABEL = new RegExp(
  `\\b(?:Energieeffizienzklasse|Energieeffizienz|Effizienzklasse|Energieklasse|Energieausweisklasse)` +
    `\\b[^A-Za-z\\n]{0,12}(${ENERGY_CLASS})(?![\\w+])`,
  'i',
);

/**
 * `Baujahr laut Energieausweis` is the year the certificate was issued for, which on a modernised
 * building is not the year it was built - and on immoscout it sits right next to the real one.
 *
 * The gap before the year is any run of non-digits, which is what swallows the `ca.` of
 * `Baujahr ca. 1950` without needing to name it.
 * @type {RegExp}
 */
const BUILD_YEAR_LABEL = /\bBaujahr\b(?!\s*[(:]?\s*(?:laut|lt\.?|gem(?:äß|\.)|nach)\b)[^\d\n]{0,20}(\d{4})/i;

/** @type {RegExp} */
const FOUR_DIGITS = /\d{4}/;

/**
 * Turn what a portal offers as a Baujahr - `'1950'`, `'ca. 1950'`, `1950` - into a year.
 *
 * @param {string|number|null|undefined} value
 * @param {number} [now] Current timestamp, injectable for tests.
 * @returns {number|null} Null when the input states no plausible year.
 */
export function normalizeBuildYear(value, now = Date.now()) {
  if (value == null) return null;
  const year =
    typeof value === 'number' ? Math.trunc(value) : Number.parseInt(String(value).match(FOUR_DIGITS)?.[0], 10);
  if (!Number.isInteger(year)) return null;

  const latest = new Date(now).getFullYear() + FUTURE_BUILD_YEARS;
  return year >= MIN_BUILD_YEAR && year <= latest ? year : null;
}

/**
 * Turn what a portal offers as an energy efficiency class into one of {@link ENERGY_CLASSES}.
 *
 * @param {string|null|undefined} value
 * @returns {string|null} Null when the input names no class.
 */
export function normalizeEnergyClass(value) {
  if (value == null) return null;
  const match = ENERGY_CLASS_ONLY.exec(String(value).trim());
  if (match == null) return null;

  // The pattern is built from ENERGY_CLASSES, so whatever it matched is one of them once the
  // optional space is gone.
  return match[1].replace(/\s+/g, '').toUpperCase();
}

/**
 * Read both facts out of free text.
 *
 * @param {string|null|undefined} text
 * @returns {{buildYear: number|null, energyClass: string|null}}
 */
export function extractBuildingFacts(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return { buildYear: null, energyClass: null };
  }

  return {
    buildYear: normalizeBuildYear(BUILD_YEAR_LABEL.exec(text)?.[1]),
    energyClass: normalizeEnergyClass(ENERGY_CLASS_LABEL.exec(text)?.[1]),
  };
}
