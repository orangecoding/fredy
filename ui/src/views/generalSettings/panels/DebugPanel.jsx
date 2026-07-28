/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';
import { Button, Banner, Modal, Progress, Toast, Typography } from '@douyinfe/semi-ui-19';
import { IconSave } from '@douyinfe/semi-icons';

import { SegmentPart } from '../../../components/segment/SegmentPart';
import {
  fetchDebugStatus,
  enableDebugLogging as apiEnableDebugLogging,
  disableDebugLogging as apiDisableDebugLogging,
  downloadDebugBundle,
  clearDebugLogs as apiClearDebugLogs,
} from '../../../services/debugLoggingClient';
import { useActions } from '../../../services/state/store';
import { useTranslation } from '../../../services/i18n/i18n.jsx';

const { Text } = Typography;

/**
 * Human-readable byte formatter for the usage label.
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return String(bytes);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

/**
 * The integer percentage `used` is of `total`, clamped to [0, 100].
 * @param {number} used
 * @param {number} total
 * @returns {number}
 */
function percentOf(used, total) {
  if (!total || total <= 0) return 0;
  const pct = Math.round((used / total) * 100);
  if (pct < 0) return 0;
  if (pct > 100) return 100;
  return pct;
}

/**
 * Opt-in capture of Fredy's own logs into the database, for support bundles.
 *
 * Only mounted for administrators - the parent decides that - because the captured logs contain
 * whatever the instance was doing, search URLs included.
 *
 * Status is polled while capture is active so the byte budget stays live, and only then: with the
 * feature off the size cannot change and there is nothing to update. A sequence counter discards
 * poll answers that arrive after a manual enable or disable, so the UI does not flicker back to
 * the previous state for a few seconds.
 *
 * @returns {React.ReactElement} One to be rendered inside the page's Tabs.
 */
