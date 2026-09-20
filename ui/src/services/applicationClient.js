/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { xhrGet, xhrPost } from './xhr.js';

/**
 * Client for the application letter of one listing.
 *
 * Not a store slice: a letter is transient, belongs to the dialog that asked for it, and is never
 * read by anything else. Keeping it out of the store also keeps the dialog honest - it re-asks the
 * server whenever it opens, so a profile edited in another tab is reflected straight away.
 */

/**
 * @typedef {Object} ApplicationLetter
 * @property {string} text
 * @property {string} language
 * @property {'rent'|'buy'} dealType
 * @property {string[]} missing Catalogue keys the template wanted and the profile does not hold.
 * @property {string[]} unknown Placeholders in the user's own template that do not exist.
 * @property {boolean} hasProfile
 * @property {{name: string|null, company: string|null}|null} contact
 */

/**
 * Ask the backend to draft the letter for a listing.
 *
 * @param {string} listingId
 * @param {string|null} [language] Force a language instead of following the portal's country.
 * @returns {Promise<ApplicationLetter>}
 */
export async function fetchApplicationLetter(listingId, language = null) {
  const query = language == null ? '' : `?language=${encodeURIComponent(language)}`;
  const response = await xhrGet(`/api/listings/${encodeURIComponent(listingId)}/application${query}`);
  return response.json;
}

/**
 * @typedef {Object} TemplatePreview
 * @property {string} template The template that was rendered - the shipped one when none was sent.
 * @property {string} text
 * @property {string[]} missing
 * @property {string[]} unknown
 */

/**
 * Render a draft template against a sample listing and the user's own profile.
 *
 * Server-side on purpose: the frontend may not import out of `lib/`, and a second implementation of
 * the placeholder substitution would eventually disagree with the one that writes the real letters.
 *
 * @param {Object} params
 * @param {string|null} params.template The draft, or null to ask for the shipped letter.
 * @param {string} params.language
 * @param {'rent'|'buy'} params.dealType
 * @returns {Promise<TemplatePreview>}
 */
export async function previewApplicationTemplate({ template, language, dealType }) {
  const response = await xhrPost('/api/user/settings/application-preview', { template, language, dealType });
  return response.json;
}
