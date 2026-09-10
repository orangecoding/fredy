/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import * as cheerio from 'cheerio';

/**
 * Turn a block of markup - an advert description, as a portal stores it - into plain text.
 *
 * The line breaks have to survive the conversion, which is the whole reason this is not a bare tag
 * strip: a blacklisted term sitting at the start of a line would otherwise be glued onto the end of
 * the line before it, and the term nobody wants to read then matches nothing. `<br>` becomes one
 * newline and the end of a paragraph two, and a run of three or more collapses back to the blank
 * line that separates two paragraphs.
 *
 * Everything else is left to a parser rather than to a second regex: it is what decodes the
 * entities a portal escapes its text with, and it drops comments and the contents of a stray
 * attribute instead of taking them for text.
 *
 * The contract for the empty case is a string either way - nothing in, empty string out - because a
 * caller collecting several blocks filters the empty ones out anyway. A caller that stores null for
 * "no description" writes `toPlainText(value) || null` and gets its own answer back.
 *
 * @param {string|null|undefined} markup one block of text, possibly carrying markup
 * @returns {string} the block as plain text, empty when it carries none
 */
export function toPlainText(markup) {
  if (!markup) return '';

  const withBreaks = String(markup)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n');

  return cheerio
    .load(withBreaks)
    .root()
    .text()
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
