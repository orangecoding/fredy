/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * A cache of answers to a lookup, keyed by whatever was asked.
 *
 * The promise is what is cached rather than the value it settles with, so two callers asking for
 * the same key while the first request is still in flight share that request instead of making a
 * second one - which is the case that matters here, because several jobs run at once and ask the
 * same portal about the same town.
 *
 * A rejected promise is dropped again. Caching it would turn one refused request into a permanent
 * answer for the lifetime of the process, and a portal that was briefly unreachable would stay
 * unreachable until Fredy restarted. A resolved `null` - the portal answered and knows no such
 * place - is a real answer and stays.
 *
 * @template T
 * @returns {{get: (key: string, load: () => Promise<T>) => Promise<T>, clear: () => void}} the
 *   cache: `get` answers from it or fills it, `clear` empties it
 */
export function createPromiseCache() {
  /** @type {Map<string, Promise<T>>} */
  const entries = new Map();

  return {
    get(key, load) {
      const cached = entries.get(key);
      if (cached !== undefined) return cached;

      const pending = load().catch((error) => {
        entries.delete(key);
        throw error;
      });
      entries.set(key, pending);
      return pending;
    },

    clear() {
      entries.clear();
    },
  };
}
