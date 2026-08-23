/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { fetchGermanConnectivity, isBreitbandatlasPaused } from './client/breitbandatlasClient.js';
import { fetchSwissConnectivity, isGeoAdminPaused } from './client/geoAdminClient.js';

/**
 * Which register answers for which country.
 *
 * There is no pan-European source for this: every country runs its own register, on its own
 * terms, in its own units. So each one is a client of its own behind a common shape, and a country
 * nobody has written a client for simply has no answer - which is a state the UI has to render
 * anyway, because a register can also be down or switched off.
 *
 * @typedef {Object} ConnectivitySource
 * @property {string} id Stable id, stored on the listing and used as the settings key.
 * @property {string[]} countries ISO 3166-1 alpha-2 codes this source covers.
 * @property {(lat: number, lng: number) => Promise<import('./normalize.js').Connectivity|null>} fetch
 * @property {() => boolean} isPaused Whether the client is standing off after a failure.
 */

/** @type {ConnectivitySource[]} */
export const SOURCES = [
  {
    id: 'de-bba',
    countries: ['de'],
    fetch: fetchGermanConnectivity,
    isPaused: isBreitbandatlasPaused,
  },
  {
    id: 'ch-bakom',
    countries: ['ch'],
    fetch: fetchSwissConnectivity,
    isPaused: isGeoAdminPaused,
  },
];

/** @type {string[]} */
export const SOURCE_IDS = SOURCES.map((source) => source.id);

/**
 * The source responsible for a set of countries.
 *
 * A listing is geocoded against the countries its portal serves, which is usually one. Where it is
 * several, the first source that covers any of them answers - two registers cannot be merged into
 * one verdict, and picking one beats inventing a combination.
 *
 * @param {string[]} countries
 * @returns {ConnectivitySource|null}
 */
export function sourceForCountries(countries) {
  if (!Array.isArray(countries) || countries.length === 0) {
    return null;
  }
  const wanted = countries.map((code) => String(code).toLowerCase());
  return SOURCES.find((source) => source.countries.some((code) => wanted.includes(code))) ?? null;
}
