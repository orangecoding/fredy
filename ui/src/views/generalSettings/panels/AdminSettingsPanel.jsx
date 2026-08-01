/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';
import { TimePicker, Button, Checkbox, Input, InputNumber, Banner, Toast } from '@douyinfe/semi-ui-19';
import { IconSave } from '@douyinfe/semi-icons';

import { SegmentPart } from '../../../components/segment/SegmentPart';
import { xhrPost, errorMessage } from '../../../services/xhr';
import { useTranslation } from '../../../services/i18n/i18n.jsx';

/**
 * @param {number} ts
 * @returns {string}
 */
function formatFromTimestamp(ts) {
  const date = new Date(ts);
  return `${date.getHours()}:${date.getMinutes() > 9 ? date.getMinutes() : '0' + date.getMinutes()}`;
}

/**
 * @param {string|null} time HH:mm as the backend stores it.
 * @returns {number|null}
 */
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

const nullOrEmpty = (val) => val == null || val.length === 0;

/**
 * The operator settings: their state, and the one request that saves all of them.
 *
 * Split out of the 1030-line GeneralSettings component, which held instance configuration,
 * per-user preferences, backup and debug capture in one body with roughly twenty-five useState
 * hooks and one effect re-seeding ten of them. Any edit re-rendered all four concerns, and there
 * was no seam at which to gate the operator half.
 *
 * A hook rather than a component because its two tabs share one form and one Save: Semi's `Tabs`
 * reads `tab` and `itemKey` off its direct children, so the TabPane wrappers have to stay in the
 * page and cannot be hidden inside a component.
 *
 * @param {Object} settings The global settings from the store.
 * @returns {Object} State, setters and the save handler for both operator tabs.
 */
