/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Which language an application letter is written in, given where the portal operates.
 *
 * This is the pure half of the decision. Resolving a listing's countries touches the provider
 * registry and belongs in `lib/services/providers/providerCountries.js`; everything here is a
 * lookup, so the settings UI can import it to preview a template without dragging storage in.
 */

/** Fallback for every country Fredy ships no letter for. Any European agent reads English. */
export const FALLBACK_LANGUAGE = 'en';

/**
 * Country of the portal to the language its agents expect to be written to.
 *
 * Switzerland maps to German because the only Swiss provider, Flatfox, pins `Accept-Language:
 * de-CH` and serves its listings accordingly - a French or Italian Swiss letter would be guessing.
 * Spain and Portugal are deliberately absent: Idealista reaches both, but shipping application
 * letters in languages nobody here can proofread is worse than shipping a correct English one.
 */
const COUNTRY_LANGUAGE = {
  de: 'de',
  at: 'de',
  ch: 'de',
  it: 'it',
};

/**
 * @param {string|null|undefined} country ISO 3166-1 alpha-2 country code.
 * @returns {string} ISO 639-1 language code; never empty.
 */
export function countryToLanguage(country) {
  return knownLanguageForCountry(country) ?? FALLBACK_LANGUAGE;
}

/**
 * The language a country actually maps to, or null when Fredy ships no letter for it.
 *
 * Separate from {@link countryToLanguage} because the fallback has to stay distinguishable from a
 * real hit: `countryToLanguage('es')` is English, but that is Fredy giving up, not Spain speaking
 * English, and the chain below must be free to try the user's own language before settling for it.
 *
 * @param {string|null|undefined} country
 * @returns {string|null}
 */
function knownLanguageForCountry(country) {
  if (typeof country !== 'string') return null;
  return COUNTRY_LANGUAGE[country.trim().toLowerCase()] ?? null;
}

/**
 * Decide which language a letter for one listing is written in.
 *
 * Order: an explicit override, then the portal's country, then the user's interface language, then
 * English. Each step is skipped when no template exists for it, so the chain can never end on a
 * language Fredy cannot actually write - an empty letter would be worse than a foreign one.
 *
 * @param {Object} params
 * @param {string[]|null|undefined} params.countries Countries the listing's provider serves, as
 *   resolved by `getCountriesForListing`. The order is not meaningful - a narrowed listing yields
 *   one entry, and an un-narrowed provider yields its whole declaration, sorted.
 * @param {string|null|undefined} params.uiLanguage The user's interface language.
 * @param {string[]} params.available Languages templates exist for.
 * @param {string|null} [params.override] Language the caller explicitly asked for.
 * @returns {string} ISO 639-1 language code that is guaranteed to be in `available`.
 */
export function pickLetterLanguage({ countries, uiLanguage, available, override = null }) {
  const has = (language) => typeof language === 'string' && available.includes(language);

  if (has(override)) return override;

  // Every declared country is tried, not only the first. `getCountriesForListing` returns the
  // provider's declaration sorted whenever `countryOf` cannot narrow it, so Idealista arrives as
  // ['es','it','pt'] and Italian - the one of the three Fredy writes - would never win a
  // first-element test.
  const declared = Array.isArray(countries) ? countries : [];
  for (const country of declared) {
    const fromCountry = knownLanguageForCountry(country);
    if (has(fromCountry)) return fromCountry;
  }

  // The portal's country is known, Fredy just writes no letter for it. English then beats the
  // interface language, because the interface language is the writer's and the letter is read by
  // somebody else: a Madrid agent reading German is worse than a Madrid agent reading English.
  if (declared.length > 0 && has(FALLBACK_LANGUAGE)) return FALLBACK_LANGUAGE;

  // Nothing is known about where the listing is. The user's own language is the best guess left.
  if (has(uiLanguage)) return uiLanguage;

  return has(FALLBACK_LANGUAGE) ? FALLBACK_LANGUAGE : available[0];
}
