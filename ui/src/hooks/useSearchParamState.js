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
export function useSearchParamState([searchParams, setSearchParams], key, defaultValue, options = {}) {
  const { parse = (v) => v, stringify = (v) => String(v) } = options;

  const rawValue = searchParams.get(key);
  const value = rawValue !== null ? parse(rawValue) : defaultValue;

  const setValue = useCallback(
    (newValue) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const serialized = stringify(newValue);
          if (newValue === defaultValue || newValue === null || newValue === undefined || serialized === null) {
            next.delete(key);
          } else {
            next.set(key, serialized);
          }
          return next;
        },
        { replace: true },
      );
    },
    [key, defaultValue, stringify],
  );

  return [value, setValue];
}
