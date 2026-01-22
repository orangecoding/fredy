/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { autocomplete as nominatimAutocomplete } from './client/nominatimClient.js';
import logger from '../logger.js';

/**
 * Autocompletes an address using Nominatim.
 *
 * @param {string} query - The search query.
 * @returns {Promise<string[]>} List of matching addresses.
 */
export async function autocompleteAddress(query) {
  if (!query) {
    return [];
  }

  try {
    return await nominatimAutocomplete(query);
  } catch (error) {
    logger.error('Error during address autocomplete:', error);
    return [];
  }
}
