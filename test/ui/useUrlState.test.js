/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi } from 'vitest';

/**
 * `useUrlState` is exercised without React: the hook body is two `useMemo`/`useCallback` wrappers
 * around plain functions, so stubbing those to call through gives the real logic with none of the
 * renderer. That keeps the suite free of a DOM dependency it otherwise does not need.
 */
vi.mock('react', () => ({
  useMemo: (factory) => factory(),
  useCallback: (fn) => fn,
}));

const { useUrlState, parseNumber, parseString, parseNullableBoolean, parseBoolean } =
  await import('../../ui/src/hooks/useSearchParamState.js');

const SCHEMA = {
  page: { defaultValue: 1, codec: parseNumber },
  q: { defaultValue: null, codec: parseString },
  active: { defaultValue: true, codec: parseNullableBoolean },
  hidden: { defaultValue: false, codec: parseBoolean },
};

/**
 * A stand-in for react-router's `useSearchParams` pair, with the behaviour that made the old
 * batching necessary: every call reads the params as they were at the start of the tick, so two
 * calls in one tick lose the first one.
 *
 * @param {string} [initial]
 */
function makeSearchParams(initial = '') {
  const state = { params: new URLSearchParams(initial), calls: 0, options: [] };
  const setSearchParams = vi.fn((updater, options) => {
    state.calls += 1;
    state.options.push(options);
    state.params = typeof updater === 'function' ? updater(state.params) : updater;
  });
  return { state, pair: () => [state.params, setSearchParams], setSearchParams };
}

describe('useUrlState', () => {
  describe('reading', () => {
    it('falls back to the declared defaults for absent params', () => {
      const { pair } = makeSearchParams();
      const { values } = useUrlState(pair(), SCHEMA);
      expect(values).toEqual({ page: 1, q: null, active: true, hidden: false });
    });

    it('decodes what is in the URL', () => {
      const { pair } = makeSearchParams('page=3&q=altbau&active=false&hidden=true');
      const { values } = useUrlState(pair(), SCHEMA);
      expect(values).toEqual({ page: 3, q: 'altbau', active: false, hidden: true });
    });

    it('decodes active=all as null when schema default is true', () => {
      const { pair } = makeSearchParams('active=all');
      expect(useUrlState(pair(), SCHEMA).values.active).toBe(null);
    });

    it('tells a nullable boolean apart from its default', () => {
      const { pair } = makeSearchParams('active=false');
      expect(useUrlState(pair(), SCHEMA).values.active).toBe(false);
    });
  });

  describe('writing', () => {
    it('writes a value into the URL', () => {
      const { pair, state } = makeSearchParams();
      useUrlState(pair(), SCHEMA).setValue('q', 'altbau');
      expect(state.params.get('q')).toBe('altbau');
    });

    it('drops a param that is back at its default, keeping the address clean', () => {
      const { pair, state } = makeSearchParams('page=4');
      useUrlState(pair(), SCHEMA).setValue('page', 1);
      expect(state.params.has('page')).toBe(false);
    });

    it('stores active=all in URL when set to null if defaultValue is non-null', () => {
      const { pair, state } = makeSearchParams();
      useUrlState(pair(), SCHEMA).setValue('active', null);
      expect(state.params.get('active')).toBe('all');
    });

    it('drops a param set to null', () => {
      const { pair, state } = makeSearchParams('q=altbau');
      useUrlState(pair(), SCHEMA).setValue('q', null);
      expect(state.params.has('q')).toBe(false);
    });

    it('drops a number param set to null instead of writing "null"', () => {
      const { pair, state } = makeSearchParams('page=3');
      useUrlState(pair(), SCHEMA).setValue('page', null);
      expect(state.params.has('page')).toBe(false);
    });

    it('ignores keys the schema does not declare', () => {
      const { pair, state } = makeSearchParams();
      useUrlState(pair(), SCHEMA).setValues({ nonsense: 'x' });
      expect(state.params.has('nonsense')).toBe(false);
    });

    it('replaces rather than pushes, so filters do not fill the back button', () => {
      const { pair, state } = makeSearchParams();
      useUrlState(pair(), SCHEMA).setValue('q', 'altbau');
      expect(state.options[0]).toEqual({ replace: true });
    });
  });

  describe('the race the old batching existed to hide', () => {
    it('applies several params in one navigation', () => {
      const { pair, state } = makeSearchParams();

      useUrlState(pair(), SCHEMA).setValues({ q: 'altbau', page: 1, hidden: true });

      // One call, so there is no window in which a sibling can read a stale location.
      expect(state.calls).toBe(1);
      expect(state.params.get('q')).toBe('altbau');
      expect(state.params.get('hidden')).toBe('true');
    });

    it('does not lose one change to another made in the same tick', () => {
      const { pair, state } = makeSearchParams();
      const { setValues } = useUrlState(pair(), SCHEMA);

      // A control that changes its own filter and resets the page - the exact pattern that used
      // to need a WeakMap to survive.
      setValues({ q: 'altbau', page: 2 });

      expect(state.params.get('q')).toBe('altbau');
      expect(state.params.get('page')).toBe('2');
    });

    it('keeps params the patch did not mention', () => {
      const { pair, state } = makeSearchParams('q=altbau&hidden=true');
      useUrlState(pair(), SCHEMA).setValues({ page: 5 });

      expect(state.params.get('q')).toBe('altbau');
      expect(state.params.get('hidden')).toBe('true');
      expect(state.params.get('page')).toBe('5');
    });

    it('needs no stable identity from setSearchParams', () => {
      // The old implementation keyed its batching on that identity. A fresh setter per render is
      // now completely unremarkable.
      const { state } = makeSearchParams();
      for (const value of ['a', 'b', 'c']) {
        const freshSetter = vi.fn((updater) => {
          state.params = updater(state.params);
        });
        useUrlState([state.params, freshSetter], SCHEMA).setValue('q', value);
      }
      expect(state.params.get('q')).toBe('c');
    });
  });
});
