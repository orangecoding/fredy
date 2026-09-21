/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The plain-text template engine behind application letters.
 *
 * Deliberately not Handlebars, although it is already a dependency: that copy is bound to the HTML
 * mail templates, and the three rules below are the whole language. The syntax is the same
 * `{{name}}` the interface translations already use, so there is one placeholder syntax in the
 * product rather than two.
 *
 * 1. `{{key}}` is replaced by its value.
 * 2. `{{key|text}}` falls back to `text` when the value is empty - this is how a letter addresses
 *    "Damen und Herren" when the portal published no agent name.
 * 3. A line that holds at least one placeholder, and whose placeholders all resolved empty, is
 *    dropped whole. This is what keeps a half-filled profile from producing `Beruf:` on a line of
 *    its own, and it is why the shipped templates state one fact per line.
 *
 * A placeholder that is not in the value map is left in the text verbatim and reported, so the
 * template editor can point at a typo instead of silently swallowing it.
 */

/**
 * `{{ key }}` or `{{ key|fallback }}`. Keys are word characters and dots, never whitespace.
 *
 * The fallback group is greedy and nothing follows it but the closing braces. A lazy group with a
 * trailing `\s*` let both halves consume the same whitespace, which turned a 20 000-character line
 * of spaces into ~400 ms of backtracking on an endpoint the template editor calls on every pause
 * in typing. The captured fallback is trimmed below, so greed costs nothing.
 */
const PLACEHOLDER = /\{\{\s*([\w.]+)\s*(?:\|([^}]*))?\}\}/g;

/**
 * @typedef {Object} RenderedTemplate
 * @property {string} text The finished letter.
 * @property {string[]} missing Keys that resolved empty with no fallback, first use first.
 * @property {string[]} unknown Placeholder names the value map does not know, first use first.
 */

/**
 * Render a template against a flat map of values.
 *
 * @param {string|null|undefined} template Raw template text.
 * @param {Record<string, unknown>} values Flat placeholder map; see `placeholders.js`.
 * @returns {RenderedTemplate}
 */
export function renderTemplate(template, values) {
  if (typeof template !== 'string' || template.length === 0) {
    return { text: '', missing: [], unknown: [] };
  }

  const missing = [];
  const unknown = [];
  const kept = [];

  for (const line of template.split('\n')) {
    let placeholders = 0;
    let resolved = 0;

    // The replacer's return value is never rescanned, so a value that happens to look like a
    // placeholder is copied through as text rather than expanded a second time.
    const substituted = line.replace(PLACEHOLDER, (match, key, fallback) => {
      // `Object.hasOwn` rather than `in`: `{{constructor}}` would otherwise resolve off the
      // prototype and put a function body in somebody's letter.
      if (!Object.hasOwn(values, key)) {
        if (!unknown.includes(key)) unknown.push(key);
        return match;
      }

      placeholders += 1;

      const raw = values[key];
      const value = raw == null ? '' : String(raw).trim();
      if (value.length > 0) {
        resolved += 1;
        return value;
      }

      const fallbackText = typeof fallback === 'string' ? fallback.trim() : '';
      if (fallbackText.length > 0) {
        resolved += 1;
        return fallbackText;
      }

      if (!missing.includes(key)) missing.push(key);
      return '';
    });

    if (placeholders > 0 && resolved === 0) continue;

    // Collapse the ragged run of spaces a removed placeholder leaves mid-line. Safe here because
    // the output is a letter, never anything whose indentation carries meaning.
    kept.push(substituted.replace(/[ \t]+/g, ' ').trim());
  }

  const text = kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { text, missing, unknown };
}
