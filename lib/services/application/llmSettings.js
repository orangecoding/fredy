/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The global settings behind LLM application drafts, and the rules for reading and saving them.
 *
 * Kept free of imports on purpose: the settings route needs these rules and nothing else, and the
 * draft generator next door pulls in the letter builder, the provider registry and an HTTP client.
 */

/** Switches LLM application drafts on. Off, and absent, means off. */
export const LLM_ENABLED_SETTING = 'llmEnabled';
/** OpenAI-compatible base URL of the endpoint, e.g. `https://api.openai.com/v1`. */
export const LLM_BASE_URL_SETTING = 'llmBaseUrl';
/** Model id to request from the endpoint. */
export const LLM_MODEL_SETTING = 'llmModel';
/**
 * API key, sent as a bearer token when set. Write-only: listed in `NON_SERIALIZABLE_SETTINGS`, so
 * it never leaves the server in a settings response.
 */
export const LLM_API_KEY_SETTING = 'llmApiKey';

/**
 * A settings value as a trimmed string, or `''` for anything that is not a string.
 *
 * @param {any} value
 * @returns {string}
 */
function trimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Whatever a request body carried, as a trimmed string. `null` and `undefined` become `''`.
 *
 * @param {any} value
 * @returns {string}
 */
function asTrimmedString(value) {
  return value == null ? '' : String(value).trim();
}

/**
 * Whether a value parses as an http or https URL.
 *
 * @param {any} value
 * @returns {boolean}
 */
export function isHttpUrl(value) {
  try {
    const { protocol } = new URL(trimmed(value));
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Whether the operator switched LLM application drafts on.
 *
 * @param {Record<string, any>|null|undefined} settings Global settings as `getSettings()` returns them.
 * @returns {boolean}
 */
export function isLlmDraftEnabled(settings) {
  return settings?.[LLM_ENABLED_SETTING] === true;
}

/**
 * Whether the endpoint can be called: an http(s) base URL and a model.
 *
 * The key is not required. A local server (Ollama, LM Studio, llama.cpp) answers without one, and
 * requiring it made the feature impossible to switch on for exactly the setups that cost nothing.
 *
 * @param {Record<string, any>|null|undefined} settings Global settings as `getSettings()` returns them.
 * @returns {boolean}
 */
export function isLlmDraftConfigured(settings) {
  return isHttpUrl(settings?.[LLM_BASE_URL_SETTING]) && trimmed(settings?.[LLM_MODEL_SETTING]).length > 0;
}

/**
 * Whether an API key is stored. What the settings form may know about the key, instead of the key.
 *
 * @param {Record<string, any>|null|undefined} settings Global settings as `getSettings()` returns them.
 * @returns {boolean}
 */
export function hasLlmApiKey(settings) {
  return trimmed(settings?.[LLM_API_KEY_SETTING]).length > 0;
}

/**
 * The endpoint as the draft generator calls it, trimmed. Only meaningful once
 * {@link isLlmDraftConfigured} said yes.
 *
 * @param {Record<string, any>} settings Global settings as `getSettings()` returns them.
 * @returns {{ baseUrl: string, model: string, apiKey: string }} `apiKey` is `''` when none is stored.
 */
export function llmEndpointOf(settings) {
  return {
    baseUrl: trimmed(settings?.[LLM_BASE_URL_SETTING]).replace(/\/+$/, ''),
    model: trimmed(settings?.[LLM_MODEL_SETTING]),
    apiKey: trimmed(settings?.[LLM_API_KEY_SETTING]),
  };
}

/**
 * Normalise the LLM fields of a settings save, in place.
 *
 * The key follows the proxy secret's contract: the form never receives it, so it posts an empty
 * value on every save, and an empty value has to mean "keep the stored key" or saving any other
 * field on the page would erase it. Removing the key is therefore its own, explicit value: `null`.
 * The read-only `llmApiKeySet` flag the GET adds is dropped, so a client echoing it back cannot
 * store it as a setting.
 *
 * @param {Record<string, any>} appSettings The request body, minus what the route took out already.
 * @returns {string|null} An error message for a 400, or null when the save may go ahead.
 */
export function prepareLlmSettings(appSettings) {
  delete appSettings.llmApiKeySet;

  if (typeof appSettings[LLM_ENABLED_SETTING] !== 'undefined') {
    appSettings[LLM_ENABLED_SETTING] = appSettings[LLM_ENABLED_SETTING] === true;
  }

  if (typeof appSettings[LLM_BASE_URL_SETTING] !== 'undefined') {
    const baseUrl = asTrimmedString(appSettings[LLM_BASE_URL_SETTING]);
    // Empty is allowed: it is what the field holds while the feature is off, and refusing it would
    // make the whole page unsaveable for everyone who never set the feature up.
    if (baseUrl.length > 0 && !isHttpUrl(baseUrl)) {
      return `${LLM_BASE_URL_SETTING} must be an http or https URL.`;
    }
    appSettings[LLM_BASE_URL_SETTING] = baseUrl;
  }

  if (typeof appSettings[LLM_MODEL_SETTING] !== 'undefined') {
    appSettings[LLM_MODEL_SETTING] = asTrimmedString(appSettings[LLM_MODEL_SETTING]);
  }

  if (appSettings[LLM_API_KEY_SETTING] === null) {
    appSettings[LLM_API_KEY_SETTING] = '';
  } else if (typeof appSettings[LLM_API_KEY_SETTING] !== 'undefined') {
    const apiKey = asTrimmedString(appSettings[LLM_API_KEY_SETTING]);
    if (apiKey.length === 0) {
      delete appSettings[LLM_API_KEY_SETTING];
    } else {
      appSettings[LLM_API_KEY_SETTING] = apiKey;
    }
  }

  return null;
}
