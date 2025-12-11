/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useSelector } from '../services/state/store.js';

export function useFeature(name) {
  const currentFeatureFlags = useSelector((state) => state.features);
  if (Object.keys(currentFeatureFlags || {}).length === 0) {
    return null;
  }

  if (currentFeatureFlags[name] == null) {
    console.warn(`Feature flag with name ${name} is unknown.`);
    return null;
  }

  return currentFeatureFlags[name];
}
