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

/**
 * The formatter that reads an instant back as the wall clock of a zone. Building one is expensive
 * enough to be worth keeping, and a run reads a whole page of adverts through the same zone.
 */
const zoneReaders = new Map();

function zoneReader(timeZone) {
  let reader = zoneReaders.get(timeZone);
  if (reader == null) {
    reader = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    zoneReaders.set(timeZone, reader);
  }
  return reader;
}

/**
 * What the zone was offset from UTC by at that instant, in milliseconds.
 *
 * @param {number} instant Epoch milliseconds.
 * @param {string} timeZone An IANA zone name.
 * @returns {number} The offset, positive east of Greenwich.
 */
function offsetAt(instant, timeZone) {
  const parts = {};
  for (const { type, value } of zoneReader(timeZone).formatToParts(instant)) {
    if (type !== 'literal') parts[type] = Number(value);
  }
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - instant;
}

/**
 * Read a wall clock that names no zone as a time in the zone it was written in.
 *
 * A portal that stamps `14:30` means half past two where its offices are, and half the year that is
 * two hours off UTC rather than one. Reading such a stamp as UTC puts an advert edited this
 * afternoon in the future, which is what `Date.now()` comparisons downstream trip over.
 *
 * The offset has to be looked up at the instant the stamp names, not at the moment of reading, or a
 * summer advert read in winter lands an hour out. It is looked up twice because the first lookup
 * can only guess the instant: on the two days a year the clocks move, the guess and the answer sit
 * on different sides of the change.
 *
 * @param {{year: number, month: number, day: number, hour?: number, minute?: number, second?: number}} wallClock
 *   The stamp as written, with a one-based month.
 * @param {string} timeZone The IANA zone the portal writes its stamps in.
 * @returns {number} Epoch milliseconds.
 */
export function wallClockInZone({ year, month, day, hour = 0, minute = 0, second = 0 }, timeZone) {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const guess = asUtc - offsetAt(asUtc, timeZone);
  return asUtc - offsetAt(guess, timeZone);
}
