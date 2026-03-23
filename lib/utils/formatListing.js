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
 * Formats a listing's numerical fields (price, size, rooms) into strings with their respective units.
 *
 * @param {import('../types/listing.js').ParsedListing} listing The original listing object.
 * @returns {FormattedListing} A copy of the listing with formatted strings for price, size, and rooms.
 */
export const formatListing = (listing) => {
  return {
    ...listing,
    price: listing.price != null ? `${listing.price} €` : null,
    size: listing.size != null ? `${listing.size} m²` : null,
    rooms: listing.rooms != null ? `${listing.rooms} Zimmer` : null,
  };
};
