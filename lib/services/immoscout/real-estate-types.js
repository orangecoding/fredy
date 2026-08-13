/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The `realestatetype` vocabulary of the ImmoScout mobile API, plus the groupings the rest of the
 * translator is written in terms of.
 *
 * These are the types whose `search/list` answers carry the residential result shape the provider
 * normalizes. The commercial types (`office`, `store`, `gastronomy`, `tradesite`, `specialpurpose`)
 * are deliberately absent: their result lists contain no `EXPOSE_RESULT` items, so nothing
 * downstream could read them.
 */

export const APARTMENT_RENT = 'apartmentrent';
export const APARTMENT_BUY = 'apartmentbuy';
export const HOUSE_RENT = 'houserent';
export const HOUSE_BUY = 'housebuy';
export const INVESTMENT = 'investment';
export const LIVING_BUY_SITE = 'livingbuysite';
export const GARAGE_BUY = 'garagebuy';
export const GARAGE_RENT = 'garagerent';
export const FLATSHARE_ROOM = 'flatshareroom';
export const SHORT_TERM = 'shorttermaccommodation';
export const ASSISTED_LIVING = 'assistedliving';
export const COMPULSORY_AUCTION = 'compulsoryauction';

/** The two apartment types. */
export const APARTMENTS = [APARTMENT_RENT, APARTMENT_BUY];
/** The two house types. */
export const HOUSES = [HOUSE_RENT, HOUSE_BUY];
/** Apartments and houses, i.e. everything somebody lives in as a whole. */
export const LIVING_SPACES = [...APARTMENTS, ...HOUSES];
/** The two types bought rather than rented. */
export const BUY_TYPES = [APARTMENT_BUY, HOUSE_BUY];
/** The two types rented rather than bought. */
export const RENT_TYPES = [APARTMENT_RENT, HOUSE_RENT];

/** Every supported type. A new type is one line here and one line in the support table. */
export const ALL_TYPES = [
  ...LIVING_SPACES,
  INVESTMENT,
  LIVING_BUY_SITE,
  GARAGE_BUY,
  GARAGE_RENT,
  FLATSHARE_ROOM,
  SHORT_TERM,
  ASSISTED_LIVING,
  COMPULSORY_AUCTION,
];

/**
 * Every type but the named ones, so the support table can say what a parameter is *not* for when
 * that is the shorter half.
 *
 * @param {...string} types Types to leave out.
 * @returns {string[]}
 */
export function allTypesExcept(...types) {
  return ALL_TYPES.filter((type) => !types.includes(type));
}
