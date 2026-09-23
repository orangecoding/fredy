/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';
import { Button, Dropdown, Modal, Progress, Toast } from '@douyinfe/semi-ui-19';
import { IconSave, IconDelete, IconMore } from '@douyinfe/semi-icons';

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

import './DebugPage.less';

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
 * @returns {React.ReactElement}
 */
export default function DebugPage() {
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
      <div className="settingsShell__page">
        {/* The explanation used to sit under this card's title as an info Banner - a coloured
            strip saying something that is true on every visit, directly above the danger Banner
            that really is a live state. As the card's own help text it says the same thing
            without competing with it. */}
        {/* Ein Zustand, eine Form. Aktiv war ein Warnbanner mit Titel, Groessenangabe und Balken,
            inaktiv ein nackter Sekundaertext - zwei voellig verschiedene Formen fuer denselben
            Statussatz. Beide sind jetzt derselbe Chip im Kartenkopf, und nur der Punkt wechselt
            die Farbe. */}
        <SegmentPart
          name={t('settings.debugSectionName')}
          helpText={t('settings.debugSectionHelp')}
          action={
            <span className="settingsShell__cardFlag">
              <span
                className={`settingsShell__cardFlagDot${debugStatus?.enabled ? ' settingsShell__cardFlagDot--live' : ''}`}
                aria-hidden="true"
              />
              {t(debugStatus?.enabled ? 'settings.debugStatusActive' : 'settings.debugStatusInactive')}
            </span>
          }
        >
          {debugStatus?.enabled && (
            <div className="debugPage__usage">
              <Progress
                percent={percentOf(debugStatus.size, debugStatus.max)}
                aria-label={t('settings.debugUsedLabel')}
              />
              <span className="debugPage__usageText">
                {t('settings.debugUsedValue', {
                  used: formatBytes(debugStatus.size),
                  max: formatBytes(debugStatus.max),
                  percent: percentOf(debugStatus.size, debugStatus.max),
                })}
              </span>
            </div>
          )}

          {/* Genau ein gefuellter Knopf, und das ist das Herunterladen: dafuer schaltet man die
              Aufzeichnung ueberhaupt ein. Starten und Beenden ist Outline, Loeschen liegt im
              Ueberlaufmenue - vorher standen zwei gefuellte Knoepfe in Warnfarben nebeneinander
              und dazwischen der harmlose Download.
              Der Outline-Knopf steht links vom gefuellten, weil man erst aufzeichnet und dann
              herunterlaedt; das Menue rutscht an den rechten Rand, weil es zu keinem von beiden
              gehoert. */}
          <div className="debugPage__actions">
            <Button
              theme="outline"
              loading={debugBusy}
              disabled={debugStatus == null}
              onClick={handleToggleDebugLogging}
            >
              {t(debugStatus?.enabled ? 'settings.debugDisableButton' : 'settings.debugEnableButton')}
            </Button>
            <Button
              theme="solid"
              type="primary"
              icon={<IconSave />}
              disabled={debugStatus == null || !debugStatus?.everEnabled || !debugStatus?.hasLogs}
              onClick={handleDownloadDebugBundle}
            >
              {t('settings.debugDownloadButton')}
            </Button>
            {debugStatus?.hasLogs && (
              <Dropdown
                trigger="click"
                position="bottomRight"
                clickToHide
                render={
                  <Dropdown.Menu>
                    <Dropdown.Item
                      type="danger"
                      icon={<IconDelete />}
                      onClick={() => setDebugClearConfirmVisible(true)}
                    >
                      {t('settings.debugClearButton')}
                    </Dropdown.Item>
                  </Dropdown.Menu>
                }
              >
                <Button
                  className="debugPage__overflow"
                  theme="borderless"
                  icon={<IconMore />}
                  aria-label={t('listings.moreActions')}
                />
              </Dropdown>
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
            <div className="debugPage__modalFooter">
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
            <div className="debugPage__modalFooter">
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

DebugPage.displayName = 'DebugPage';
