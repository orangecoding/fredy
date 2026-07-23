/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Normalize the configured distance-check addresses from user settings to an array.
 *
 * @param {Object} settings - The user settings object.
 * @returns {Array<{label: string, address: string, coords: {lat: number, lng: number}}>}
 */
export function getHomeAddresses(settings) {
  const raw = Array.isArray(settings?.home_addresses)
    ? settings.home_addresses
    : settings?.home_address?.coords
      ? [{ label: 'Home', ...settings.home_address }]
      : [];
  return raw.filter((a) => a?.coords && a.coords.lat !== -1);
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
