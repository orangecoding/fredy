/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Changing a user's own settings: language, theme, the addresses listings are measured against,
 * the finance profile and the applicant profile.
 *
 * The settings routes (`userSettingsRoute.js`) and the MCP `update_user_settings` tool both call
 * {@link updateUserSettings}, so what each setting accepts, which ones demo mode locks and the caps
 * on what is stored are written once. The one difference between the callers is passed in: the
 * settings pages send a whole profile, while a model sends only the values that change and asks for
 * `mergeProfiles`.
 */

import { getSettings, getUserSettings, upsertSettings } from '../storage/settingsStorage.js';
import { saveHomeAddresses } from './homeAddressService.js';
import { isPlainObject, UNSAFE_KEYS } from '../security/plainObject.js';
import { fail } from '../serviceResult.js';

/**
 * @typedef {import('../serviceResult.js').ServiceFailure} ServiceFailure
 * @typedef {{id: string, isAdmin?: boolean}} User
 *
 * @typedef {Object} SettingsPatch - Every key present is a change; leave a key out to keep it.
 * @property {string} [language]
 * @property {'dark'|'light'} [theme]
 * @property {Array<Object>} [homeAddresses] - The complete list, replacing the stored one.
 * @property {Object|null} [financeProfile] - Null clears it.
 * @property {Object|null} [applicantProfile] - Null clears it.
 *
 * @typedef {Object} SettingsChanges - What was stored, per key of the patch.
 * @property {string} [language]
 * @property {{value: string, previous: string}} [theme] - `previous` is what was on screen before.
 * @property {{home_addresses: Array<Object>, queued: number}} [homeAddresses]
 * @property {Object|null} [financeProfile]
 * @property {Object|null} [applicantProfile]
 */

/**
 * Longest applicant profile a user may store, serialised.
 *
 * Every field on it is deliberately unvalidated free text, and the body limit is 50 MB, so without
 * a ceiling one save could put a multi-megabyte row into the `settings` table - which every settings
 * load re-serialises and every letter render walks.
 */
export const MAX_APPLICANT_PROFILE_LENGTH = 20000;

/** The two themes the stylesheets define a palette for. The value ends up on `<body theme-mode>`. */
export const THEMES = Object.freeze(['dark', 'light']);

/** The theme an account that never picked one is on. */
const DEFAULT_THEME = 'dark';

/**
 * The settings demo mode keeps away from everyone but an admin, with what it says about it. The
 * demo account is shared, and these are the ones that would show one visitor's data to the next.
 * @type {Record<string, string>}
 */
const DEMO_LOCKED = Object.freeze({
  homeAddresses: 'In demo mode, it is not allowed to change the addresses.',
  financeProfile: 'In demo mode, it is not allowed to change settings.',
  applicantProfile: 'In demo mode, it is not allowed to change settings.',
});

/**
 * One level of {@link mergeProfilePatch}: nested objects merge, everything else replaces, null
 * removes the key.
 *
 * @param {Record<string, unknown>} base - Not mutated.
 * @param {Record<string, unknown>} patch
 * @returns {Record<string, unknown>}
 */
function mergeObjects(base, patch) {
  const next = { ...base };
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (UNSAFE_KEYS.has(key)) continue;
    if (value === null) {
      delete next[key];
    } else if (isPlainObject(value)) {
      // Through the merge even when nothing is stored under the key yet, so a null inside a new
      // object is dropped rather than stored, and an unsafe key inside it is skipped all the same.
      next[key] = mergeObjects(isPlainObject(next[key]) ? next[key] : {}, value);
    } else {
      next[key] = value;
    }
  }
  return next;
}

/**
 * Apply a partial profile to the stored one.
 *
 * Nested objects (`personA`, `financing`) merge key by key, lists (`financing.scenarios`) and plain
 * values replace, and null on a key removes it. A profile with nothing left in it is no profile,
 * and comes back as null, which is how the settings row is cleared.
 *
 * @param {unknown} stored - The stored profile, or nothing.
 * @param {Record<string, unknown>} patch
 * @returns {Record<string, unknown>|null}
 */
