/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The flag for an ISO 3166-1 alpha-2 country code.
 *
 * Computed rather than looked up in a table. A flag emoji is just its two letters written as
 * regional indicator symbols, so every valid code already has one and a country new to Fredy needs
 * no entry adding here. A lookup table would be a second list of countries to keep in step with
 * `countryBounds.js` and with whatever the providers declare.
 *
 * Note for Windows: Chrome and Firefox on Windows ship no flag glyphs, so these render as the two
 * letters instead ("DE"). That is a readable answer to "which country is this provider", which is
 * the whole reason the flag is there, so it is left as is rather than swapped for image assets.
 */

/** Where the regional indicator block starts: U+1F1E6 is the letter A. */
const REGIONAL_INDICATOR_A = 0x1f1e6;
const LETTER_A = 'A'.charCodeAt(0);

/**
 * @param {string} code - ISO 3166-1 alpha-2, either case.
 * @returns {string} The flag, or an empty string when the code is not two letters.
 */
export function flagFor(code) {
  const letters = String(code ?? '')
    .trim()
    .toUpperCase();

  if (!/^[A-Z]{2}$/.test(letters)) {
    return '';
  }

  return String.fromCodePoint(...[...letters].map((letter) => REGIONAL_INDICATOR_A + letter.charCodeAt(0) - LETTER_A));
}

/**
 * The flags for every country a provider serves, in the order it declared them.
 *
 * Nearly every provider names one country and gets one flag. The few that span several get all of
 * them, which is the honest answer: a portal covering Germany and Austria is not a German portal.
 *
 * @param {string[]} [countries] - Alpha-2 codes.
 * @returns {string} The flags, unseparated, or an empty string when there are none to show.
 */
export function flagsFor(countries) {
  if (!Array.isArray(countries)) {
    return '';
  }
  return countries.map(flagFor).filter(Boolean).join('');
}

/**
 * A provider's name with its flags in front, for a picker where several countries are on offer.
 *
 * @param {{name: string, countries?: string[]}} provider
 * @returns {string}
 */
export function labelWithFlags(provider) {
  const flags = flagsFor(provider?.countries);
  const name = provider?.name ?? '';
  return flags ? `${flags} ${name}` : name;
}
