/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React, { useEffect, useState, useMemo } from 'react';

import { useActions, useSelector, useIsLoading } from '../../services/state/store';
import { useTranslation, availableLanguages } from '../../services/i18n/i18n.jsx';

import {
  Tabs,
  TabPane,
  TimePicker,
  Button,
  Checkbox,
  Input,
  Modal,
  AutoComplete,
  Select,
  Banner,
  Radio,
  RadioGroup,
  Typography,
  Progress,
} from '@douyinfe/semi-ui-19';
import { InputNumber } from '@douyinfe/semi-ui-19';
import { xhrPost, xhrGet } from '../../services/xhr';
import { Toast } from '@douyinfe/semi-ui-19';
import { SegmentPart } from '../../components/segment/SegmentPart';
import {
  downloadBackup as downloadBackupZip,
  precheckRestore as clientPrecheckRestore,
  restore as clientRestore,
} from '../../services/backupRestoreClient';
import {
  fetchDebugStatus,
  enableDebugLogging as apiEnableDebugLogging,
  disableDebugLogging as apiDisableDebugLogging,
  downloadDebugBundle,
  clearDebugLogs as apiClearDebugLogs,
} from '../../services/debugLoggingClient';
import { IconSave, IconRefresh, IconSignal, IconHome, IconFolder, IconAlertTriangle } from '@douyinfe/semi-icons';
import { debounce } from '../../utils';
import Headline from '../../components/headline/Headline.jsx';
import './GeneralSettings.less';

const { Text } = Typography;

function formatFromTimestamp(ts) {
  const date = new Date(ts);
  return `${date.getHours()}:${date.getMinutes() > 9 ? date.getMinutes() : '0' + date.getMinutes()}`;
}

function formatFromTBackend(time) {
  if (time == null || time.length === 0) {
    return null;
  }
  const date = new Date();
  const split = time.split(':');
  date.setHours(split[0]);
  date.setMinutes(split[1]);
  return date.getTime();
}

