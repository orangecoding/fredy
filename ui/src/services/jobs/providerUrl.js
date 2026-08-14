/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Whether the URL someone pasted is actually a search on the portal they picked.
 *
 * The check used to be host equality alone, which accepts `https://www.immobilienscout24.de/` - the
 * bare homepage, carrying none of the search the user just configured. That saves cleanly, runs on
 * schedule, and quietly finds nothing, which is the worst way for this to go wrong: everything
 * looks correct and no notification ever arrives.
 *
 * So a URL has to name the right host *and* carry something beyond it.
 */

/**
 * Why a URL was refused. `null` means it was not.
 *
 * @typedef {'noProvider'|'empty'|'unparsable'|'wrongHost'|'bareHost'|null} ProviderUrlProblem
 */

/**
 * A url reduced to its bare host, so that protocol and a leading `www.` do not cause a false
 * negative when comparing the user's input against the provider's base url.
 *
 * @param {string|null|undefined} url
 * @returns {string|null}
 */
export function normalizeHost(url) {
  if (url == null) {
    return null;
  }
  const trimmed = String(url).trim();
  if (trimmed.length === 0) {
    return null;
  }
  const withProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withProtocol).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Whether a URL carries anything past its host.
 *
 * A path of `/`, no query and no fragment means the user copied the address of the front page
 * rather than of their search results.
 *
 * @param {string} url
 * @returns {boolean}
 */
function carriesASearch(url) {
  const trimmed = String(url).trim();
  const withProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    return parsed.pathname.replace(/\/+$/, '').length > 0 || parsed.search.length > 0 || parsed.hash.length > 0;
  } catch {
    return false;
  }
}

/**
 * Check a pasted provider URL.
 *
 * @param {string|null|undefined} url
 * @param {{id: string, name: string, baseUrl: string}|null|undefined} provider
 * @returns {{ok: boolean, problem: ProviderUrlProblem, expectedHost: string|null}}
 */
export function validateProviderUrl(url, provider) {
  const expectedHost = normalizeHost(provider?.baseUrl);

  if (provider == null) {
    return { ok: false, problem: 'noProvider', expectedHost: null };
  }
  if (url == null || String(url).trim().length === 0) {
    return { ok: false, problem: 'empty', expectedHost };
  }

  const inputHost = normalizeHost(url);
  if (inputHost == null) {
    return { ok: false, problem: 'unparsable', expectedHost };
  }
  if (expectedHost == null || inputHost !== expectedHost) {
    return { ok: false, problem: 'wrongHost', expectedHost };
  }
  if (!carriesASearch(url)) {
    return { ok: false, problem: 'bareHost', expectedHost };
  }
  return { ok: true, problem: null, expectedHost };
}
