/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Used when no locale is passed. Components have one from `useLocale()`; the map popup builds plain
 * markup outside React and gets it handed down from the view.
 * @type {string}
 */
const DEFAULT_LOCALE = 'de-DE';

/**
 * `Intl.NumberFormat` is expensive to construct and a listings grid formats one price per card, so
 * formatters are built once per locale and precision and then reused.
 * @type {Map<string, Intl.NumberFormat>}
 */
const formatterCache = new Map();

/**
 * @param {string} locale BCP 47 locale.
 * @param {number} fractionDigits Exact number of decimals to print.
 * @returns {Intl.NumberFormat}
 */
function euroFormatter(locale, fractionDigits) {
  const key = `${locale}:${fractionDigits}`;
  let formatter = formatterCache.get(key);
  if (formatter == null) {
    formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    formatterCache.set(key, formatter);
  }
  return formatter;
}

/**
 * A price the way the reader's language writes one, grouping and currency symbol included:
 * `776.515 €` in German, `€776,515` in English.
 *
 * Cents appear only when the price actually has them. Asking prices come in whole euros and a
 * permanent `,00` behind six figures is noise, while a price that does carry cents still prints
 * both digits rather than the single one a plain `maximumFractionDigits` would leave.
 *
 * A value that is not a number is handed back as it came, with a bare symbol appended: it is
 * usually a provider writing "auf Anfrage" into the price field, and mangling that into `NaN €`
 * helps nobody.
 *
 * @param {number|string} price
 * @param {string} [locale='de-DE'] BCP 47 locale, from `useLocale()` inside components.
 * @returns {string}
 */
export const formatEuroPrice = (price, locale = DEFAULT_LOCALE) => {
  const parsedPrice = Number(price);
  if (!Number.isFinite(parsedPrice)) {
    return `${price} €`;
  }

  return euroFormatter(locale || DEFAULT_LOCALE, Number.isInteger(parsedPrice) ? 0 : 2).format(parsedPrice);
};
