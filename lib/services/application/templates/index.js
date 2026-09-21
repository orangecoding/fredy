/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import de from './de.js';
import en from './en.js';
import it from './it.js';

/**
 * The letters Fredy ships, by language and deal type.
 *
 * Renting and buying are genuinely different letters rather than one with a swapped noun: a rental
 * application is a self-disclosure and lives or dies on household, income and SCHUFA, while a
 * purchase enquiry is a viewing request backed by a financing statement. Sending the wrong one
 * reads as a form letter, which is exactly what this feature exists to avoid.
 *
 * @type {Record<string, { rent: string, buy: string }>}
 */
export const TEMPLATES = { de, en, it };

/** Languages a letter can be written in, which is what `pickLetterLanguage` chooses between. */
export const TEMPLATE_LANGUAGES = Object.freeze(Object.keys(TEMPLATES));

/** Deal type used when a job never declared one. Most jobs are rentals. */
const DEFAULT_DEAL_TYPE = 'rent';

/**
 * The shipped template for a language and deal type.
 *
 * Both arguments are forgiving on purpose - this is called with whatever the job row happened to
 * hold, and an unrecognised value must produce a letter rather than nothing.
 *
 * @param {string} language ISO 639-1 language code.
 * @param {string|null|undefined} dealType `rent` or `buy`.
 * @returns {string}
 */
export function defaultTemplate(language, dealType) {
  const set = TEMPLATES[language] ?? TEMPLATES.en;
  return dealType === 'buy' ? set.buy : set[DEFAULT_DEAL_TYPE];
}
