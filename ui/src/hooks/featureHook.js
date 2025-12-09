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
