/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { DRAFT_FIELDS } from './jobDraft.js';

/**
 * Whether the job form differs from what is stored.
 *
 * Compared rather than tracked: the alternative is a `touched` flag per input, which goes wrong the
 * moment somebody types a character and deletes it again - the flag stays set and the save bar
 * stays open over a form that is identical to the job it is editing.
 *
 * The fields compared are `DRAFT_FIELDS`, the same list the draft is written from, so a field added
 * to the form has one place to be registered rather than two. Anything outside that list is either
 * derived (`selectedChannels`) or not the user's to change.
 */

/**
 * One value, in the single spelling it is compared as.
 *
 * The form has four ways of saying "nothing" - `undefined`, `null`, an empty string and an empty
 * array or object - and which one a given piece of state holds depends on whether it came from a
 * new job, a loaded one or a control the user emptied again. `specFilter` is the clearest case: it
 * starts as `null`, becomes `{ maxPrice: null }` the moment a price is typed and cleared, and
 * without this would read as a change for the rest of the session.
 *
 * Object keys are sorted because two objects built in a different order are the same object.
 * Array order is kept, because for the provider list and the channel list it is the order the user
 * put them in.
 *
 * @param {unknown} value
 * @returns {unknown} `null` for anything empty.
 */
function normalise(value) {
  if (value == null || value === '') {
    return null;
  }

  if (Array.isArray(value)) {
    const items = value.map(normalise);
    return items.length === 0 ? null : items;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value)
      .map(([key, entry]) => [key, normalise(entry)])
      .filter(([, entry]) => entry !== null)
      .sort(([a], [b]) => a.localeCompare(b));
    return entries.length === 0 ? null : Object.fromEntries(entries);
  }

  return value;
}

/**
 * The comparable form of everything the job form edits.
 *
 * A string rather than an object, so that comparing two of them is `===` and cannot accidentally
 * become a reference comparison.
 *
 * @param {Object} values Keyed by `DRAFT_FIELDS`.
 * @returns {string}
 */
export function jobFingerprint(values) {
  return JSON.stringify(DRAFT_FIELDS.map((field) => normalise(values?.[field])));
}

/**
 * Whether there is anything to save.
 *
 * @param {Object} current What the form holds now.
 * @param {Object} baseline What the job holds as stored, or the defaults of a new one.
 * @returns {boolean}
 */
export function isJobDirty(current, baseline) {
  return jobFingerprint(current) !== jobFingerprint(baseline);
}
