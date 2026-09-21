/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Every placeholder an application template may use, and where the editor files it.
 *
 * Duplicated from lib/services/application/placeholders.js. The frontend must not import out of
 * lib/ - that code is server-side and free to grow a Node built-in at any time, which would break
 * the Vite build with an error pointing nowhere near the cause.
 *
 * Only the catalogue lives here. Rendering a template stays on the server and is reached over
 * /api/user/settings/application-preview, because two implementations of the same placeholder
 * substitution would eventually disagree about the letter the user is about to send. Keep this in
 * step with the backend copy; test/ui/applicationCatalogInSync.test.js fails if they drift apart.
 *
 * @typedef {Object} PlaceholderDefinition
 * @property {'listing'|'applicant'|'contact'|'env'} group Which section of the editor lists it.
 * @property {string} labelKey Interface translation key describing the placeholder.
 *
 * @type {Record<string, PlaceholderDefinition>}
 */
export const PLACEHOLDER_CATALOG = Object.freeze({
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
});

/**
 * The order the editor groups placeholders in. Listing first, because that is what the letter
 * opens with, and the environment group last because it holds one entry.
 *
 * @type {string[]}
 */
export const PLACEHOLDER_GROUPS = Object.freeze(['listing', 'applicant', 'contact', 'env']);

/**
 * Languages an application letter can be written in.
 *
 * Duplicated from lib/services/application/templates/index.js for the same reason as above.
 *
 * @type {string[]}
 */
export const LETTER_LANGUAGES = Object.freeze(['de', 'en', 'it']);

/** Flag per letter language. Not the interface languages: Italian is one without being the other. */
export const LETTER_LANGUAGE_FLAG = Object.freeze({ de: '🇩🇪', en: '🇬🇧', it: '🇮🇹' });
