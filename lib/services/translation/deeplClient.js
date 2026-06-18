/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Thin wrapper around the DeepL translate API.
 *
 * Supports both the free tier (keys ending in `:fx`, uses api-free.deepl.com)
 * and the pro tier (all other keys, uses api.deepl.com).
 *
 * @module deeplClient
 */

/**
 * Returns the correct DeepL API base URL based on the API key tier.
 * Free-tier keys end with the suffix `:fx`.
 * @param {string} apiKey
 * @returns {string}
 */
function getApiUrl(apiKey) {
  return apiKey.endsWith(':fx')
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate';
}

/**
 * Translate a single text string using the DeepL API.
 * Source language is omitted so DeepL auto-detects it.
 *
 * @param {string} text - The text to translate.
 * @param {string} targetLang - Target language code in uppercase, e.g. 'EN' or 'DE'.
 * @param {string} apiKey - DeepL API authentication key.
 * @returns {Promise<string>} The translated text.
 * @throws {Error} If the API returns a non-OK status or an unexpected response shape.
 */
export async function translate(text, targetLang, apiKey) {
  const url = getApiUrl(apiKey);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: [text],
      target_lang: targetLang,
    }),
  });

  if (response.status === 429) {
    throw new Error('DeepL rate limit exceeded. Please try again later.');
  }

  if (!response.ok) {
    throw new Error(`DeepL API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (!data?.translations?.[0]?.text) {
    throw new Error('DeepL returned an unexpected response shape.');
  }

  return data.translations[0].text;
}
