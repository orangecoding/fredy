/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { getProviders } from '../../utils.js';
import { currencyForLink } from './currency.js';

/**
 * The currency a listing is stored with.
 *
 * Asked once, when the pipeline writes the row. Everything after that reads `listings.currency`,
 * because a comparison in SQL has no provider module to ask.
 *
 * @param {string} providerId The provider the listing was found by.
 * @param {{link?: string|null}|null} listing
 * @returns {Promise<string>} ISO 4217 code.
 */
export async function getCurrencyForListing(providerId, listing) {
  const meta = (await getProviders()).find((p) => p.metaInformation.id === providerId)?.metaInformation;
  return currencyForLink(meta, listing?.link);
}
