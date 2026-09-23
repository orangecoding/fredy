/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Whether the finance form differs from what is stored, and in which of its three parts.
 *
 * Three rather than one, because this page saves in halves: the household is shared, and each tab
 * owns its own block and is written on its own. Saving the renting tab must not claim the purchase
 * tab's edits as saved, so "is there anything to save" has to be asked per section.
 *
 * Compared rather than tracked, for the reason `jobDirty.js` gives: a `touched` flag per input
 * survives typing a character and deleting it again, and leaves the save bar standing over a form
 * that is identical to what is stored.
 */

/** What the household block edits. Shared by both tabs and written with whichever one is saved. */
const HOUSEHOLD_FIELDS = Object.freeze([
  'personA',
  'personB',
  'livingCosts',
  'existingDebt',
  'existingDebtRate',
  'existingDebtInterest',
  'rollFreedBudgetIntoMortgage',
]);

/** What each tab owns alone. */
const SECTION_FIELDS = Object.freeze({ buy: ['financing'], rent: ['renting'] });

/**
 * One value, in the single spelling it is compared as.
 *
 * The form has four ways of saying "nothing" - `undefined`, `null`, an empty string and an empty
 * object - and which one a field holds depends on whether it came from the server's normalized
 * profile, from a control the user emptied, or from `EMPTY_DRAFT` before the first answer landed.
 * `renting` is the clearest case: it arrives as `{}` for a household that has never saved the tab
 * and as `undefined` before the summary is in.
 *
 * Object keys are sorted because two objects built in a different order are the same object. Array
 * order is kept: for the rate scenarios it is the order the user put them in, and the first of them
 * is the one every headline figure is computed from.
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
 * The comparable form of a list of fields.
 *
 * A string rather than an object, so comparing two of them is `===` and cannot quietly become a
 * reference comparison.
 *
 * @param {Object|null} profile
 * @param {ReadonlyArray<string>} fields
 * @returns {string}
 */
function fingerprint(profile, fields) {
  return JSON.stringify(fields.map((field) => normalise(comparable(profile, field))));
}

/**
 * A field without the parts that are derived from the rest of it.
 *
 * A rate scenario's `label` is printed from its `annualRate` ("3 %"), while the stored defaults spell
 * it "3.0 %". Compared as text, typing a rate and then the original one back left the tab dirty.
 *
 * @param {Object|null} profile
 * @param {string} field
 * @returns {unknown}
 */
function comparable(profile, field) {
  const value = profile?.[field];
  if (field === 'financing' && Array.isArray(value?.scenarios)) {
    return { ...value, scenarios: value.scenarios.map(({ label: _label, ...scenario }) => scenario) };
  }
  return value;
}

/**
 * What the form has changed, part by part.
 *
 * @param {Object|null} current The draft as it stands.
 * @param {Object|null} baseline The normalized profile as stored.
 * @returns {{household: boolean, rent: boolean, buy: boolean}}
 */
export function financeDirtyState(current, baseline) {
  return {
    household: fingerprint(current, HOUSEHOLD_FIELDS) !== fingerprint(baseline, HOUSEHOLD_FIELDS),
    rent: fingerprint(current, SECTION_FIELDS.rent) !== fingerprint(baseline, SECTION_FIELDS.rent),
    buy: fingerprint(current, SECTION_FIELDS.buy) !== fingerprint(baseline, SECTION_FIELDS.buy),
  };
}

/**
 * The draft with one tab's edits taken back.
 *
 * The household and that tab's own block go back to what is stored; the other tab keeps whatever
 * was typed into it. Discard sits in the bar that saves one tab, and resetting the whole page from
 * there threw away the other tab's edits without a word about them.
 *
 * @param {Object|null} current The draft as it stands.
 * @param {Object|null} baseline The normalized profile as stored.
 * @param {'rent'|'buy'} section The tab whose edits are discarded.
 * @returns {Object}
 */
export function discardSection(current, baseline, section) {
  const next = { ...(current ?? {}) };
  for (const field of [...HOUSEHOLD_FIELDS, ...SECTION_FIELDS[section]]) {
    next[field] = baseline?.[field];
  }
  return next;
}

/**
 * Whether saving this tab would write anything.
 *
 * The household counts towards both, because it is written along with whichever tab is saved.
 *
 * @param {{household: boolean, rent: boolean, buy: boolean}} state
 * @param {'rent'|'buy'} section
 * @returns {boolean}
 */
export function isSectionDirty(state, section) {
  return state.household || state[section] === true;
}
