/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Extract the first number from a string like "1.234 €", "3,5 Zi." or "3.5 Zimmer".
 *
 * Handles both German formatting (dot = thousands separator, comma = decimal) and
 * English/Swiss formatting (dot = decimal). The heuristic: a dot is a thousands
 * separator only when it is followed by exactly three digits (e.g. "1.234"). In all
 * other positions it is treated as a decimal point (e.g. "3.5"). A lone comma is
 * always treated as the decimal separator.
 *
 * Returns null when the input is null/undefined or cannot be parsed into a number.
 *
 * @param {string|undefined|null} str
 * @returns {number|null}
 */
export const extractNumber = (str) => {
  if (str == null) return null;
  if (typeof str === 'number') return str;
  // Remove dots that are thousands separators (dot followed by exactly three digits
  // before a non-digit or end-of-string), then convert a remaining comma to a decimal point.
  const cleaned = str.replace(/\.(\d{3})(?=\D|$)/g, '$1').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
};
