/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * "Where does this channel lead?", answered without knowing anything about a specific adapter.
 *
 * Adapters declare `target: true` on the one field that names the destination - a chat id, a
 * channel, a recipient address. Both the target lookup and the fallback skip `secret` fields, so no
 * path here can ever surface a credential: for ntfy, the topic *is* the credential, which is why it
 * is marked secret and the server name is the target instead. The fallback beyond that exists so an
 * adapter that declares no target still produces something better than a blank cell, and a field
 * marked both `target: true` and `secret: true` - a destination that is also a credential - falls
 * through it to the adapter name, the same as any other adapter with nothing safe to show.
 *
 * @param {{id: string, name: string, fields?: Record<string, {type?: string, secret?: boolean, target?: boolean}>}|null} adapterConfig
 * @param {Record<string, any>} fields - The channel's stored values.
 * @returns {string|null} Display text, or null when the adapter no longer exists.
 */
export function describeChannel(adapterConfig, fields) {
  if (adapterConfig == null) return null;
  const values = fields ?? {};
  const entries = Object.entries(adapterConfig.fields ?? {});

  const hasValue = (key) => {
    const value = values[key];
    return value != null && String(value).trim().length > 0;
  };

  const target = entries.find(([, definition]) => definition?.target === true && definition?.secret !== true);
  if (target && hasValue(target[0])) return String(values[target[0]]);

  const firstVisible = entries.find(
    ([key, definition]) => definition?.secret !== true && definition?.type !== 'boolean' && hasValue(key),
  );
  if (firstVisible) return String(values[firstVisible[0]]);

  return adapterConfig.name;
}

/**
 * Build a field bag that is safe to hand to a client.
 *
 * Only keys the adapter currently declares are emitted, so a value left behind by a field that was
 * renamed or removed can never be sent out. With `reveal: false` every `secret` field comes back as
 * an empty string rather than being omitted, so the form still renders the input.
 *
 * A field that has never been set falls back to a value of its declared type - `false` for a
 * boolean, an empty string otherwise - so a checkbox is not handed the string `''` and forced to
 * decide what that means.
 *
 * @param {{fields?: Record<string, {secret?: boolean, type?: string}>}|null} adapterConfig
 * @param {Record<string, any>} fields
 * @param {{reveal: boolean}} options
 * @returns {Record<string, any>}
 */
export function redactSecrets(adapterConfig, fields, { reveal }) {
  const values = fields ?? {};
  const result = {};
  for (const [key, definition] of Object.entries(adapterConfig?.fields ?? {})) {
    const empty = definition?.type === 'boolean' ? false : '';
    if (definition?.secret === true && !reveal) {
      result[key] = empty;
      continue;
    }
    result[key] = values[key] ?? empty;
  }
  return result;
}
