/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { phrasesFor } from './phrases.js';

/**
 * Everything an application template may refer to, and how a listing plus a profile turn into it.
 *
 * This catalog is the single source for three consumers - the renderer, the "missing fields" chips
 * in the copy dialog, and the clickable placeholder list in the template editor. Keeping it in one
 * object is what stops the editor from offering a placeholder the renderer cannot fill.
 *
 * `resolvePlaceholderValues` always returns a value for every key here, empty string included.
 * That is a contract the renderer depends on: a key it cannot find is reported as a typo, so a
 * catalogued placeholder must never merely be absent.
 */

/**
 * @typedef {Object} PlaceholderDefinition
 * @property {'listing'|'applicant'|'contact'|'env'} group Which section of the editor lists it.
 * @property {string} labelKey Interface translation key describing the placeholder.
 */

/** @type {Record<string, PlaceholderDefinition>} */
export const PLACEHOLDERS = {
  'listing.title': { group: 'listing', labelKey: 'application.placeholder.listing.title' },
  'listing.address': { group: 'listing', labelKey: 'application.placeholder.listing.address' },
  'listing.price': { group: 'listing', labelKey: 'application.placeholder.listing.price' },
  'listing.size': { group: 'listing', labelKey: 'application.placeholder.listing.size' },
  'listing.rooms': { group: 'listing', labelKey: 'application.placeholder.listing.rooms' },
  'listing.pricePerSqm': { group: 'listing', labelKey: 'application.placeholder.listing.pricePerSqm' },
  'listing.link': { group: 'listing', labelKey: 'application.placeholder.listing.link' },
  'listing.provider': { group: 'listing', labelKey: 'application.placeholder.listing.provider' },
  'listing.publishedAt': { group: 'listing', labelKey: 'application.placeholder.listing.publishedAt' },

  'applicant.fullName': { group: 'applicant', labelKey: 'application.placeholder.applicant.fullName' },
  'applicant.firstName': { group: 'applicant', labelKey: 'application.placeholder.applicant.firstName' },
  'applicant.lastName': { group: 'applicant', labelKey: 'application.placeholder.applicant.lastName' },
  'applicant.address': { group: 'applicant', labelKey: 'application.placeholder.applicant.address' },
  'applicant.street': { group: 'applicant', labelKey: 'application.placeholder.applicant.street' },
  'applicant.zip': { group: 'applicant', labelKey: 'application.placeholder.applicant.zip' },
  'applicant.city': { group: 'applicant', labelKey: 'application.placeholder.applicant.city' },
  'applicant.phone': { group: 'applicant', labelKey: 'application.placeholder.applicant.phone' },
  'applicant.email': { group: 'applicant', labelKey: 'application.placeholder.applicant.email' },
  'applicant.household': { group: 'applicant', labelKey: 'application.placeholder.applicant.household' },
  'applicant.pets': { group: 'applicant', labelKey: 'application.placeholder.applicant.pets' },
  'applicant.smoker': { group: 'applicant', labelKey: 'application.placeholder.applicant.smoker' },
  'applicant.occupation': { group: 'applicant', labelKey: 'application.placeholder.applicant.occupation' },
  'applicant.employer': { group: 'applicant', labelKey: 'application.placeholder.applicant.employer' },
  'applicant.employmentType': { group: 'applicant', labelKey: 'application.placeholder.applicant.employmentType' },
  'applicant.netIncome': { group: 'applicant', labelKey: 'application.placeholder.applicant.netIncome' },
  'applicant.moveInDate': { group: 'applicant', labelKey: 'application.placeholder.applicant.moveInDate' },
  'applicant.schufa': { group: 'applicant', labelKey: 'application.placeholder.applicant.schufa' },
  'applicant.wbs': { group: 'applicant', labelKey: 'application.placeholder.applicant.wbs' },
  'applicant.guarantor': { group: 'applicant', labelKey: 'application.placeholder.applicant.guarantor' },
  'applicant.extra': { group: 'applicant', labelKey: 'application.placeholder.applicant.extra' },

  'contact.name': { group: 'contact', labelKey: 'application.placeholder.contact.name' },
  'contact.company': { group: 'contact', labelKey: 'application.placeholder.contact.company' },
  'contact.salutation': { group: 'contact', labelKey: 'application.placeholder.contact.salutation' },

  today: { group: 'env', labelKey: 'application.placeholder.today' },
};

/**
 * Placeholders that are never reported as a gap in the profile.
 *
 * The "still missing" chips exist to nudge somebody towards the facts that always strengthen a
 * letter - a phone number, an occupation, an income. An optional note and an unanswered yes/no
 * question are not gaps: a user with no pets, or who would rather not state a guarantor, has a
 * complete profile. Listing all four flags for every fresh profile would drown the real gaps, and
 * being told to fill in something you deliberately left blank is worse than being told nothing.
 *
 * @type {Set<string>}
 */
