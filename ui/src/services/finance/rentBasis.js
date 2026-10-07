/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * How a listing quotes its rent, and which of the household's ceilings that holds it against.
 *
 * Almost every portal quotes a rent cold, which is why the renting ceilings are cold rents with the
 * Nebenkosten surcharge allowed for. Some quote it with the running charges in it instead - a French
 * rent "charges comprises", an immowelt Warmmiete - and such a rent is already what the household
 * pays, so the server judges it against the warm ceilings. The verdict arrives decided; what is left
 * for the browser is to quote the ceiling it was actually measured against, and to name the figure
 * for what it is. That is all this file does - no finance math lives in `ui/src`.
 *
 * Kept free of React so a plain Node test can reach it.
 */

/**
 * Whether a listing row's rent already has the running charges in it.
 *
 * `charges_included` is 1 with them, 0 without, and null where the portal does not say - which
 * reads as without, the way every German portal quotes a rent. The server reads the column the same
 * way when it decides the verdict.
 *
 * @param {{charges_included?: (number|boolean|null)}|null|undefined} listing A row as the listings API returns it.
 * @returns {boolean}
 */
export function rentIncludesCharges(listing) {
  const flag = listing?.charges_included;
  return flag === 1 || flag === true;
}

/**
 * The sentence a verdict explains itself with, and the ceiling that sentence quotes.
 *
 * @param {'affordable'|'stretch'|'unaffordable'} verdict
 * @param {{dealType?: ('rent'|'buy'|null), chargesIncluded?: boolean}} basis How the listing's price is meant.
 * @param {{buy: Object|null, rent: Object|null}|null|undefined} thresholds As `useFinanceProfile` returns them.
 * @returns {{key: string, limit: number|null}} A translation key taking `price`, and the figure for it.
 */
export function verdictExplanation(verdict, { dealType, chargesIncluded = false } = {}, thresholds) {
  if (dealType !== 'rent') {
    return { key: `listings.affordabilityTooltip.${verdict}`, limit: thresholds?.buy?.affordableMaxPrice ?? null };
  }
  if (chargesIncluded) {
    return {
      key: `listings.rentInclChargesAffordabilityTooltip.${verdict}`,
      limit: thresholds?.rent?.warmAffordable ?? null,
    };
  }
  return { key: `listings.rentAffordabilityTooltip.${verdict}`, limit: thresholds?.rent?.affordableMaxRent ?? null };
}

/**
 * The help text beside the affordability filter, naming the ceilings it filters by.
 *
 * One page of rentals can hold rents of both kinds, and the filter holds each against its own
 * ceiling, so the rent texts name the warm one beside the cold one.
 *
 * @param {{buy: Object|null, rent: Object|null}} thresholds As `useFinanceProfile` returns them.
 * @param {{t: (key: string, params?: Object) => string, locale: string, formatEuro: (value: number, locale: string) => string}} ctx
 * @returns {string}
 */
export function affordabilityFilterHelp(thresholds, { t, locale, formatEuro }) {
  const { buy, rent } = thresholds ?? {};
  if (buy != null && rent != null) {
    return t('listings.filterAffordabilityBothHelp', {
      price: formatEuro(buy.affordableMaxPrice, locale),
      rent: formatEuro(rent.affordableMaxRent, locale),
      warm: formatEuro(rent.warmAffordable, locale),
    });
  }
  if (buy != null) {
    return t('listings.filterAffordabilityHelp', { price: formatEuro(buy.affordableMaxPrice, locale) });
  }
  return t('listings.filterAffordabilityRentHelp', {
    price: formatEuro(rent?.affordableMaxRent, locale),
    warm: formatEuro(rent?.warmAffordable, locale),
  });
}

/**
 * The ceilings the renting tab lists under its one input, each naming `finance.rent.<key>` and
 * `finance.rent.<key>Help`.
 *
 * Both pairs: a listing quoting a cold rent is held against the cold ones, a listing quoting its rent
 * with the charges in it against the warm ones, and either kind can turn up in the same search.
 *
 * @param {Object|null} thresholds The rent half of the thresholds.
 * @param {Object|null} budget The household budget for the same draft.
 * @param {{locale: string, formatEuro: (value: number, locale: string) => string}} ctx
 * @returns {Array<{key: string, value: string, emphasis: boolean}>} Empty until both are there.
 */
export function rentCeilingFacts(thresholds, budget, { locale, formatEuro }) {
  if (thresholds == null || budget == null) {
    return [];
  }
  return [
    { key: 'maxCold', value: formatEuro(thresholds.affordableMaxRent, locale), emphasis: true },
    { key: 'maxWarm', value: formatEuro(thresholds.warmAffordable, locale), emphasis: true },
    { key: 'stretchCold', value: formatEuro(thresholds.stretchMaxRent, locale), emphasis: false },
    { key: 'stretchWarm', value: formatEuro(thresholds.warmStretch, locale), emphasis: false },
    { key: 'disposable', value: formatEuro(budget.disposable, locale), emphasis: false },
  ];
}

/**
 * What kind of figure the listed price of a scored listing is, for the line under it.
 *
 * @param {{dealType?: ('rent'|'buy'), chargesIncluded?: boolean}} record A listing as the affordability sweep scored it.
 * @returns {string} A translation key.
 */
export function listedPriceKey(record) {
  if (record?.dealType !== 'rent') {
    return 'finance.table.priceIsPurchase';
  }
  return record.chargesIncluded ? 'finance.table.priceIsWarmRent' : 'finance.table.priceIsColdRent';
}
