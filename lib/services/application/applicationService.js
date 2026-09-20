/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { getUserSettings } from '../storage/settingsStorage.js';
import { getCountriesForListing } from '../providers/providerCountries.js';
import { getProviders } from '../../utils.js';
import { parseAgentFromDescription } from './contact.js';
import { pickLetterLanguage } from './language.js';
import { OPTIONAL_PLACEHOLDERS, resolvePlaceholderValues } from './placeholders.js';
import { renderTemplate } from './renderTemplate.js';
import { TEMPLATE_LANGUAGES, defaultTemplate } from './templates/index.js';

/**
 * Turns one listing into a letter the user can send.
 *
 * The impure half of the feature: everything that reaches for stored settings or for the provider
 * registry happens here, and the modules it calls are pure so the settings page can import them
 * into the browser bundle without dragging SQLite behind them.
 *
 * Both callers - the HTTP route behind the copy dialog and the `get_application_letter` MCP tool -
 * come through this function, which is the only reason the letter a user copies and the letter an
 * assistant hands them are the same text.
 */

/** The one provider whose descriptions Fredy prefixes with a parseable agent line. */
const AGENT_BEARING_PROVIDER = 'immoscout';

/** Settings key holding the user's applicant profile. */
export const APPLICANT_PROFILE_SETTING = 'applicant_profile';

/** Settings key holding per-language template overrides. */
export const APPLICATION_TEMPLATES_SETTING = 'application_templates';

/**
 * @typedef {Object} ApplicationLetter
 * @property {string} text The finished letter.
 * @property {string} language ISO 639-1 language it was written in.
 * @property {'rent'|'buy'} dealType Which of the two letters was used.
 * @property {string[]} missing Profile fields the template wanted and the user has not filled in.
 * @property {string[]} unknown Placeholders in a user template that the catalog does not know.
 * @property {boolean} hasProfile Whether the user has an applicant profile at all.
 * @property {import('./contact.js').ListingContact|null} contact Agent the letter addresses.
 * @property {string} providerName Readable portal name, so callers can say why this language.
 */

/**
 * Human-readable portal name for a provider id.
 *
 * @param {string|null|undefined} providerId
 * @returns {Promise<string|null>}
 */
async function providerNameFor(providerId) {
  if (typeof providerId !== 'string' || providerId.length === 0) return null;
  const providers = await getProviders();
  const match = (providers ?? []).find((provider) => provider?.metaInformation?.id === providerId);
  return match?.metaInformation?.name ?? null;
}

/**
 * Whether a stored profile holds anything at all.
 *
 * An explicit `false` counts: answering "no" to the smoking question is filling the profile in, and
 * the dialog should not greet that user with "you have no profile yet".
 *
 * @param {Object|null|undefined} profile
 * @returns {boolean}
 */
function hasAnyValue(profile) {
  if (profile == null || typeof profile !== 'object') return false;
  return Object.values(profile).some((value) => value != null && String(value).trim().length > 0);
}

/**
 * The user's own template for this language and deal type, when they wrote one.
 *
 * Overrides are stored per language and per deal type, so rewriting the German rental letter leaves
 * the German purchase letter on the shipped default rather than blanking it.
 *
 * @param {Record<string, any>|undefined} overrides
 * @param {string} language
 * @param {'rent'|'buy'} dealType
 * @returns {string|null}
 */
function overrideTemplate(overrides, language, dealType) {
  const candidate = overrides?.[language]?.[dealType];
  return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate : null;
}

/**
 * Write the application letter for one listing.
 *
 * The caller must already have established that this user may see the listing; this function does
 * no access checking of its own.
 *
 * @param {Object} listing A listing row as `getListingById` returns it.
 * @param {string} userId Owner of the profile the letter is written from.
 * @param {Object} [options]
 * @param {string|null} [options.language] Force a language instead of deriving it from the portal.
 * @param {Date} [options.now] Injectable clock.
 * @returns {Promise<ApplicationLetter>}
 */
export async function buildApplicationLetter(listing, userId, { language = null, now = new Date() } = {}) {
  const settings = getUserSettings(userId) ?? {};
  const profile = settings[APPLICANT_PROFILE_SETTING] ?? null;

  const countries = await getCountriesForListing(listing?.provider, listing);
  const letterLanguage = pickLetterLanguage({
    countries,
    uiLanguage: settings.language,
    available: TEMPLATE_LANGUAGES,
    override: language,
  });

  const dealType = listing?.dealType === 'buy' ? 'buy' : 'rent';
  const template =
    overrideTemplate(settings[APPLICATION_TEMPLATES_SETTING], letterLanguage, dealType) ??
    defaultTemplate(letterLanguage, dealType);

  // Only ImmoScout: the `Agent:` line is a format Fredy itself prepends there, which is what makes
  // parsing it safe. Run against any description, it hands whoever wrote the advert authorship of
  // the letter's salutation.
  const contact = listing?.provider === AGENT_BEARING_PROVIDER ? parseAgentFromDescription(listing.description) : null;
  // Falls back to the raw id: a portal Fredy no longer ships still has listings in the database,
  // and "immoscout" reads better in the dialog than a blank.
  const providerName = (await providerNameFor(listing?.provider)) ?? listing?.provider ?? '';
  const values = resolvePlaceholderValues({
    listing,
    profile,
    contact,
    language: letterLanguage,
    providerName,
    now,
  });

  const rendered = renderTemplate(template, values);

  return {
    text: rendered.text,
    language: letterLanguage,
    dealType,
    // Optional notes and unanswered yes/no questions are not gaps in a profile; see
    // OPTIONAL_PLACEHOLDERS for why reporting them makes the real gaps harder to see.
    missing: rendered.missing.filter((key) => !OPTIONAL_PLACEHOLDERS.has(key)),
    unknown: rendered.unknown,
    hasProfile: hasAnyValue(profile),
    contact,
    providerName,
  };
}