export const OPTIONAL_PLACEHOLDERS = new Set([
  'applicant.pets',
  'applicant.extra',
  'applicant.smoker',
  'applicant.schufa',
  'applicant.wbs',
  'applicant.guarantor',
]);

/**
 * The placeholders backed by a tri-state profile flag, and the profile field behind each.
 *
 * Used by the settings form to render the three-state controls, and listed in
 * {@link OPTIONAL_PLACEHOLDERS} so an unanswered one is never reported as a gap.
 *
 * @type {Record<string, string>}
 */
export const FLAG_PLACEHOLDERS = {
  'applicant.smoker': 'smoker',
  'applicant.schufa': 'schufa',
  'applicant.wbs': 'wbs',
  'applicant.guarantor': 'guarantor',
};

/**
 * One line of text.
 *
 * Newlines are collapsed to spaces, because every caller of this puts the value on a line of a
 * letter: a portal title that arrives with a line break in it would otherwise split that line in
 * two, and a line it starts is a line the reader - or a model reading the MCP envelope - sees as
 * the letter's own. The one genuinely multi-line field uses {@link paragraph} instead.
 *
 * @param {unknown} value
 * @returns {string} Trimmed single-line text, or an empty string for anything absent.
 */
function text(value) {
  if (value == null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

/**
 * Text the user deliberately wrote across several lines, kept that way.
 *
 * @param {unknown} value
 * @returns {string}
 */
function paragraph(value) {
  if (value == null) return '';
  return String(value).trim();
}

/** `1.200` or `12.345.678` - dots used as thousands separators, never as a decimal point. */
const GROUPED_THOUSANDS = /^\d{1,3}(\.\d{3})+$/;

/**
 * Read a number out of whatever the profile or the listing happens to hold.
 *
 * Both sides feed this free text: the profile is explicitly unvalidated, and older listing rows
 * stored size as `"70 m²"`. The German and Italian forms have to survive - a stored `"1.200"`
 * parsed as 1.2 told a landlord the applicant earns one euro a month - and anything that does not
 * parse cleanly must return null rather than a plausible-looking wrong figure, so the line drops
 * and the field is reported as missing instead.
 *
 * @param {unknown} value
 * @returns {number|null} A finite number, or null when there is none to be had.
 */
function numeric(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;

  // Ordinary and non-breaking spaces are grouping in every locale Fredy writes in.
  const cleaned = value.replace(/[\s\u00a0]/g, '');
  if (cleaned.length === 0) return null;

  let normalized = cleaned;
  if (cleaned.includes(',')) {
    // A comma present means the comma is the decimal separator, so every dot is grouping.
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (GROUPED_THOUSANDS.test(cleaned)) {
    normalized = cleaned.replace(/\./g, '');
  }

  // Number() rejects trailing units and stray words, which is the point: "ca. 3800" is not a
  // figure anybody should be quoted on.
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * @typedef {Object} ParsedDate
 * @property {Date} date
 * @property {boolean} bareDay Whether the input named a day rather than a moment.
 */

/**
 * @param {unknown} value Unix milliseconds, an ISO string, a `YYYY-MM-DD` day, or a Date.
 * @returns {ParsedDate|null}
 */
function toDate(value) {
  if (value == null || value === '') return null;

  let date = null;
  let bareDay = false;

  if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'number') {
    date = new Date(value);
  } else if (typeof value === 'string') {
    // A bare day is pinned to UTC below so the same profile renders the same date on every host;
    // parsed as local time it would slip to the previous day for anyone west of Greenwich.
    bareDay = /^\d{4}-\d{2}-\d{2}$/.test(value);
    date = new Date(bareDay ? `${value}T00:00:00Z` : value);
  } else {
    return null;
  }

  // Every branch is checked, not only the Date one: `new Date(1e300)` is an Invalid Date that
  // `Number.isNaN(1e300)` happily waves through, and `Intl` then throws a RangeError - which used
  // to take out the letter endpoint for every listing the user owns.
  return Number.isNaN(date.getTime()) ? null : { date, bareDay };
}

/**
 * @param {unknown} value
 * @param {string} locale
 * @param {number} [digits=0]
 * @returns {string}
 */
function money(value, locale, digits = 0) {
  const amount = numeric(value);
  if (amount == null) return '';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount);
}

/**
 * @param {unknown} value
 * @param {string} locale
 * @returns {string}
 */
function decimal(value, locale) {
  const amount = numeric(value);
  if (amount == null) return '';
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(amount);
}

/**
 * @param {unknown} value
 * @param {string} locale
 * @returns {string}
 */
function day(value, locale) {
  const parsed = toDate(value);
  if (parsed == null) return '';
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    // Only a bare day is pinned. A moment - the clock, or a listing's publication timestamp -
    // belongs in the server's own zone, or "today" reads as yesterday all evening.
    ...(parsed.bareDay ? { timeZone: 'UTC' } : {}),
  }).format(parsed.date);
}

