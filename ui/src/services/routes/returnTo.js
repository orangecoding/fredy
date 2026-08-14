/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Where to send someone back to after a detour.
 *
 * The job form sends people to the notification settings to create a channel, and wants to offer
 * them a way back. The destination therefore travels in the URL - and a destination that travels in
 * the URL is one an attacker can set, so it is checked rather than trusted: a crafted link like
 * `#/settings/notifications?returnTo=https://evil.example` must not turn Fredy's own "back" button
 * into a way off the site.
 *
 * Only same-document paths survive. Anything carrying a scheme, a host, or a backslash - which some
 * browsers normalise to a forward slash, making `/\evil.example` protocol-relative in practice - is
 * refused outright rather than repaired, because a value this small is not worth guessing at.
 */

/**
 * Long enough for any route in the app plus its query, short enough that a hostile link cannot use
 * it to stuff the URL.
 * @type {number}
 */
const MAX_LENGTH = 512;

/**
 * Control characters, which have no business in a route.
 *
 * They are also how a scheme gets smuggled past a naive prefix check: browsers strip tabs and
 * newlines before parsing a URL, so a value that reads as a path here can parse as `javascript:`
 * there.
 * @type {RegExp}
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

/**
 * Reduce a caller-supplied return path to one that is safe to navigate to.
 *
 * @param {*} value The raw `returnTo` value, typically straight out of the query string.
 * @returns {string|null} A path beginning with a single `/`, or null when it cannot be trusted.
 */
export function sanitizeReturnTo(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();

  if (trimmed.length === 0 || trimmed.length > MAX_LENGTH) {
    return null;
  }
  // Must be a path on this site, and only one leading slash: `//evil.example` and `/\evil.example`
  // are both read as "another origin" by browsers.
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
    return null;
  }
  if (CONTROL_CHARACTERS.test(trimmed) || trimmed.includes('\\')) {
    return null;
  }
  return trimmed;
}

/**
 * The destination with a return path attached, ready to navigate to.
 *
 * @param {string} to The path being navigated to.
 * @param {string} from The path to come back to.
 * @returns {string} `to` unchanged when `from` cannot be trusted.
 */
export function withReturnTo(to, from) {
  const safe = sanitizeReturnTo(from);
  if (safe == null) {
    return to;
  }
  return `${to}${to.includes('?') ? '&' : '?'}returnTo=${encodeURIComponent(safe)}`;
}
