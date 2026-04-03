/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useCallback } from 'react';

// Preset parsers for common types
export const parseString = {
  parse: (v) => v,
  stringify: (v) => v,
};

export const parseNumber = {
  parse: (v) => Number(v),
  stringify: (v) => String(v),
};

export const parseBoolean = {
  parse: (v) => v === 'true',
  stringify: (v) => String(v),
};

// For state that is null | true | false
export const parseNullableBoolean = {
  parse: (v) => (v === 'true' ? true : v === 'false' ? false : null),
  stringify: (v) => (v === null ? null : String(v)),
};

/**
 * Drop-in replacement for useState that syncs with URL search params.
 * Uses replace: true so filter changes don't add browser history entries.
 *
 * Requires a shared [searchParams, setSearchParams] pair from a single
 * useSearchParams() call in the component. This ensures multiple hooks
 * in the same component don't overwrite each other's params.
 *
 * @param {[URLSearchParams, Function]} searchParamsPair - from useSearchParams()
 * @param {string} key - URL search param key
 * @param {*} defaultValue - value when param is absent
 * @param {{ parse: (s: string) => *, stringify: (v: *) => string|null }} [options]
 */
// WeakMap to store pending batched updates per setSearchParams function.
// This lets multiple useSearchParamState hooks on the same component batch
// their changes into a single setSearchParams call, preventing them from
// overwriting each other.
const pendingUpdates = new WeakMap();

export function useSearchParamState([searchParams, setSearchParams], key, defaultValue, options = {}) {
  const { parse = (v) => v, stringify = (v) => String(v) } = options;

  const rawValue = searchParams.get(key);
  const value = rawValue !== null ? parse(rawValue) : defaultValue;

  const setValue = useCallback(
    (newValue) => {
      // Collect the change
      if (!pendingUpdates.has(setSearchParams)) {
        pendingUpdates.set(setSearchParams, new Map());

        // Schedule a single flush at the end of the current microtask
        queueMicrotask(() => {
          const updates = pendingUpdates.get(setSearchParams);
          pendingUpdates.delete(setSearchParams);
          if (!updates || updates.size === 0) return;

          setSearchParams(
            (prev) => {
              const next = new URLSearchParams(prev);
              for (const [k, entry] of updates) {
                if (entry.remove) {
                  next.delete(k);
                } else {
                  next.set(k, entry.serialized);
                }
              }
              return next;
            },
            { replace: true },
          );
        });
      }

      const batch = pendingUpdates.get(setSearchParams);
      const serialized = stringify(newValue);
      if (newValue === defaultValue || newValue === null || newValue === undefined || serialized === null) {
        batch.set(key, { remove: true });
      } else {
        batch.set(key, { remove: false, serialized });
      }
    },
    [key, defaultValue, stringify, setSearchParams],
  );

  return [value, setValue];
}
