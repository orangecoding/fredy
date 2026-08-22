/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { getGeocoordinatesByAddress } from '../storage/listingsStorage.js';
import { geocode as nominatimGeocode, isPaused as isNominatimPaused } from './client/nominatimClient.js';
import { DEFAULT_COUNTRIES } from '../providers/countries.js';
import { getProviderIdsForCountries } from '../providers/providerCountries.js';
import logger from '../logger.js';

/**
 * Geocodes an address using Nominatim or cached results from the database.
 *
 * @param {string} address - The address to geocode.
 * @param {string[]} [countries] - ISO 3166-1 alpha-2 codes to search in. Defaults to Germany, which
 *   is what every provider that declares nothing resolves to.
 * @returns {Promise<{lat: number, lng: number}|null>} The geocoordinates or null if error. {lat: -1, lng: -1} if not found.
 */
export async function geocodeAddress(address, countries = DEFAULT_COUNTRIES) {
  if (!address) {
    return null;
  }

  try {
    // 1. Check if we already have this address geocoded in our database. Scoped to the providers
    // of the countries being asked about: the cache matches on the address text alone, so an
    // identically written street in a neighbouring country would otherwise answer for this one.
    const cachedCoordinates = getGeocoordinatesByAddress(address, await getProviderIdsForCountries(countries));
    if (cachedCoordinates) {
      logger.debug(`Found cached geocoordinates for address: ${address}`);
      return cachedCoordinates;
    }

    // 2. If not, use Nominatim
    return await nominatimGeocode(address, countries);
  } catch (error) {
    logger.error('Error during geocoding:', error);
    return null;
  }
}

/**
 * Checks if we are currently in a rate limit pause.
 * @returns {boolean}
 */
export function isGeocodingPaused() {
  return isNominatimPaused();
}
