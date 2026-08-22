/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { autocomplete as nominatimAutocomplete } from './client/nominatimClient.js';
import { DEFAULT_COUNTRIES } from '../providers/countries.js';
import logger from '../logger.js';

/**
 * Autocompletes an address using Nominatim.
 *
 * @param {string} query - The search query.
 * @param {string[]} [countries] - ISO 3166-1 alpha-2 codes to search in. Defaults to Germany.
 * @returns {Promise<string[]>} List of matching addresses.
 */
export async function autocompleteAddress(query, countries = DEFAULT_COUNTRIES) {
  if (!query) {
    return [];
  }

  try {
    return await nominatimAutocomplete(query, countries);
  } catch (error) {
    logger.error('Error during address autocomplete:', error);
    return [];
  }
}
