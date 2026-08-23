/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { getSettings } from '../services/storage/settingsStorage.js';

/**
 * The one place the OAuth resource identifier is spelled out.
 *
 * The authorization server stores it on every code and token, and the resource server compares
 * against it on every call, so both have to read the same value from the same source. Deriving it
 * from request headers on one side and from configuration on the other is how a working login
 * turns into a 401 on the first tool call behind a proxy that forgot `X-Forwarded-Proto` - and a
 * client-supplied `Host` is no audience binding at all.
 *
 * @returns {Promise<{baseUrl: string, resource: string} | null>} Null until `baseUrl` is configured.
 */
export async function mcpOAuthUrls() {
  const settings = await getSettings();
  const baseUrl = typeof settings.baseUrl === 'string' ? settings.baseUrl.trim().replace(/\/$/, '') : '';
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) return null;
  return { baseUrl, resource: `${baseUrl}/api/mcp` };
}
