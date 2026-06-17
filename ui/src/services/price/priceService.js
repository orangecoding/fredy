/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

const euroPriceFormatter = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * @param {number|string} price
 * @param {string} [currency='€']
 * @returns {string}
 */
export const formatEuroPrice = (price, currency = '€') => {
  const parsedPrice = Number(price);
  if (!Number.isFinite(parsedPrice)) {
    return `${price} ${currency}`;
  }

  return `${euroPriceFormatter.format(parsedPrice)} ${currency}`;
};
