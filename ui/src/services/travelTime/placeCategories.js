/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The kinds of place a travel time can be measured to, as the interface knows them.
 *
 * A deliberate second copy. `lib/services/poi/categories.js` holds the same ids next to the
 * OpenStreetMap tags that decide what is actually found, and the frontend may not import server
 * code - the same rule that keeps `normalizeCommuteBudget` duplicated in `travelTimeFormat.js`.
 * What lives here is only what the interface needs: which ids exist, and what each one looks like.
 *
 * The ids must match the server's. A new category is two edits, and the settings endpoint rejects
 * an id it does not know, so the mistake surfaces immediately rather than as a place type that
 * silently never produces a travel time.
 *
 * @type {ReadonlyArray<{id: string, icon: string}>}
 */
export const PLACE_CATEGORIES = Object.freeze([
  { id: 'supermarket', icon: '🛒' },
  { id: 'bakery', icon: '🥐' },
  { id: 'pharmacy', icon: '💊' },
  { id: 'doctor', icon: '🩺' },
  { id: 'kindergarten', icon: '🧸' },
  { id: 'school', icon: '🏫' },
  { id: 'gym', icon: '🏋️' },
  { id: 'park', icon: '🌳' },
  { id: 'restaurant', icon: '🍽️' },
  { id: 'postOffice', icon: '📮' },
  { id: 'busStop', icon: '🚏' },
  { id: 'trainStation', icon: '🚉' },
]);

/**
 * What a named address is drawn with.
 *
 * A pin, against the categories' own icons. The two kinds of entry sit in one list, and this is
 * what tells them apart at a glance: a fixed point, or a kind of place.
 * @type {string}
 */
export const ADDRESS_ICON = '📍';

/**
 * The icon for one category, or the pin for anything that is not one.
 *
 * @param {string|null|undefined} id
 * @returns {string}
 */
export function placeCategoryIcon(id) {
  return PLACE_CATEGORIES.find((category) => category.id === id)?.icon ?? ADDRESS_ICON;
}

/**
 * Whether an entry in the address list names a kind of place rather than one particular place.
 *
 * `kind` absent reads as an address, which is what every entry saved before place types existed is.
 *
 * @param {Object|null|undefined} entry
 * @returns {boolean}
 */
export function isPlaceType(entry) {
  return entry?.kind === 'category';
}
