/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Parse an explicit ISO timestamp with a timezone, or epoch milliseconds.
 * @param {unknown} value The portal's publication timestamp.
 * @returns {number|undefined} Epoch milliseconds, or undefined for an invalid date.
 */
export function publicationDate(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 && Number.isFinite(new Date(value).getTime()) ? value : undefined;
  }
  if (typeof value !== 'string') return undefined;
  const iso = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!iso) return undefined;
  const [, year, month, day] = iso.map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : undefined;
}