/**
 * Look one employment type up in the language's table.
 *
 * `Object.hasOwn` rather than a bare index: `{"employmentType":"constructor"}` would otherwise
 * resolve off the prototype and put a function body into somebody's letter, and `?? ''` cannot
 * catch it because the prototype does answer. Same guard, same reason, as `renderTemplate`.
 *
 * @param {import('./phrases.js').LanguagePhrases} phrases
 * @param {unknown} value
 * @returns {string}
 */
function employmentPhrase(phrases, value) {
  const key = text(value);
  return Object.hasOwn(phrases.employmentType, key) ? phrases.employmentType[key] : '';
}

/**
 * Resolve a tri-state flag through the language's phrase table.
 *
 * Unset stays silent. So does a `false` whose language deliberately has no wording for it - an
 * applicant is not helped by announcing what they do not have.
 *
 * @param {unknown} value
 * @param {import('./phrases.js').FlagPhrases|undefined} table
 * @returns {string}
 */
function flag(value, table) {
  if (table == null) return '';
  if (value === true) return table.yes;
  if (value === false) return table.no;
  return '';
}

/**
 * Turn one listing plus the user's applicant profile into the flat map the renderer consumes.
 *
 * Every number, date and currency is formatted for the *letter's* language, not the interface's:
 * an Italian letter carries Italian separators even when Fredy itself is in German.
 *
 * @param {Object} params
 * @param {Object|null} params.listing The listing row, as `getListingById` returns it.
 * @param {Object|null} params.profile The stored `applicant_profile`, or null when never filled.
 * @param {import('./contact.js').ListingContact|null} params.contact Agent behind the listing.
 * @param {string} params.language ISO 639-1 language the letter is written in.
 * @param {string|null} [params.providerName] Human-readable portal name.
 * @param {Date} [params.now] Injectable clock, so tests are not date-dependent.
 * @returns {Record<string, string>} A value for every key in {@link PLACEHOLDERS}.
 */
export function resolvePlaceholderValues({
  listing,
  profile,
  contact,
  language,
  providerName = null,
  now = new Date(),
}) {
  const phrases = phrasesFor(language);
  const { locale } = phrases;
  const source = listing ?? {};
  const applicant = profile ?? {};
  const agent = contact ?? {};

  const street = text(applicant.street);
  const zip = text(applicant.zip);
  const city = text(applicant.city);
  const postal = [zip, city].filter(Boolean).join(' ');

  const firstName = text(applicant.firstName);
  const lastName = text(applicant.lastName);

  const agentName = text(agent.name);
  const size = decimal(source.size, locale);

  return {
    'listing.title': text(source.title),
    'listing.address': text(source.address),
    'listing.price': money(source.price, locale),
    // The unit is appended only once there is a number to append it to: `" m²"` is non-empty and
    // would survive the line-drop rule as `Wohnfläche: m²`, which is the exact failure that rule
    // exists to prevent.
    'listing.size': size.length > 0 ? `${size} m²` : '',
    'listing.rooms': decimal(source.rooms, locale),
    'listing.pricePerSqm': money(source.price_per_sqm ?? source.pricePerSqm, locale, 2),
    'listing.link': text(source.link),
    'listing.provider': text(providerName) || text(source.provider),
    'listing.publishedAt': day(source.published_at ?? source.publishedAt, locale),

    'applicant.fullName': [firstName, lastName].filter(Boolean).join(' '),
    'applicant.firstName': firstName,
    'applicant.lastName': lastName,
    'applicant.address': [street, postal].filter(Boolean).join(', '),
    'applicant.street': street,
    'applicant.zip': zip,
    'applicant.city': city,
    'applicant.phone': text(applicant.phone),
    'applicant.email': text(applicant.email),
    'applicant.household': phrases.household(numeric(applicant.adults) ?? 0, numeric(applicant.children) ?? 0),
    'applicant.pets': text(applicant.pets),
    'applicant.smoker': flag(applicant.smoker, phrases.flags.smoker),
    'applicant.occupation': text(applicant.occupation),
    'applicant.employer': text(applicant.employer),
    'applicant.employmentType': employmentPhrase(phrases, applicant.employmentType),
    'applicant.netIncome': money(applicant.netIncome, locale),
    'applicant.moveInDate': day(applicant.moveInDate, locale),
    'applicant.schufa': flag(applicant.schufa, phrases.flags.schufa),
    'applicant.wbs': flag(applicant.wbs, phrases.flags.wbs),
    'applicant.guarantor': flag(applicant.guarantor, phrases.flags.guarantor),
    // The one field a user writes as prose rather than as a value, so its line breaks are theirs.
    'applicant.extra': paragraph(applicant.extra),

    'contact.name': agentName,
    'contact.company': text(agent.company),
    // Never empty, so the greeting line can never be the line the renderer drops.
    'contact.salutation': agentName ? phrases.salutationNamed(agentName) : phrases.salutationAnonymous,

    today: day(now, locale),
  };
}
