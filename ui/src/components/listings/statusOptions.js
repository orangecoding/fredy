/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The decision a user can record about a listing.
 *
 * `null` is a value here rather than the absence of one: "not decided yet" is a state somebody
 * returns a listing to, so it needs a label and a place in the control like the other three.
 *
 * @typedef {('applied'|'rejected'|'accepted'|null)} ListingStatus
 */

/** @type {ListingStatus[]} */
export const STATUS_VALUES = [null, 'applied', 'rejected', 'accepted'];

/**
 * The four options with their labels, in the order both controls show them.
 *
 * Shared because the detail page draws them as a segmented control and the tables draw them as a
 * dropdown, and two copies of the list is how the two end up offering different words for the same
 * state.
 *
 * @param {(key: string) => string} t
 * @returns {Array<{value: ListingStatus, label: string}>}
 */
export function statusOptions(t) {
  return [
    { value: null, label: t('listings.status.none') },
    { value: 'applied', label: t('listings.status.applied') },
    { value: 'rejected', label: t('listings.status.rejected') },
    { value: 'accepted', label: t('listings.status.accepted') },
  ];
}
