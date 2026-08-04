/*
 * Travel time filter state helper.
 */

import { useMemo, useState } from 'react';

const DEFAULT_FILTER = {
  enabled: false,
  mode: 'transit',
  maxMinutes: 45,
};

export default function useTravelTimeFilter(initial = {}) {
  const [filter, setFilter] = useState({
    ...DEFAULT_FILTER,
    ...initial,
  });

  const active = useMemo(
    () => filter.enabled && filter.maxMinutes > 0,
    [filter],
  );

  return {
    filter,
    setFilter,
    active,
  };
}