export function mergeProfilePatch(stored, patch) {
  const merged = mergeObjects(isPlainObject(stored) ? stored : {}, patch);
  return Object.keys(merged).length > 0 ? merged : null;
}

/**
 * Check a profile value and settle what is stored: as sent, or merged into the stored one.
 *
 * @param {string} label - How the error names the profile.
 * @param {unknown} value
 * @param {unknown} stored
 * @param {boolean} merge
 * @returns {ServiceFailure|{ok: true, value: Object|null}}
 */
function settleProfile(label, value, stored, merge) {
  // Null is how a profile is cleared, which also hides every surface built on it.
  if (value === null) return { ok: true, value: null };
  if (!isPlainObject(value)) return fail('invalid', `The ${label} must be an object or null.`);
  return { ok: true, value: merge ? mergeProfilePatch(stored, value) : value };
}

/**
 * Validate and store a set of the user's own settings, all or nothing.
 *
 * Every key is checked before any is written: a patch whose address list turns out to have
 * duplicate labels must not leave behind the language it also carried. The address save both
 * validates and writes, so it runs after every other check and before every other write - the
 * writes after it are single-row upserts with nothing left to disagree about.
 *
 * @param {User} user
 * @param {SettingsPatch} patch
 * @param {{mergeProfiles?: boolean}} [options] - Merge the profiles into the stored ones (see
 *   {@link mergeProfilePatch}) instead of replacing them.
 * @returns {Promise<ServiceFailure|{ok: true, changes: SettingsChanges}>}
 */
export async function updateUserSettings(user, patch, { mergeProfiles = false } = {}) {
  const keys = Object.keys(patch ?? {});
  const unknown = keys.find((key) => !['language', 'theme', ...Object.keys(DEMO_LOCKED)].includes(key));
  if (unknown) return fail('invalid', `Unknown setting: ${unknown}`);

  const locked = keys.find((key) => Object.hasOwn(DEMO_LOCKED, key));
  if (locked && user?.isAdmin !== true && (await getSettings()).demoMode) {
    return fail('forbidden', DEMO_LOCKED[locked], { code: 'demoMode' });
  }

  const stored = getUserSettings(user.id) ?? {};
  /** @type {Record<string, unknown>} */
  const rows = {};
  /** @type {SettingsChanges} */
  const changes = {};

  if (keys.includes('language')) {
    if (typeof patch.language !== 'string' || patch.language.trim().length === 0) {
      return fail('invalid', 'language must be a non-empty string.');
    }
    rows.language = changes.language = patch.language.trim();
  }

  if (keys.includes('theme')) {
    if (!THEMES.includes(patch.theme)) return fail('invalid', "theme must be either 'dark' or 'light'.");
    rows.theme = patch.theme;
    changes.theme = { value: patch.theme, previous: stored.theme ?? DEFAULT_THEME };
  }

  if (keys.includes('financeProfile')) {
    const settled = settleProfile('finance profile', patch.financeProfile, stored.finance_profile, mergeProfiles);
    if (!settled.ok) return settled;
    rows.finance_profile = changes.financeProfile = settled.value;
  }

  if (keys.includes('applicantProfile')) {
    const settled = settleProfile('applicant profile', patch.applicantProfile, stored.applicant_profile, mergeProfiles);
    if (!settled.ok) return settled;
    // Against what is about to be stored: merged patches add up.
    if (settled.value != null && JSON.stringify(settled.value).length > MAX_APPLICANT_PROFILE_LENGTH) {
      return fail('invalid', `An applicant profile may be at most ${MAX_APPLICANT_PROFILE_LENGTH} characters long.`);
    }
    rows.applicant_profile = changes.applicantProfile = settled.value;
  }

  if (keys.includes('homeAddresses')) {
    // Validate, geocode, recompute distances, queue travel times - see homeAddressService.js.
    // Its refusals arrive in the shared failure shape, so they pass through unchanged.
    const saved = await saveHomeAddresses(user.id, patch.homeAddresses);
    if (!saved.ok) return saved;
    changes.homeAddresses = { home_addresses: saved.home_addresses, queued: saved.queued };
  }

  if (Object.keys(rows).length > 0) upsertSettings(rows, user.id);
  return { ok: true, changes };
}
