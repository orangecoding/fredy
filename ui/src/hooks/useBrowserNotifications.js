/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useMemo } from 'react';
import { useSelector } from '../services/state/store';
import { usesBrowserAdapter } from '../services/notifications/browserAdapter.js';

/**
 * Deliver browser notifications for jobs that are configured to send them.
 *
 * The permission prompt is asked for only when at least one of the user's jobs actually uses the
 * browser adapter. It used to be asked on every single load, which meant most people were
 * interrupted by an operating-system dialog for a feature they had not switched on - and a prompt
 * shown at a moment the user cannot connect to anything they did is the one most likely to be
 * denied outright, which then costs the feature for the people who did want it.
 *
 * The event stream itself is opened regardless. It costs one connection, it is how the job status
 * in the UI stays live, and the server decides what it sends.
 *
 * @returns {void}
 */
export function useBrowserNotifications() {
  const currentUser = useSelector((state) => state.user.currentUser);
  const jobs = useSelector((state) => state.jobsData.jobs);

  const wantsBrowserNotifications = useMemo(() => usesBrowserAdapter(jobs), [jobs]);

  useEffect(() => {
    if (currentUser == null || Object.keys(currentUser).length === 0) return;
    if (!wantsBrowserNotifications) return;

    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [currentUser?.userId, wantsBrowserNotifications]);

  useEffect(() => {
    if (currentUser == null || Object.keys(currentUser).length === 0) return undefined;

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
