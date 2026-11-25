/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * A character that continues a word. Unicode-aware, so umlauts and ß count as letters and
 * "geförderte" ends where the word ends, not at the ö.
 */
const WORD_CHAR = '[\\p{L}\\p{N}]';

/**
 * @param {string} text
 * @returns {string}
 */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Both sides of a comparison go through this, so case and the composed/decomposed spelling of an
 * umlaut never decide a match.
 *
 * @param {string} text
 * @returns {string}
 */
function normalize(text) {
  return text.normalize('NFC').toLowerCase();
}

/**
 * Compile one term into a global regex over normalized text. A term in double quotes matches only
 * as a whole word (or phrase); anything else is a literal substring, exactly as the blacklist always
 * matched. A pair of quotes with nothing inside stays a literal, so no entry is ever lost.
 *
 * @param {string} term
 * @returns {RegExp}
 */
function compileTerm(term) {
  const trimmed = term.trim();
  const quoted = trimmed.length > 2 && trimmed.startsWith('"') && trimmed.endsWith('"');
  const word = quoted ? trimmed.slice(1, -1).trim() : '';
  if (word.length > 0) {
    return new RegExp(`(?<!${WORD_CHAR})${escapeRegExp(normalize(word))}(?!${WORD_CHAR})`, 'gu');
  }
  return new RegExp(escapeRegExp(normalize(term)), 'gu');
}

/**
 * Every occurrence of a pattern as `[start, end)`, overlapping ones included, so an occurrence
 * hidden by an exception cannot shadow the next one starting inside it.
 *
 * @param {RegExp} pattern A global regex.
 * @param {string} text
 * @returns {Array<[number, number]>}
 */
function occurrences(pattern, text) {
  const found = [];
  pattern.lastIndex = 0;
  for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
    found.push([match.index, match.index + match[0].length]);
    pattern.lastIndex = match.index + 1;
  }
  return found;
}

/**
 * Compile a job's blacklist once into a matcher for the texts of its listings.
 *
 * Entries come in three forms:
 * - `befristet`: a substring, ignoring case. The original behaviour, unchanged.
 * - `"tausch"`: a whole word, bounded by anything that is not a Unicode letter or digit. Matches
 *   "nur Tausch", not "Austausch".
 * - `!unbefristet`: an exception. Text it covers is ignored by the other entries, so `befristet` plus
 *   `!unbefristet` drops "befristet bis 2027" and keeps "unbefristet". An exception can be quoted as
 *   well (`!"austausch"`) and filters nothing on its own.
 *
 * A match is ignored when it overlaps an exception occurrence, which is what cutting the exception
 * out of the text would do, without gluing its neighbours into a new word that could match.
 *
 * @param {string[]|null|undefined} entries
 * @returns {{ test(text: string|null|undefined): boolean }}
 */
export function compileBlacklist(entries) {
  const terms = [];
  const exceptions = [];
  for (const raw of entries ?? []) {
    const entry = String(raw);
    const trimmed = entry.trim();
    if (trimmed.length > 1 && trimmed.startsWith('!')) {
      exceptions.push(compileTerm(trimmed.slice(1).trim()));
    } else {
      terms.push(compileTerm(entry));
    }
  }

  return {
    test(text) {
      if (text == null || terms.length === 0) return false;
      const haystack = normalize(String(text));
      const excluded = exceptions.flatMap((pattern) => occurrences(pattern, haystack));
      return terms.some((pattern) =>
        occurrences(pattern, haystack).some(([start, end]) => !excluded.some(([from, to]) => start < to && from < end)),
      );
    },
  };
}
