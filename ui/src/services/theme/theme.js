/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Which theme the interface is painted in, and how that choice reaches the document.
 *
 * The preference itself is a user setting like any other: it lives in the `settings` table under
 * `theme` and arrives with `/api/user/settings`. Nothing here caches it, and nothing here is a
 * second source of truth - this module only takes the value the store already holds and puts it
 * where CSS can see it.
 *
 * That place is one attribute on `<body>`. Semi UI already keys its own component styles off
 * `body[theme-mode=dark]`, and `ui/src/themes.less` hangs Fredy's palette off the same attribute,
 * so setting it switches both at once and nothing has to be re-rendered for the CSS to follow.
 */

/** @typedef {'dark'|'light'} Theme */

/** @type {Theme[]} */
export const THEMES = ['dark', 'light'];

/**
 * What an account gets before it has ever expressed a preference, and what the login screen shows.
 *
 * Dark, not the system setting: it is the theme Fredy was designed in and the one every existing
 * installation is already looking at, and silently repainting those the first time someone opens
 * the app on a light-mode laptop would be a change nobody asked for.
 *
 * `index.html` ships the same value on the body, so the first frame of a cold load already matches.
 *
 * @type {Theme}
 */
export const DEFAULT_THEME = 'dark';

/**
 * Coerce anything to a theme this app knows how to paint.
 *
 * @param {unknown} value
 * @returns {Theme}
 */
export function normalizeTheme(value) {
  return THEMES.includes(/** @type {Theme} */ (value)) ? /** @type {Theme} */ (value) : DEFAULT_THEME;
}

/**
 * The theme the document is painted in right now.
 *
 * For the handful of places that pick an asset rather than a colour - a wordmark has a light and a
 * dark cut, and no custom property can swap a PNG. Everything that can be expressed as a colour
 * should use the tokens instead and let CSS do the switching.
 *
 * @returns {Theme}
 */
export function currentTheme() {
  return normalizeTheme(document.body.getAttribute('theme-mode'));
}

/**
 * Paint the document in a theme.
 *
 * @param {unknown} theme Anything; unknown values fall back to {@link DEFAULT_THEME}.
 * @returns {Theme} The theme that was actually applied.
 */
export function applyTheme(theme) {
  const next = normalizeTheme(theme);
  document.body.setAttribute('theme-mode', next);
  return next;
}
