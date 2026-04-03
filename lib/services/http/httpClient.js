/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { getSettings } from '../storage/settingsStorage.js';

let cachedAgent = null;
let cachedProxyUrl = null;

/**
 * Parse a proxy URL into its components.
 * @param {string} proxyUrlString
 * @returns {{ serverUrl: string, username: string|null, password: string|null }}
 */
export function parseProxyUrl(proxyUrlString) {
  const url = new URL(proxyUrlString);
  const username = url.username || null;
  const password = url.password || null;

  // Rebuild URL without auth
  url.username = '';
  url.password = '';
  // Remove trailing slash that URL adds
  const serverUrl = url.toString().replace(/\/$/, '');

  return { serverUrl, username, password };
}

/**
 * Resolve the proxy URL from settings or environment variables.
 * Priority: settings > FREDY_PROXY_URL > HTTPS_PROXY > HTTP_PROXY
 * @returns {string|null}
 */
function resolveProxyUrl() {
  const settings = getSettings();
  return settings?.proxyUrl || process.env.FREDY_PROXY_URL || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || null;
}

/**
 * Get or create a cached ProxyAgent for the current proxy URL.
 * @param {string} proxyUrl
 * @returns {Promise<import('undici').ProxyAgent>}
 */
async function getOrCreateAgent(proxyUrl) {
  if (cachedAgent && cachedProxyUrl === proxyUrl) {
    return cachedAgent;
  }

  const { ProxyAgent } = await import('undici');
  const parsed = parseProxyUrl(proxyUrl);
  const agentOptions = { uri: parsed.serverUrl };

  if (parsed.username) {
    const decoded = `${decodeURIComponent(parsed.username)}:${decodeURIComponent(parsed.password)}`;
    agentOptions.token = `Basic ${Buffer.from(decoded).toString('base64')}`;
  }

  cachedAgent = new ProxyAgent(agentOptions);
  cachedProxyUrl = proxyUrl;
  return cachedAgent;
}

/**
 * Central HTTP client for all scraping requests.
 * Wraps native fetch() and adds proxy support via undici ProxyAgent.
 *
 * @param {string|URL} url
 * @param {RequestInit} [options={}]
 * @returns {Promise<Response>}
 */
export async function scrapingFetch(url, options = {}) {
  const proxyUrl = resolveProxyUrl();

  if (!proxyUrl) {
    return fetch(url, options);
  }

  const agent = await getOrCreateAgent(proxyUrl);
  return fetch(url, { ...options, dispatcher: agent });
}

/**
 * Get proxy configuration for Puppeteer browser launch.
 * Returns the raw URL (for passing to launchBrowser which handles parsing),
 * the proxy URL without auth, and decoded credentials.
 *
 * @returns {{ rawUrl: string, proxyUrl: string, auth: { username: string, password: string }|null }|null}
 */
export function getProxyConfig() {
  const rawUrl = resolveProxyUrl();
  if (!rawUrl) {
    return null;
  }

  const parsed = parseProxyUrl(rawUrl);
  const auth = parsed.username
    ? { username: decodeURIComponent(parsed.username), password: decodeURIComponent(parsed.password) }
    : null;

  return { rawUrl, proxyUrl: parsed.serverUrl, auth };
}

/**
 * Clear the cached ProxyAgent. Call when proxy settings change.
 */
export function clearProxyCache() {
  cachedAgent = null;
  cachedProxyUrl = null;
}
