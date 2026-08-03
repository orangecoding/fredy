/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Same trick as `useUrlState.test.js`: the hook is a thin wrapper around `useState`, so a stubbed
 * React gives the real logic without pulling a DOM renderer into a `node` test environment. The
 * hoisted store plays the part of React's fiber - one slot per `useState` call, reset between
 * "renders" - which is enough to observe whether an update survived.
 */
const hookState = vi.hoisted(() => ({ cells: [], cursor: 0 }));

vi.mock('react', () => ({
  useState: (initialValue) => {
    const index = hookState.cursor++;
    if (!(index in hookState.cells)) hookState.cells[index] = initialValue;
    return [
      hookState.cells[index],
      (next) => {
        hookState.cells[index] = next;
      },
    ];
  },
  useCallback: (fn) => fn,
}));

const { useControllableState } = await import('../../ui/src/hooks/useControllableState.js');

/**
 * Run the hook the way a render would, reusing whatever the previous run stored.
 *
 * @param {*} controlledValue
 * @param {*} defaultValue
 */
function render(controlledValue, defaultValue) {
  hookState.cursor = 0;
  return useControllableState(controlledValue, defaultValue);
}

describe('useControllableState', () => {
  beforeEach(() => {
    hookState.cells = [];
    hookState.cursor = 0;
  });

  describe('uncontrolled', () => {
    it('starts at the default value', () => {
      const [value] = render(undefined, 'STANDARD');
      expect(value).toBe('STANDARD');
    });

    it('keeps updates locally', () => {
      const [, setValue] = render(undefined, 'STANDARD');
      setValue('SATELLITE');
      const [value] = render(undefined, 'STANDARD');
      expect(value).toBe('SATELLITE');
    });

    it('treats a falsy default as a value, not as absence', () => {
      const [value, setValue] = render(undefined, false);
      expect(value).toBe(false);
      setValue(true);
      expect(render(undefined, false)[0]).toBe(true);
    });
  });

  describe('controlled', () => {
    it('echoes the prop and ignores the local setter', () => {
      const [value, setValue] = render('SATELLITE', 'STANDARD');
      expect(value).toBe('SATELLITE');

      setValue('STANDARD');

      expect(render('SATELLITE', 'STANDARD')[0]).toBe('SATELLITE');
    });

    it('follows the prop when the parent changes it', () => {
      render(false, false);
      expect(render(true, false)[0]).toBe(true);
    });

    it('counts `false` and `null` as controlled', () => {
      expect(render(false, true)[0]).toBe(false);
      hookState.cells = [];
      expect(render(null, 'STANDARD')[0]).toBe(null);
    });
  });
});
