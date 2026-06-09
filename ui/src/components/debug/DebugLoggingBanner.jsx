/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useState } from 'react';
import { Banner } from '@douyinfe/semi-ui-19';

import { useTranslation } from '../../services/i18n/i18n.jsx';
import { fetchDebugActive } from '../../services/debugLoggingClient.js';

const POLL_INTERVAL_MS = 15000;

/**
 * Persistent, non-dismissable red banner shown on every page while the admin opt-in
 * "Debug Logging" feature is active. Polls the lightweight `/api/debug/active` probe
 * so every authenticated user (not just admins) sees the warning, without exposing
 * the rest of the settings payload.
 *
 * Polling interval is intentionally generous (15s) because the value only changes
 * when an admin toggles the feature, which happens at human speeds. The Debug tab
 * itself uses its own 3s polling for the live progress bar inside Settings.
 *
 * @returns {JSX.Element|null}
 */
export default function DebugLoggingBanner() {
  const t = useTranslation();
  const [active, setActive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetchDebugActive();
        if (!cancelled) setActive(Boolean(res?.enabled));
      } catch {
        // Best-effort probe: an unauthenticated 401 (e.g. session expired) simply
        // hides the banner until the next successful poll.
      }
    };
    tick();
    const id = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  if (!active) return null;
  return (
    <>
      <Banner fullMode={true} type="danger" bordered closeIcon={null} description={t('app.debugLoggingBanner')} />
      <br />
    </>
  );
}

DebugLoggingBanner.displayName = 'DebugLoggingBanner';
