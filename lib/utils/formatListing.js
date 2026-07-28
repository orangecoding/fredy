/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/** @import { ParsedListing } from '../types/listing.js' */

/**
 * @typedef {Omit<import('../types/listing.js').ParsedListing, 'price' | 'size' | 'rooms'> & {
 *   price: string | null,
 *   size: string | null,
 *   rooms: string | null,
 * }} FormattedListing
 */

/**
 * The word for "rooms" per UI language.
 *
 * The unit used to be hard-coded as "Zimmer", so every notification was German however the user
 * had set the interface. Currency and area carry no language, so only this one needs a table.
 * An unknown language falls back to English rather than to German.
 * @type {Record<string, string>}
 */
const ROOMS_LABEL = {
  de: 'Zimmer',
  en: 'rooms',
};

/**
 * Formats a listing's numerical fields (price, size, rooms) into strings with their respective units.
 *
 * @param {import('../types/listing.js').ParsedListing} listing The original listing object.
 * @param {string} [language='en'] UI language of the job's owner, as stored in their settings.
 * @returns {FormattedListing} A copy of the listing with formatted strings for price, size, and rooms.
 */
export const formatListing = (listing, language = 'en') => {
  const rooms = ROOMS_LABEL[language] ?? ROOMS_LABEL.en;
  return {
    ...listing,
    price: listing.price != null ? `${listing.price} €` : null,
    size: listing.size != null ? `${listing.size} m²` : null,
    rooms: listing.rooms != null ? `${listing.rooms} ${rooms}` : null,
  };
};
