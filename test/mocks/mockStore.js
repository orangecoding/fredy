/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/* eslint-disable no-unused-vars */
const db = {};
export const storeListings = (jobKey, providerId, listings) => {
  if (!Array.isArray(listings)) throw Error('Not a valid array');
  db[providerId] = listings;
};
export const getKnownListingHashesForJobAndProvider = (jobKey, providerId) => {
  return db[providerId] || [];
};

export const getGeocoordinatesByAddress = (any) => {
  return null;
};

/**
 * Every address the pipeline asked the geocoder about, in order.
 *
 * A test that cares whether a geocode happened at all needs to see the absence of a call, which a
 * plain stub cannot show.
 * @type {string[]}
 */
export const geocodedAddresses = [];

/** What the stand-in geocoder answers. Set by a test that needs coordinates back. */
export let geocodeResult = null;

/**
 * @param {{lat: number, lng: number}|null} result
 * @returns {void}
 */
export function setGeocodeResult(result) {
  geocodeResult = result;
}

/**
 * Stands in for `geoCodingService.geocodeAddress`, recording what it was asked.
 *
 * @param {string} address
 * @returns {{lat: number, lng: number}|null}
 */
export const geocodeAddress = (address) => {
  geocodedAddresses.push(address);
  return geocodeResult;
};

let userSettings = null;
export function setUserSettings(settings) {
  userSettings = settings;
}
export function getUserSettings(userId) {
  return userSettings;
}

export async function getSettings() {
  return { baseUrl: '' };
}

export function getAddresses(settings) {
  if (Array.isArray(settings?.home_addresses)) return settings.home_addresses;
  if (settings?.home_address?.coords) return [{ label: 'Home', ...settings.home_address }];
  return [];
}

export const updateListingDistances = (id, distances) => {
  // noop
};
/**
 * The real one reads the stored journeys back onto the listings after a sweep. A test that wants
 * travel times puts them on the listing itself, so here this only has to leave them alone.
 */
export const attachTravelTimes = (listings) => listings;
export const deletedIds = [];
export const deleteListingsById = (ids) => {
  deletedIds.push(...ids);
};
export const deleteListingsByHash = (hashes) => {
  deletedIds.push(...hashes);
};
/* eslint-enable no-unused-vars */
