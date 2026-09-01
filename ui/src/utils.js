/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The configured entries that sit at a known point on the map.
 *
 * For anything that has to *draw* one: a marker, the bounds a detail map opens at, a line from the
 * listing. A place type is deliberately not here - "a supermarket" is not a coordinate, and the one
 * it resolves to is different for every listing, so it comes from the listing's own travel times
 * instead. Use {@link measuredPlaces} for "everything a travel time is measured to".
 *
 * @param {Object} settings - The user settings object.
 * @returns {Array<{label: string, address: string, coords: {lat: number, lng: number}}>}
 */
export function getAddresses(settings) {
  const raw = Array.isArray(settings?.home_addresses) ? settings.home_addresses : [];
  return raw.filter((a) => a?.coords && a.coords.lat !== -1);
}

/**
 * Everything a listing is measured to: named addresses and kinds of place alike.
 *
 * The distinction against {@link getAddresses} is drawing versus measuring. A place type has no
 * coordinate to draw and a travel time all the same, so a user whose only entry is "a supermarket"
 * must still be offered the travel time filter and still get their limits coloured in - which is
 * exactly what asking for coordinates here used to take away from them.
 *
 * @param {Object} settings - The user settings object.
 * @returns {Array<Object>}
 */
export function measuredPlaces(settings) {
  const raw = Array.isArray(settings?.home_addresses) ? settings.home_addresses : [];
  return raw.filter((a) => (a?.kind === 'category' ? Boolean(a.category) : Boolean(a?.coords) && a.coords.lat !== -1));
}

export function debounce(fn, delay) {
  let timer;

  function debounced(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  }

  debounced.cancel = () => clearTimeout(timer);

  return debounced;
}