/**
 * Human-readable byte formatter used by the Debug tab's usage label.
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
 * Compute the integer percentage that `used` represents of `total`, clamped to [0, 100].
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

const GeneralSettings = function GeneralSettings() {
  const actions = useActions();
  const t = useTranslation();
  const [loading, setLoading] = React.useState(true);

  const settings = useSelector((state) => state.generalSettings.settings);
  const currentUser = useSelector((state) => state.user.currentUser);
  const language = useSelector((state) => state.userSettings.settings.language);

  const [interval, setInterval] = React.useState('');
  const [proxyUrl, setProxyUrl] = React.useState('');
  const [port, setPort] = React.useState('');
  const [workingHourFrom, setWorkingHourFrom] = React.useState(null);
  const [workingHourTo, setWorkingHourTo] = React.useState(null);
  const [demoMode, setDemoMode] = React.useState(null);
  const [analyticsEnabled, setAnalyticsEnabled] = React.useState(null);
  const [sqlitePath, setSqlitePath] = React.useState(null);
  const [baseUrl, setBaseUrl] = React.useState('');
  const fileInputRef = React.useRef(null);
  const [restoreModalVisible, setRestoreModalVisible] = React.useState(false);
  const [precheckInfo, setPrecheckInfo] = React.useState(null);
  const [restoreBusy, setRestoreBusy] = React.useState(false);
  const [selectedRestoreFile, setSelectedRestoreFile] = React.useState(null);

  // Debug-logging tab state. status is fetched on mount + polled every 3s while the
  // feature is active so the progress bar reflects the live byte budget.
  // debugStatusSeq monotonically increases with every applied status update so we can
  // discard stale polling responses that arrive after a manual enable/disable.
  const [debugStatus, setDebugStatus] = React.useState(null);
  const [debugBusy, setDebugBusy] = React.useState(false);
  const [debugConfirmVisible, setDebugConfirmVisible] = React.useState(false);
  const [debugClearConfirmVisible, setDebugClearConfirmVisible] = React.useState(false);
  const debugStatusSeqRef = React.useRef(0);
  const applyDebugStatus = React.useCallback((fresh) => {
    debugStatusSeqRef.current += 1;
    setDebugStatus(fresh);
  }, []);

  // User settings state
  const homeAddress = useSelector((state) => state.userSettings.settings.home_address);
  const providerDetails = useSelector((state) => state.userSettings.settings.provider_details);
  const listingDeletionPreference = useSelector((state) => state.userSettings.settings.listing_deletion_preference);
  const allProviders = useSelector((state) => state.provider);
  const [address, setAddress] = useState(homeAddress?.address || '');
  const [coords, setCoords] = useState(homeAddress?.coords || null);
  const [listingDeleteHard, setListingDeleteHard] = useState(false);
  const [listingDeleteSkipPrompt, setListingDeleteSkipPrompt] = useState(false);
  const saving = useIsLoading(actions.userSettings.setHomeAddress);
  const savingLanguage = useIsLoading(actions.userSettings.setLanguage);
  const [dataSource, setDataSource] = useState([]);

  React.useEffect(() => {
    async function init() {
      await actions.generalSettings.getGeneralSettings();
      setLoading(false);
    }

    init();
  }, []);

  React.useEffect(() => {
    async function init() {
      setInterval(settings?.interval);
      setProxyUrl(settings?.proxyUrl ?? '');
      setPort(settings?.port);
      setWorkingHourFrom(settings?.workingHours?.from);
      setWorkingHourTo(settings?.workingHours?.to);
      setAnalyticsEnabled(settings?.analyticsEnabled || false);
      setDemoMode(settings?.demoMode || false);
      setSqlitePath(settings?.sqlitepath);
      setBaseUrl(settings?.baseUrl ?? '');
    }

    init();
  }, [settings]);

  useEffect(() => {
    setAddress(homeAddress?.address || '');
    setCoords(homeAddress?.coords || null);
  }, [homeAddress]);

  useEffect(() => {
    setListingDeleteHard(listingDeletionPreference?.hardDelete ?? false);
    setListingDeleteSkipPrompt(listingDeletionPreference?.skipPrompt ?? false);
  }, [listingDeletionPreference]);

  // Initial debug-status load. Subsequent updates flow through applyDebugStatus()
  // (called by polling + after every enable/disable action), so this effect only
  // needs to fire once on mount.
  useEffect(() => {
    let cancelled = false;
    fetchDebugStatus()
      .then((s) => {
        if (!cancelled) applyDebugStatus(s);
      })
      .catch((e) => {
        // Non-fatal: tab is still usable, polling will retry.
        console.error('Failed to load debug status', e);
      });
    return () => {
      cancelled = true;
    };
  }, [applyDebugStatus]);

  // Live polling while the feature is active so the progress bar reflects new entries
  // as they are written. We intentionally do NOT poll while inactive — the size stays
  // constant and there's no Banner to update. Stale poll responses (where a manual
  // enable/disable bumped the sequence in the meantime) are discarded so the UI does
  // not flicker back to the previous state for ~3s.
  useEffect(() => {
    if (!debugStatus?.enabled) return undefined;
    const id = window.setInterval(async () => {
      const seqAtStart = debugStatusSeqRef.current;
      try {
        const fresh = await fetchDebugStatus();
        if (debugStatusSeqRef.current === seqAtStart) {
          applyDebugStatus(fresh);
        }
      } catch {
        // ignore transient errors; next tick will retry
      }
    }, 3000);
    return () => window.clearInterval(id);
  }, [debugStatus?.enabled, applyDebugStatus]);

  const nullOrEmpty = (val) => val == null || val.length === 0;

  const handleStore = async () => {
    if (nullOrEmpty(interval)) {
      Toast.error(t('settings.toastIntervalEmpty'));
      return;
    }
    if (nullOrEmpty(port)) {
      Toast.error(t('settings.toastPortEmpty'));
      return;
    }
    if (
      (!nullOrEmpty(workingHourFrom) && nullOrEmpty(workingHourTo)) ||
      (nullOrEmpty(workingHourFrom) && !nullOrEmpty(workingHourTo))
    ) {
      Toast.error(t('settings.toastWorkingHoursIncomplete'));
      return;
    }
    if (nullOrEmpty(sqlitePath)) {
      Toast.error(t('settings.toastSqlitePathEmpty'));
      return;
    }
    try {
      await xhrPost('/api/admin/generalSettings', {
        interval,
        proxyUrl: proxyUrl?.trim() ?? '',
        port,
        workingHours: {
          from: workingHourFrom,
          to: workingHourTo,
        },
        demoMode,
        analyticsEnabled,
        sqlitepath: sqlitePath,
        baseUrl,
      });
    } catch (exception) {
      console.error(exception);
      if (exception?.json?.message != null) {
        Toast.error(exception.json.message);
      } else {
        Toast.error(t('settings.toastSaveError'));
      }
      return;
    }
    Toast.success(t('settings.toastSavedReloading'));
    setTimeout(() => {
      location.reload();
    }, 3000);
  };

  const handleDownloadBackup = React.useCallback(async () => {
    try {
      await downloadBackupZip();
    } catch (e) {
      console.error(e);
      Toast.error(t('settings.backupDownloadError'));
    }
  }, []);

  const precheckRestore = React.useCallback(async (file) => {
    try {
      const data = await clientPrecheckRestore(file);
      setPrecheckInfo(data);
      setRestoreModalVisible(true);
    } catch (e) {
      console.error(e);
      Toast.error(t('settings.backupAnalyzeError'));
    }
  }, []);

  const performRestore = React.useCallback(
    async (force) => {
      try {
        setRestoreBusy(true);
        await clientRestore(selectedRestoreFile, force);
        Toast.success(t('settings.backupRestoreCompleted'));
      } catch (e) {
        console.error(e);
        Toast.error(e?.message || t('settings.backupRestoreError'));
      } finally {
        setRestoreBusy(false);
      }
    },
    [selectedRestoreFile],
  );

  const handleSelectRestoreFile = React.useCallback(
    async (ev) => {
      const file = ev?.target?.files?.[0];
      if (!file) return;
      setSelectedRestoreFile(file);
      await precheckRestore(file);
      ev.target.value = '';
    },
    [precheckRestore],
  );

  const handleOpenFilePicker = React.useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  // ── Debug-logging actions ────────────────────────────────────────────────────
  // performEnableDebug() centralizes the actual enable call so both branches of the
  // confirm dialog ("delete" vs. "keep") plus the no-confirm fast-path can share it.
  const performEnableDebug = React.useCallback(
    async ({ clearPrevious }) => {
      setDebugBusy(true);
      try {
        const fresh = await apiEnableDebugLogging({ clearPrevious });
        applyDebugStatus(fresh);
        // Keep the global generalSettings store in sync so the app-wide red banner
        // (which reads settings.debug_logging_enabled) updates immediately.
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
    // Guard against the initial-load race: if status hasn't arrived yet, ignore the
    // click. The button is also disabled when debugStatus == null, this is belt &
    // braces for the case where the click somehow reached the handler anyway.
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
      if (e?.code === 'NO_LOGS') {
        Toast.error(t('settings.debugToastNoLogs'));
      } else {
        Toast.error(t('settings.debugToastDownloadError'));
      }
    }
  }, [t]);

  // Deleting stored logs is a separate action from disabling the feature: the user can
  // free up the rolling buffer mid-recording without turning off collection. The
  // confirmation dialog makes the destructive nature explicit.
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

  const handleSaveUserSettings = async () => {
    try {
      const responseJson = await actions.userSettings.setHomeAddress(address);
      setCoords(responseJson.coords);
      await actions.userSettings.setListingDeletionPreference({
        skipPrompt: listingDeleteSkipPrompt,
        hardDelete: listingDeleteHard,
      });
      await actions.userSettings.getUserSettings();
      Toast.success(t('settings.userSettingsSaved'));
    } catch (error) {
      Toast.error(error.json?.error || t('settings.userSettingsSaveError'));
    }
  };

  const debouncedSearch = useMemo(
    () =>
      debounce((value) => {
        xhrGet(`/api/user/settings/autocomplete?q=${encodeURIComponent(value)}`)
          .then((response) => {
            if (response.status === 200) {
              setDataSource(response.json);
            }
          })
          .catch(() => {});
      }, 300),
    [],
  );

  const searchAddress = (value) => {
    if (!value) {
      setDataSource([]);
      return;
    }
    debouncedSearch(value);
  };

  return (
    <div className="generalSettings">
      <Headline text={t('settings.title')} />
      {!loading && (
        <>
          <Tabs type="line">
            <TabPane
              tab={
                <span>
                  <IconSignal size="small" style={{ marginRight: 6 }} />
                  {t('settings.tabSystem')}
                </span>
              }
              itemKey="system"
            >
              <div className="generalSettings__tab-content">
                <SegmentPart name={t('settings.port')} helpText={t('settings.portHelp')}>
                  <InputNumber
                    min={0}
                    max={99999}
                    placeholder={t('settings.portPlaceholder')}
                    value={port}
                    formatter={(value) => `${value}`.replace(/\D/g, '')}
                    onChange={(value) => setPort(value)}
                    style={{ maxWidth: 160 }}
                  />
                </SegmentPart>

                <SegmentPart name={t('settings.baseUrl')} helpText={t('settings.baseUrlHelp')}>
                  <Input
                    type="text"
                    placeholder={t('settings.baseUrlPlaceholder')}
                    value={baseUrl}
                    onChange={(value) => setBaseUrl(value)}
                  />
                </SegmentPart>

                <SegmentPart name={t('settings.sqlitePath')} helpText={t('settings.sqlitePathHelp')}>
                  <Banner
                    fullMode={false}
                    type="warning"
                    closeIcon={null}
                    style={{ marginBottom: '12px' }}
                    description={t('settings.sqlitePathWarning')}
                  />
                  <Input
                    type="text"
                    placeholder={t('settings.sqlitePathPlaceholder')}
                    value={sqlitePath}
                    onChange={(value) => setSqlitePath(value)}
                  />
                </SegmentPart>

                <SegmentPart name={t('settings.analytics')} helpText={t('settings.analyticsHelp')}>
                  <Checkbox checked={analyticsEnabled} onChange={(e) => setAnalyticsEnabled(e.target.checked)}>
                    {t('settings.analyticsEnable')}
                  </Checkbox>
                </SegmentPart>

                <SegmentPart name={t('settings.demoMode')} helpText={t('settings.demoModeHelp')}>
                  <Checkbox checked={demoMode} onChange={(e) => setDemoMode(e.target.checked)}>
                    {t('settings.demoModeEnable')}
                  </Checkbox>
                </SegmentPart>

                <div className="generalSettings__save-row">
                  <Button type="primary" theme="solid" onClick={handleStore} icon={<IconSave />}>
                    {t('settings.save')}
                  </Button>
                </div>
              </div>
            </TabPane>

            <TabPane
              tab={
                <span>
                  <IconRefresh size="small" style={{ marginRight: 6 }} />
                  {t('settings.tabExecution')}
                </span>
              }
              itemKey="execution"
            >
              <div className="generalSettings__tab-content">
                <SegmentPart name={t('settings.searchInterval')} helpText={t('settings.searchIntervalHelp')}>
                  <InputNumber
                    min={5}
                    max={1440}
                    placeholder={t('settings.searchIntervalPlaceholder')}
                    value={interval}
                    formatter={(value) => `${value}`.replace(/\D/g, '')}
                    onChange={(value) => setInterval(value)}
                    suffix={t('settings.searchIntervalSuffix')}
                    style={{ maxWidth: 200 }}
                  />
                </SegmentPart>

                <SegmentPart name={t('settings.workingHours')} helpText={t('settings.workingHoursHelp')}>
                  <div className="generalSettings__timePickerContainer">
                    <TimePicker
                      format={'HH:mm'}
                      insetLabel={t('settings.workingHoursFrom')}
                      value={formatFromTBackend(workingHourFrom)}
                      placeholder=""
                      onChange={(val) => {
                        setWorkingHourFrom(val == null ? null : formatFromTimestamp(val));
                      }}
                    />
                    <TimePicker
                      format={'HH:mm'}
                      insetLabel={t('settings.workingHoursUntil')}
                      value={formatFromTBackend(workingHourTo)}
                      placeholder=""
                      onChange={(val) => {
                        setWorkingHourTo(val == null ? null : formatFromTimestamp(val));
                      }}
                    />
                  </div>
                </SegmentPart>

                <SegmentPart name={t('settings.proxyUrl')} helpText={t('settings.proxyUrlHelp')}>
                  <Input
                    type="text"
                    placeholder={t('settings.proxyUrlPlaceholder')}
                    value={proxyUrl}
                    onChange={(value) => setProxyUrl(value)}
                  />
                </SegmentPart>

                <div className="generalSettings__save-row">
                  <Button type="primary" theme="solid" onClick={handleStore} icon={<IconSave />}>
                    {t('settings.save')}
                  </Button>
                </div>
              </div>
            </TabPane>

            <TabPane
              tab={
                <span>
                  <IconHome size="small" style={{ marginRight: 6 }} />
                  {t('settings.tabUserSettings')}
                </span>
              }
              itemKey="userSettings"
            >
              <div className="generalSettings__tab-content">
                <SegmentPart name={t('settings.language')} helpText={t('settings.languageHelp')}>
                  <Select
                    style={{ width: 240 }}
                    value={language ?? 'en'}
                    disabled={savingLanguage}
                    optionList={availableLanguages.map((lang) => ({
                      label: `${lang.flag} ${lang.name}`,
                      value: lang.code,
                    }))}
                    onChange={async (code) => {
                      try {
                        await actions.userSettings.setLanguage(code);
                      } catch {
                        Toast.error(t('settings.languageSaveError'));
                      }
                    }}
                  />
                </SegmentPart>

                <SegmentPart name={t('settings.homeAddress')} helpText={t('settings.homeAddressHelp')}>
                  <AutoComplete
                    data={dataSource}
                    value={address}
                    showClear
                    onChange={(v) => setAddress(v)}
                    onSearch={searchAddress}
                    placeholder={t('settings.homeAddressPlaceholder')}
                    style={{ width: '100%' }}
                  />
                  {coords && coords.lat === -1 && (
                    <Banner
                      type="danger"
                      description={t('settings.homeAddressGeoError')}
                      closeIcon={null}
                      style={{ marginTop: 8 }}
                    />
                  )}
                </SegmentPart>

                <SegmentPart name={t('settings.providerDetails')} helpText={t('settings.providerDetailsHelp')}>
                  <Banner
                    type="warning"
                    description={t('settings.providerDetailsWarning')}
                    closeIcon={null}
                    style={{ marginBottom: 12 }}
                  />
                  <Select
                    multiple
                    style={{ width: '100%' }}
                    value={Array.isArray(providerDetails) ? providerDetails : []}
                    optionList={(allProviders ?? []).map((p) => ({ label: p.name, value: p.id }))}
                    placeholder={t('settings.providerDetailsPlaceholder')}
                    onChange={async (selected) => {
                      try {
                        await actions.userSettings.setProviderDetails(selected);
                        Toast.success(t('settings.providerDetailsUpdated'));
                      } catch {
                        Toast.error(t('settings.providerDetailsUpdateError'));
                      }
                    }}
                  />
                </SegmentPart>

                <SegmentPart name={t('settings.listingDeletion')} helpText={t('settings.listingDeletionHelp')}>
                  <RadioGroup
                    value={listingDeleteHard ? 'hard' : 'soft'}
                    onChange={(e) => setListingDeleteHard(e.target.value === 'hard')}
                  >
                    <Radio value="soft">
                      <div>
                        <Text strong>{t('settings.listingDeletionSoftLabel')}</Text>
                        <br />
                        <Text type="secondary">{t('settings.listingDeletionSoftDesc')}</Text>
                      </div>
                    </Radio>
                    <Radio value="hard">
                      <div>
                        <Text strong>{t('settings.listingDeletionHardLabel')}</Text>
                        <br />
                        <Text type="secondary">
                          {t('settings.listingDeletionHardDesc')}
                          <br />
                          <Text type="warning">{t('settings.listingDeletionHardConsequence')}</Text>
                        </Text>
                      </div>
                    </Radio>
                  </RadioGroup>
                  <Checkbox
                    checked={listingDeleteSkipPrompt}
                    onChange={(e) => setListingDeleteSkipPrompt(e.target.checked)}
                    style={{ marginTop: 12 }}
                  >
                    {t('settings.listingDeletionSkipPrompt')}
                  </Checkbox>
                </SegmentPart>

                <div className="generalSettings__save-row">
                  <Button
                    icon={<IconSave />}
                    theme="solid"
                    type="primary"
                    onClick={handleSaveUserSettings}
                    loading={saving}
                  >
                    {t('settings.save')}
                  </Button>
                </div>
              </div>
            </TabPane>

            <TabPane
              tab={
                <span>
                  <IconFolder size="small" style={{ marginRight: 6 }} />
                  {t('settings.tabBackup')}
                </span>
              }
              itemKey="backup"
            >
              <div className="generalSettings__tab-content">
                {demoMode && !currentUser?.isAdmin && (
                  <Banner
                    fullMode={false}
                    type="warning"
                    closeIcon={null}
                    style={{ marginBottom: '12px' }}
                    description={t('settings.backupDemoWarning')}
                  />
                )}
                <SegmentPart name={t('settings.backupSectionName')} helpText={t('settings.backupHelp')}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <Button
                      theme="solid"
                      icon={<IconSave />}
                      onClick={handleDownloadBackup}
                      disabled={demoMode && !currentUser?.isAdmin}
                    >
                      {t('settings.backupDownload')}
                    </Button>
                    <input
                      type="file"
                      accept=".zip,application/zip"
                      ref={fileInputRef}
                      style={{ display: 'none' }}
                      onChange={handleSelectRestoreFile}
                    />
                    <Button
                      onClick={handleOpenFilePicker}
                      theme="light"
                      icon={<IconFolder />}
                      disabled={demoMode && !currentUser?.isAdmin}
                    >
                      {t('settings.backupRestoreFromZip')}
                    </Button>
                  </div>
                </SegmentPart>
              </div>
            </TabPane>

            {currentUser?.isAdmin && (
              <TabPane
                tab={
                  <span>
                    <IconAlertTriangle
                      size="small"
                      style={{
                        marginRight: 6,
                        color: debugStatus?.enabled ? 'var(--semi-color-danger)' : undefined,
                      }}
                    />
                    {t('settings.tabDebug')}
                  </span>
                }
                itemKey="debug"
              >
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
              </TabPane>
            )}
          </Tabs>
        </>
      )}

      {restoreModalVisible && (
        <Modal
          title={t('settings.restoreModalTitle')}
          visible={restoreModalVisible}
          onCancel={() => setRestoreModalVisible(false)}
          onOk={() => performRestore(!precheckInfo?.compatible)}
          okText={precheckInfo?.compatible ? t('settings.restoreNow') : t('settings.restoreAnyway')}
          okType={precheckInfo?.compatible ? 'primary' : 'danger'}
          confirmLoading={restoreBusy}
        >
          {precheckInfo?.severity === 'danger' && (
            <Banner
              type="danger"
              fullMode={false}
              closeIcon={null}
              title={<div style={{ fontWeight: 600, fontSize: '14px' }}>{t('settings.restoreProblemDetected')}</div>}
              description={<div>{precheckInfo?.message}</div>}
            />
          )}
          {precheckInfo?.severity === 'warning' && (
            <Banner
              type="warning"
              fullMode={false}
              closeIcon={null}
              title={<div style={{ fontWeight: 600, fontSize: '14px' }}>{t('settings.restoreMigrationsApplied')}</div>}
              description={<div>{precheckInfo?.message}</div>}
            />
          )}
          {precheckInfo?.severity === 'info' && (
            <Banner
              type="success"
              fullMode={false}
              closeIcon={null}
              title={<div style={{ fontWeight: 600, fontSize: '14px' }}>{t('settings.restoreCompatible')}</div>}
              description={<div>{precheckInfo?.message}</div>}
            />
          )}
          <div style={{ marginTop: '0.5rem', fontSize: '12px', color: 'var(--semi-color-text-2)' }}>
            {t('settings.restoreMigrationInfo', {
              backupMigration: precheckInfo?.backupMigration ?? 'unknown',
              requiredMigration: precheckInfo?.requiredMigration ?? 'unknown',
            })}
          </div>
        </Modal>
      )}

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
    </div>
  );
};

export default GeneralSettings;
