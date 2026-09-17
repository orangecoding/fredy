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
 * Every host a provider's searches may be on.
 *
 * Most portals have one, and `baseUrl` is it. A portal serving several countries as several domains
 * declares them all - immowelt as `.de` and `.at`, idealista as `.com`, `.it` and `.pt` - and
 * comparing against `baseUrl` alone is what used to refuse a perfectly good Austrian or Italian
 * search with "that address is not on immowelt.de".
 *
 * @param {{baseUrl?: string, hosts?: string[]}|null|undefined} provider
 * @returns {string[]} bare hosts, possibly empty when the provider declares nothing usable.
 */
function hostsOf(provider) {
  const declared = Array.isArray(provider?.hosts) && provider.hosts.length > 0 ? provider.hosts : [provider?.baseUrl];
  return [...new Set(declared.map(normalizeHost).filter((host) => host != null))];
}

/**
 * Check a pasted provider URL.
 *
 * @param {string|null|undefined} url
 * @param {{id: string, name: string, baseUrl: string, hosts?: string[]}|null|undefined} provider
 * @returns {{ok: boolean, problem: ProviderUrlProblem, expectedHost: string|null}} `expectedHost`
 *   names every accepted host, comma separated, because it is what the error message shows the
 *   user. Joined with a comma rather than an "or" so that no English word leaks into de.json and
 *   tr.json, which interpolate it as `{{host}}`.
 */
export function validateProviderUrl(url, provider) {
  const expectedHosts = hostsOf(provider);
  const expectedHost = expectedHosts.length > 0 ? expectedHosts.join(', ') : null;

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
  if (!expectedHosts.includes(inputHost)) {
    return { ok: false, problem: 'wrongHost', expectedHost };
  }
  if (!carriesASearch(url)) {
    return { ok: false, problem: 'bareHost', expectedHost };
  }
  return { ok: true, problem: null, expectedHost };
}
