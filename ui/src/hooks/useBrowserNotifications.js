/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect } from 'react';
import { useSelector } from '../services/state/store';

export function useBrowserNotifications() {
  const currentUser = useSelector((state) => state.user.currentUser);

  useEffect(() => {
    if (currentUser == null || Object.keys(currentUser).length === 0) return;

    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }

    const src = new EventSource('/api/jobs/events');

    const onBrowserNotification = (e) => {
      try {
        const data = JSON.parse(e.data || '{}');
        if (data && 'Notification' in window && Notification.permission === 'granted') {
          const notification = new Notification(data.title, {
            body: data.body,
            icon: data.image || '/ui/src/assets/heart.png',
          });
          notification.onclick = () => {
            window.focus();
            if (data.link) {
              window.open(data.link, '_blank');
            }
          };
        }
      } catch (err) {
        console.error('Error parsing browser notification SSE:', err);
      }
    };

    src.addEventListener('notification:browser', onBrowserNotification);
    src.onerror = () => {
      // Browser automatically reconnects
    };

    return () => {
      src.removeEventListener('notification:browser', onBrowserNotification);
      src.close();
    };
  }, [currentUser?.userId]);
}
