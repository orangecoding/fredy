/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useCallback, useState } from 'react';

/**
 * State that a parent may either own or leave to the component.
 *
 * Passing `undefined` keeps the value local; passing anything else (including `false` or `null`)
 * hands ownership to the parent. When the parent owns it, the returned setter deliberately does
 * nothing: the parent's change callback is then the only way the value moves, which is what keeps
 * a single source of truth for things like the map view's URL state - otherwise the local copy
 * would flip first and flash the wrong value until the URL round-trip caught up.
 *
 * @template T
 * @param {T|undefined} controlledValue - Parent-owned value, or `undefined` to stay uncontrolled.
 * @param {T} defaultValue - Initial value while uncontrolled.
 * @returns {[T, (next: T) => void]} The current value and a setter that is a no-op when controlled.
 */
export function useControllableState(controlledValue, defaultValue) {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const isControlled = controlledValue !== undefined;

  const setValue = useCallback(
    (next) => {
      if (!isControlled) setUncontrolledValue(next);
    },
    [isControlled],
  );

  return [isControlled ? controlledValue : uncontrolledValue, setValue];
}
