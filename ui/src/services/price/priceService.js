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
 * @returns {string}
 */
export const formatEuroPrice = (price) => {
  const parsedPrice = Number(price);
  if (!Number.isFinite(parsedPrice)) {
    return `${price} €`;
  }

  return `${euroPriceFormatter.format(parsedPrice)} €`;
};