export function useAdminSettings(settings) {
  const t = useTranslation();

  // Not named `interval`/`setInterval`: that would shadow window.setInterval for the whole body.
  const [scanInterval, setScanInterval] = React.useState('');
  const [proxyUrl, setProxyUrl] = React.useState('');
  const [port, setPort] = React.useState('');
  const [workingHourFrom, setWorkingHourFrom] = React.useState(null);
  const [workingHourTo, setWorkingHourTo] = React.useState(null);
  const [demoMode, setDemoMode] = React.useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = React.useState(false);
  const [sqlitePath, setSqlitePath] = React.useState(null);
  const [baseUrl, setBaseUrl] = React.useState('');
  const [sessionTTL, setSessionTTL] = React.useState('');
  const [listingRetentionDays, setListingRetentionDays] = React.useState(14);
  const [priceTrackingEnabled, setPriceTrackingEnabled] = React.useState(false);
  const [priceCheckIntervalDays, setPriceCheckIntervalDays] = React.useState(7);
  const [priceCheckLimitPerRun, setPriceCheckLimitPerRun] = React.useState(100);
  const [priceChangeThresholdPercent, setPriceChangeThresholdPercent] = React.useState(1);

  // Seeded from the store, and re-seeded whenever it changes identity - the settings request may
  // still have been in flight when this mounted.
  React.useEffect(() => {
    setScanInterval(settings?.interval);
    setProxyUrl(settings?.proxyUrl ?? '');
    setPort(settings?.port);
    setWorkingHourFrom(settings?.workingHours?.from);
    setWorkingHourTo(settings?.workingHours?.to);
    setAnalyticsEnabled(settings?.analyticsEnabled || false);
    setDemoMode(settings?.demoMode || false);
    setSqlitePath(settings?.sqlitepath);
    setBaseUrl(settings?.baseUrl ?? '');
    setSessionTTL(settings?.sessionTTL ?? '');
    setListingRetentionDays(settings?.listingRetentionDays ?? 14);
    setPriceTrackingEnabled(settings?.priceTrackingEnabled === true);
    setPriceCheckIntervalDays(settings?.priceCheckIntervalDays ?? 7);
    setPriceCheckLimitPerRun(settings?.priceCheckLimitPerRun ?? 100);
    setPriceChangeThresholdPercent(settings?.priceChangeThresholdPercent ?? 1);
  }, [settings]);

  const handleStore = async () => {
    if (nullOrEmpty(scanInterval)) {
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
    // A cleared field must not be sent: the backend would have to guess, and guessing on a setting
    // that drives an irreversible delete is the wrong default either way.
    if (
      !Number.isInteger(Number(listingRetentionDays)) ||
      listingRetentionDays === '' ||
      listingRetentionDays == null
    ) {
      Toast.error(t('settings.toastListingRetentionInvalid'));
      return;
    }
    // Only the interval and the limit are guarded here. They decide how much traffic Fredy sends at
    // the portals, so a cleared field must not be silently coerced into a value the operator never
    // chose - the threshold is allowed to be 0, which legitimately means "notify me about anything".
    if (
      !Number.isInteger(Number(priceCheckIntervalDays)) ||
      Number(priceCheckIntervalDays) < 1 ||
      !Number.isInteger(Number(priceCheckLimitPerRun)) ||
      Number(priceCheckLimitPerRun) < 1
    ) {
      Toast.error(t('settings.toastPriceTrackingInvalid'));
      return;
    }
    try {
      await xhrPost('/api/admin/generalSettings', {
        interval: scanInterval,
        proxyUrl: proxyUrl?.trim() ?? '',
        port,
        workingHours: { from: workingHourFrom, to: workingHourTo },
        demoMode,
        analyticsEnabled,
        sqlitepath: sqlitePath,
        baseUrl,
        sessionTTL,
        listingRetentionDays: Number(listingRetentionDays),
        priceTrackingEnabled,
        priceCheckIntervalDays: Number(priceCheckIntervalDays),
        priceCheckLimitPerRun: Number(priceCheckLimitPerRun),
        priceChangeThresholdPercent: Number(priceChangeThresholdPercent),
      });
    } catch (exception) {
      console.error(exception);
      // The backend returns the concrete reason (e.g. a 403 "Only admins can change these
      // settings."), which errorMessage() reads from whichever key the route used.
      Toast.error(errorMessage(exception, t('settings.toastSaveError')));
      return;
    }
    Toast.success(t('settings.toastSavedReloading'));
    setTimeout(() => {
      location.reload();
    }, 3000);
  };

  return {
    t,
    scanInterval,
    setScanInterval,
    proxyUrl,
    setProxyUrl,
    port,
    setPort,
    workingHourFrom,
    setWorkingHourFrom,
    workingHourTo,
    setWorkingHourTo,
    demoMode,
    setDemoMode,
    analyticsEnabled,
    setAnalyticsEnabled,
    sqlitePath,
    setSqlitePath,
    baseUrl,
    setBaseUrl,
    sessionTTL,
    setSessionTTL,
    listingRetentionDays,
    setListingRetentionDays,
    priceTrackingEnabled,
    setPriceTrackingEnabled,
    priceCheckIntervalDays,
    setPriceCheckIntervalDays,
    priceCheckLimitPerRun,
    setPriceCheckLimitPerRun,
    priceChangeThresholdPercent,
    setPriceChangeThresholdPercent,
    handleStore,
  };
}

/**
 * The instance tab: port, base URL, session lifetime, listing retention, database location,
 * analytics, demo mode.
 *
 * @param {ReturnType<typeof useAdminSettings>} admin
 * @returns {React.ReactElement}
 */
export function SystemSettingsTab(admin) {
  const {
    t,
    port,
    setPort,
    baseUrl,
    setBaseUrl,
    sessionTTL,
    setSessionTTL,
    listingRetentionDays,
    setListingRetentionDays,
    sqlitePath,
    setSqlitePath,
    analyticsEnabled,
    setAnalyticsEnabled,
    demoMode,
    setDemoMode,
    handleStore,
  } = admin;

  return (
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

      <SegmentPart name={t('settings.sessionTTL')} helpText={t('settings.sessionTTLHelp')}>
        <Input
          type="text"
          placeholder={t('settings.sessionTTLPlaceholder')}
          value={sessionTTL}
          onChange={(value) => setSessionTTL(value)}
        />
      </SegmentPart>

      <SegmentPart name={t('settings.listingRetention')} helpText={t('settings.listingRetentionHelp')}>
        <InputNumber
          min={0}
          max={365}
          placeholder={t('settings.listingRetentionPlaceholder')}
          value={listingRetentionDays}
          formatter={(value) => `${value}`.replace(/\D/g, '')}
          onChange={(value) => setListingRetentionDays(value)}
          suffix={t('settings.listingRetentionSuffix')}
          style={{ maxWidth: 200 }}
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
  );
}

SystemSettingsTab.displayName = 'SystemSettingsTab';

/**
 * The execution tab: how often Fredy searches, within which hours, through which proxy.
 *
 * @param {ReturnType<typeof useAdminSettings>} admin
 * @returns {React.ReactElement}
 */
export function ExecutionSettingsTab(admin) {
  const {
    t,
    scanInterval,
    setScanInterval,
    workingHourFrom,
    setWorkingHourFrom,
    workingHourTo,
    setWorkingHourTo,
    proxyUrl,
    setProxyUrl,
    priceTrackingEnabled,
    setPriceTrackingEnabled,
    priceCheckIntervalDays,
    setPriceCheckIntervalDays,
    priceCheckLimitPerRun,
    setPriceCheckLimitPerRun,
    priceChangeThresholdPercent,
    setPriceChangeThresholdPercent,
    handleStore,
  } = admin;

  return (
    <div className="generalSettings__tab-content">
      <SegmentPart name={t('settings.searchInterval')} helpText={t('settings.searchIntervalHelp')}>
        <InputNumber
          min={5}
          max={1440}
          placeholder={t('settings.searchIntervalPlaceholder')}
          value={scanInterval}
          formatter={(value) => `${value}`.replace(/\D/g, '')}
          onChange={(value) => setScanInterval(value)}
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

      {/*
        One block rather than four. The three dials are meaningless on their own - they only
        describe how the sweep behaves once it exists - so presenting them as peers of the switch
        invited reading them as four independent knobs. They stay visible while disabled so an
        operator can see what turning the feature on would commit them to.
      */}
      <SegmentPart name={t('settings.priceTracking')} helpText={t('settings.priceTrackingHelp')}>
        {/*
          Above the switch, not below it. Turning this on is the moment the operator takes on the
          risk, so the warning has to be in front of them beforehand, not revealed as a consequence.
        */}
        <Banner
          fullMode={false}
          type="warning"
          closeIcon={null}
          style={{ marginBottom: '12px' }}
          title={t('settings.priceTrackingWarningTitle')}
          description={
            <>
              <p style={{ margin: '0 0 8px' }}>{t('settings.priceTrackingWarningBody')}</p>
              <p style={{ margin: 0 }}>{t('settings.priceTrackingWarningDefaults')}</p>
            </>
          }
        />

        <Checkbox checked={priceTrackingEnabled} onChange={(e) => setPriceTrackingEnabled(e.target.checked)}>
          {t('settings.priceTrackingEnabled')}
        </Checkbox>

        <div
          className={`generalSettings__subSettings${priceTrackingEnabled ? '' : ' generalSettings__subSettings--disabled'}`}
        >
          <div className="generalSettings__subSetting">
            <label className="generalSettings__subSetting__label" htmlFor="priceCheckIntervalDays">
              {t('settings.priceCheckInterval')}
            </label>
            <p className="generalSettings__subSetting__help">{t('settings.priceCheckIntervalHelp')}</p>
            <InputNumber
              id="priceCheckIntervalDays"
              min={1}
              max={30}
              disabled={!priceTrackingEnabled}
              value={priceCheckIntervalDays}
              formatter={(value) => `${value}`.replace(/\D/g, '')}
              onChange={(value) => setPriceCheckIntervalDays(value)}
              suffix={t('settings.listingRetentionSuffix')}
              style={{ maxWidth: 200 }}
            />
          </div>

          <div className="generalSettings__subSetting">
            <label className="generalSettings__subSetting__label" htmlFor="priceCheckLimitPerRun">
              {t('settings.priceCheckLimit')}
            </label>
            <p className="generalSettings__subSetting__help">{t('settings.priceCheckLimitHelp')}</p>
            <InputNumber
              id="priceCheckLimitPerRun"
              min={1}
              max={500}
              disabled={!priceTrackingEnabled}
              value={priceCheckLimitPerRun}
              formatter={(value) => `${value}`.replace(/\D/g, '')}
              onChange={(value) => setPriceCheckLimitPerRun(value)}
              style={{ maxWidth: 200 }}
            />
          </div>

          <div className="generalSettings__subSetting">
            <label className="generalSettings__subSetting__label" htmlFor="priceChangeThresholdPercent">
              {t('settings.priceChangeThreshold')}
            </label>
            <p className="generalSettings__subSetting__help">{t('settings.priceChangeThresholdHelp')}</p>
            <InputNumber
              id="priceChangeThresholdPercent"
              min={0}
              max={50}
              step={0.5}
              disabled={!priceTrackingEnabled}
              value={priceChangeThresholdPercent}
              onChange={(value) => setPriceChangeThresholdPercent(value)}
              suffix="%"
              style={{ maxWidth: 200 }}
            />
          </div>
        </div>
      </SegmentPart>

      <div className="generalSettings__save-row">
        <Button type="primary" theme="solid" onClick={handleStore} icon={<IconSave />}>
          {t('settings.save')}
        </Button>
      </div>
    </div>
  );
}

ExecutionSettingsTab.displayName = 'ExecutionSettingsTab';
