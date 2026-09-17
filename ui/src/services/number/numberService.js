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
 * `Intl.NumberFormat` is expensive to construct and a listings grid formats one figure per card, so
 * formatters are built once per locale and then reused.
 * @type {Map<string, Intl.NumberFormat>}
 */
const formatterCache = new Map();

/**
 * @param {string} locale BCP 47 locale.
 * @returns {Intl.NumberFormat}
 */
function decimalFormatter(locale) {
  let formatter = formatterCache.get(locale);
  if (formatter == null) {
    formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
    formatterCache.set(locale, formatter);
  }
  return formatter;
}

/**
 * A plain figure the way the reader's language writes one: `5,5` and `1.200` in German, `5.5` and
 * `1,200` in English. For the numbers that carry a unit rather than a currency - a room count, a
 * floor area - where `formatEuroPrice` would be wrong.
 *
 * Decimals appear only when the figure has them, so a four-room flat stays `4` rather than becoming
 * `4,00`, and anything past two decimals is noise on a figure a portal rounded itself.
 *
 * A value that is not a number is handed back as it came rather than printed as `NaN`, matching how
 * {@link formatEuroPrice} treats a provider writing text into a numeric field.
 *
 * @param {number|string} value
 * @param {string} [locale='de-DE'] BCP 47 locale, from `useLocale()` inside components.
 * @returns {string}
 */
export const formatDecimal = (value, locale = DEFAULT_LOCALE) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return String(value);
  }
  return decimalFormatter(locale || DEFAULT_LOCALE).format(parsed);
};
