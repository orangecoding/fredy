/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */
// Imported, so the build serves it: the source path only existed on the dev server.
import heartIcon from '../../assets/heart.png';

/**
 * Triggers a test browser notification, requesting permission if needed.
 *
 * @param {function} t - The translation function
 * @param {function} onSuccess - Callback when notification succeeds
 * @param {function} onError - Callback when there is a validation or permission error
 */
export function triggerTestNotification(t, onSuccess, onError) {
  if (typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'granted') {
      const notification = new Notification('Test Call from Fredy', {
        body: 'Everything works perfectly! Real-time listings will appear here.',
        icon: heartIcon,
      });
      notification.onclick = () => {
        window.focus();
      };
      onSuccess(t('notification.trySuccess'));
    } else if (Notification.permission === 'denied') {
      onError(t('notification.browserPermissionDenied'));
    } else {
      const handlePermissionResult = (permission) => {
        if (permission === 'granted') {
          const notification = new Notification('Test Call from Fredy', {
            body: 'Everything works perfectly! Real-time listings will appear here.',
            icon: heartIcon,
          });
          notification.onclick = () => {
            window.focus();
          };
          onSuccess(t('notification.trySuccess'));
        } else if (permission === 'denied') {
          onError(t('notification.browserPermissionDenied'));
        }
      };

      try {
        const promise = Notification.requestPermission(handlePermissionResult);
        if (promise && typeof promise.then === 'function') {
          promise.then(handlePermissionResult).catch((err) => {
            onError(t('notification.tryError', { error: String(err) }));
          });
        }
      } catch {
        // Fallback for callback interface
      }
    }
  } else {
    onError(t('notification.browserNotSupported'));
  }
}