export default function DebugPanel() {
  const t = useTranslation();
  const actions = useActions();

  const [debugStatus, setDebugStatus] = React.useState(null);
  const [debugBusy, setDebugBusy] = React.useState(false);
  const [debugConfirmVisible, setDebugConfirmVisible] = React.useState(false);
  const [debugClearConfirmVisible, setDebugClearConfirmVisible] = React.useState(false);
  const debugStatusSeqRef = React.useRef(0);

  const applyDebugStatus = React.useCallback((fresh) => {
    debugStatusSeqRef.current += 1;
    setDebugStatus(fresh);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    fetchDebugStatus()
      .then((s) => {
        if (!cancelled) applyDebugStatus(s);
      })
      .catch((e) => {
        // Non-fatal: the tab is still usable and polling will retry.
        console.error('Failed to load debug status', e);
      });
    return () => {
      cancelled = true;
    };
  }, [applyDebugStatus]);

  React.useEffect(() => {
    if (!debugStatus?.enabled) return undefined;
    const id = setInterval(async () => {
      const seqAtStart = debugStatusSeqRef.current;
      try {
        const fresh = await fetchDebugStatus();
        if (debugStatusSeqRef.current === seqAtStart) {
          applyDebugStatus(fresh);
        }
      } catch {
        // ignore transient errors; the next tick retries
      }
    }, 3000);
    return () => window.clearInterval(id);
  }, [debugStatus?.enabled, applyDebugStatus]);

  // Centralized so both branches of the confirm dialog ("delete" vs. "keep") and the no-confirm
  // fast path share one call.
  const performEnableDebug = React.useCallback(
    async ({ clearPrevious }) => {
      setDebugBusy(true);
      try {
        const fresh = await apiEnableDebugLogging({ clearPrevious });
        applyDebugStatus(fresh);
        // Keep the global settings store in sync so the app-wide red banner updates immediately.
        await actions.generalSettings.getGeneralSettings();
        Toast.success(t('settings.debugToastEnabled'));
      } catch (e) {
        console.error(e);
        Toast.error(t('settings.debugToastEnableError'));
      } finally {
        setDebugBusy(false);
        setDebugConfirmVisible(false);
      }
    },
    [actions.generalSettings, applyDebugStatus, t],
  );

  const handleToggleDebugLogging = React.useCallback(async () => {
    // Guard against the initial-load race: without a status yet, ignore the click. The button is
    // disabled in that state too; this is belt and braces.
    if (debugStatus == null) return;
    if (debugStatus.enabled) {
      setDebugBusy(true);
      try {
        const fresh = await apiDisableDebugLogging();
        applyDebugStatus(fresh);
        await actions.generalSettings.getGeneralSettings();
        Toast.success(t('settings.debugToastDisabled'));
      } catch (e) {
        console.error(e);
        Toast.error(t('settings.debugToastDisableError'));
      } finally {
        setDebugBusy(false);
      }
      return;
    }
    // Enabling: if logs from a previous session are still around, ask first.
    if (debugStatus.hasLogs) {
      setDebugConfirmVisible(true);
      return;
    }
    await performEnableDebug({ clearPrevious: false });
  }, [debugStatus, performEnableDebug, actions.generalSettings, applyDebugStatus, t]);

  const handleDownloadDebugBundle = React.useCallback(async () => {
    try {
      await downloadDebugBundle();
    } catch (e) {
      console.error(e);
      Toast.error(e?.code === 'NO_LOGS' ? t('settings.debugToastNoLogs') : t('settings.debugToastDownloadError'));
    }
  }, [t]);

  // Deleting stored logs is separate from disabling capture: the buffer can be freed mid-recording
  // without turning collection off. The confirmation makes the destructive part explicit.
  const performClearDebugLogs = React.useCallback(async () => {
    setDebugBusy(true);
    try {
      const fresh = await apiClearDebugLogs();
      applyDebugStatus(fresh);
      Toast.success(t('settings.debugToastCleared'));
    } catch (e) {
      console.error(e);
      Toast.error(t('settings.debugToastClearError'));
    } finally {
      setDebugBusy(false);
      setDebugClearConfirmVisible(false);
    }
  }, [applyDebugStatus, t]);

  return (
    <>
      <div className="generalSettings__tab-content">
        <SegmentPart name={t('settings.debugSectionName')}>
          <Banner
            type="info"
            fullMode={false}
            closeIcon={null}
            style={{ marginBottom: 12 }}
            title={<div style={{ fontWeight: 600, fontSize: '14px' }}>{t('settings.debugInfoTitle')}</div>}
            description={t('settings.debugInfoDescription')}
          />

          {debugStatus?.enabled ? (
            <Banner
              type="danger"
              fullMode={false}
              closeIcon={null}
              style={{ marginBottom: 12 }}
              description={
                <div>
                  <div style={{ fontWeight: 600 }}>{t('settings.debugStatusActive')}</div>
                  <div style={{ marginTop: 8 }}>
                    <Text type="secondary" style={{ marginRight: 8 }}>
                      {t('settings.debugUsedLabel')}
                    </Text>
                    <Text>
                      {t('settings.debugUsedValue', {
                        used: formatBytes(debugStatus.size),
                        max: formatBytes(debugStatus.max),
                        percent: percentOf(debugStatus.size, debugStatus.max),
                      })}
                    </Text>
                    <Progress
                      percent={percentOf(debugStatus.size, debugStatus.max)}
                      stroke="var(--semi-color-danger)"
                      aria-label="debug log storage"
                      style={{ marginTop: 6 }}
                    />
                  </div>
                </div>
              }
            />
          ) : (
            <div style={{ marginBottom: 12 }}>
              <Text type="secondary">{t('settings.debugStatusInactive')}</Text>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Button
              theme="solid"
              type={debugStatus?.enabled ? 'danger' : 'primary'}
              loading={debugBusy}
              disabled={debugStatus == null}
              onClick={handleToggleDebugLogging}
            >
              {debugStatus?.enabled ? t('settings.debugDisableButton') : t('settings.debugEnableButton')}
            </Button>
            <Button
              theme="light"
              icon={<IconSave />}
              disabled={debugStatus == null || !debugStatus?.everEnabled || !debugStatus?.hasLogs}
              onClick={handleDownloadDebugBundle}
            >
              {t('settings.debugDownloadButton')}
            </Button>
            {debugStatus?.hasLogs && (
              <Button theme="solid" type="warning" onClick={() => setDebugClearConfirmVisible(true)}>
                {t('settings.debugClearButton')}
              </Button>
            )}
          </div>
        </SegmentPart>
      </div>

      {debugConfirmVisible && (
        <Modal
          title={t('settings.debugConfirmReenableTitle')}
          visible={debugConfirmVisible}
          onCancel={() => {
            // Defensive reset in case a network blip left debugBusy stuck while the
            // user dismissed the dialog via the X / backdrop.
            setDebugBusy(false);
            setDebugConfirmVisible(false);
          }}
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button onClick={() => performEnableDebug({ clearPrevious: false })} loading={debugBusy}>
                {t('settings.debugConfirmKeep')}
              </Button>
              <Button
                type="danger"
                theme="solid"
                onClick={() => performEnableDebug({ clearPrevious: true })}
                loading={debugBusy}
              >
                {t('settings.debugConfirmDelete')}
              </Button>
            </div>
          }
        >
          <div>{t('settings.debugConfirmReenableMessage')}</div>
        </Modal>
      )}

      {debugClearConfirmVisible && (
        <Modal
          title={t('settings.debugClearConfirmTitle')}
          visible={debugClearConfirmVisible}
          onCancel={() => {
            setDebugBusy(false);
            setDebugClearConfirmVisible(false);
          }}
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button onClick={() => setDebugClearConfirmVisible(false)} disabled={debugBusy}>
                {t('settings.debugClearConfirmCancel')}
              </Button>
              <Button type="warning" theme="solid" onClick={performClearDebugLogs} loading={debugBusy}>
                {t('settings.debugClearConfirmDelete')}
              </Button>
            </div>
          }
        >
          <div>
            {t('settings.debugClearConfirmMessage', {
              recordingState: debugStatus?.enabled
                ? t('settings.debugClearConfirmRecordingOn')
                : t('settings.debugClearConfirmRecordingOff'),
            })}
          </div>
        </Modal>
      )}
    </>
  );
}

DebugPanel.displayName = 'DebugPanel';
