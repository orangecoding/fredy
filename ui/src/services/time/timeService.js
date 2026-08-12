/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

export function format(ts, showSeconds = true, locale = 'default') {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    ...(showSeconds ? { second: 'numeric' } : {}),
  }).format(ts);
}

/**
 * The IANA zones this browser knows, as Select options, with the stored one folded in.
 *
 * Two things this has to survive. `Intl.supportedValuesOf` is missing on older browsers, which
 * would otherwise leave the operator with an empty dropdown and no way to see or keep their
 * setting. And a value saved on the server may be a name the browser's list does not carry -
 * `US/Eastern` and the other legacy names resolve everywhere but are not listed - where a Select
 * silently renders nothing for a value that has no matching option, making a configured zone look
 * unset.
 *
 * @param {string|null} [current] The stored zone.
 * @returns {{value: string, label: string}[]} Sorted options.
 */
export function timeZoneOptions(current) {
  const supported = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  const zones = new Set(supported.length > 0 ? supported : ['UTC', Intl.DateTimeFormat().resolvedOptions().timeZone]);
  if (typeof current === 'string' && current.length > 0) {
    zones.add(current);
  }
  return [...zones].sort().map((zone) => ({ value: zone, label: zone.replace(/_/g, ' ') }));
}
