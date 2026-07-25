/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The finance profile has three parts: a shared household, a renting block and a buying
 * (financing) block. The renting and buying tabs each save and delete independently, so these
 * helpers apply one tab's change to the stored profile without disturbing the other tab.
 */

/**
 * Fields that belong to the household and are therefore shared by both tabs. Saving either tab
 * writes these; they only leave the profile when the whole thing is cleared.
 *
 * @type {ReadonlyArray<string>}
 */
export const HOUSEHOLD_KEYS = Object.freeze([
  'personA',
  'personB',
  'livingCosts',
  'existingDebt',
  'existingDebtRate',
  'existingDebtInterest',
  'rollFreedBudgetIntoMortgage',
]);

/**
 * @param {'rent'|'buy'} section
 * @returns {'renting'|'financing'} The profile key that section owns.
 */
function sectionKey(section) {
  return section === 'rent' ? 'renting' : 'financing';
}

/**
 * Apply one tab's edits onto the stored profile.
 *
 * The household comes from the incoming (edited) profile, because it is shared and the user may
 * have just changed it. The section being saved comes from the incoming profile too. The *other*
 * section is carried over from what is already stored, untouched - so saving the renting tab can
 * never overwrite or wipe a previously saved buying setup, and vice versa.
 *
 * @param {Object|null|undefined} stored The profile currently persisted, if any.
 * @param {'rent'|'buy'} section Which tab is being saved.
 * @param {Object} incoming The edited profile from the form.
 * @returns {Object} The profile to persist.
 */
export function mergeSection(stored, section, incoming) {
  const base = stored && typeof stored === 'object' ? stored : {};
  const source = incoming && typeof incoming === 'object' ? incoming : {};

  const next = {};
  for (const key of HOUSEHOLD_KEYS) {
    // A key the caller did not mention keeps whatever is stored. The form always sends the whole
    // household, but a partial payload (an older UI, a direct API call) must not silently drop
    // the user's income just because it was only trying to change the Nebenkosten.
    const value = source[key] !== undefined ? source[key] : base[key];
    if (value !== undefined) {
      next[key] = value;
    }
  }

  const ownKey = sectionKey(section);
  const otherKey = sectionKey(section === 'rent' ? 'buy' : 'rent');
  next[ownKey] = source[ownKey] ?? {};
  if (base[otherKey] != null) {
    next[otherKey] = base[otherKey];
  }
  return next;
}

/**
 * Remove one tab's block from the stored profile, leaving the household and the other tab in
 * place. This is what the tab's "Delete" button persists.
 *
 * @param {Object|null|undefined} stored
 * @param {'rent'|'buy'} section Which tab to remove.
 * @returns {Object} The profile to persist, without that section.
 */
export function stripSection(stored, section) {
  const base = stored && typeof stored === 'object' ? stored : {};
  const rest = { ...base };
  delete rest[sectionKey(section)];
  return rest;
}
