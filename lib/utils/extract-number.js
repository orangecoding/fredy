/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Extract the first number from a string like "1.234 €" or "70 m²".
 * Removes dots/commas before parsing. Returns null on invalid input.
 * @param {string|undefined|null} str
 * @returns {number|null}
 */
export const extractNumber = (str) => {
  if (str == null) return null;
  if (typeof str === 'number') return str;
  const cleaned = str.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
};
