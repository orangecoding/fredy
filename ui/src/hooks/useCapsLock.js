/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useCallback, useState } from 'react';

/**
 * Reads the caps lock state from a keyboard event, if the browser reports it.
 *
 * @param {React.KeyboardEvent} event
 * @returns {boolean|null} true/false when known, null when the event carries no modifier state
 */
export function readCapsLockState(event) {
  const nativeEvent = event?.nativeEvent ?? event;
  if (typeof nativeEvent?.getModifierState !== 'function') {
    return null;
  }
  return nativeEvent.getModifierState('CapsLock');
}

/**
 * Whether caps lock is on, tracked from key events on the fields it matters for.
 *
 * Lived in `Login.jsx` until the user form needed it too. It matters there for the same reason and
 * then some: a password typed here is one the admin cannot read back, cannot recover, and is about
 * to hand to somebody else.
 *
 * `null` from the reader means the event carried no modifier state at all, which is not the same as
 * "off" - the last known value is kept rather than guessed at.
 *
 * @returns {{ capsLockOn: boolean, trackCapsLock: (event: React.KeyboardEvent) => void, clearCapsLock: () => void }}
 */
export function useCapsLock() {
  const [capsLockOn, setCapsLockOn] = useState(false);

  const trackCapsLock = useCallback((event) => {
    const state = readCapsLockState(event);
    if (state !== null) {
      setCapsLockOn(state);
    }
  }, []);

  const clearCapsLock = useCallback(() => setCapsLockOn(false), []);

  return { capsLockOn, trackCapsLock, clearCapsLock };
}
