/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/*
 * Copyright (c) 2025-2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';

import { useActions, useSelector } from '../../services/state/store';

import { Divider, TimePicker, Button, Checkbox, Input, Modal } from '@douyinfe/semi-ui';
import { InputNumber } from '@douyinfe/semi-ui';
import { xhrPost } from '../../services/xhr';
import { SegmentPart } from '../../components/segment/SegmentPart';
import { Banner, Toast } from '@douyinfe/semi-ui';
import {
  downloadBackup as downloadBackupZip,
  precheckRestore as clientPrecheckRestore,
  restore as clientRestore,
} from '../../services/backupRestoreClient';
import {
  IconSave,
  IconCalendar,
  IconRefresh,
  IconSignal,
  IconLineChartStroked,
  IconSearch,
  IconFolder,
  IconGlobeStroke,
} from '@douyinfe/semi-icons';
import './GeneralSettings.less';

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

const GeneralSettings = function GeneralSettings() {
  const actions = useActions();
  const [loading, setLoading] = React.useState(true);

  const settings = useSelector((state) => state.generalSettings.settings);

  const [interval, setInterval] = React.useState('');
  const [port, setPort] = React.useState('');
  const [workingHourFrom, setWorkingHourFrom] = React.useState(null);
  const [workingHourTo, setWorkingHourTo] = React.useState(null);
  const [demoMode, setDemoMode] = React.useState(null);
  const [analyticsEnabled, setAnalyticsEnabled] = React.useState(null);
  const [sqlitePath, setSqlitePath] = React.useState(null);
  const [proxyUrl, setProxyUrl] = React.useState('');
  const [proxyUsername, setProxyUsername] = React.useState('');
  const [proxyPassword, setProxyPassword] = React.useState('');
  const [twoCaptchaApiKey, setTwoCaptchaApiKey] = React.useState('');
  const [brightDataApiToken, setBrightDataApiToken] = React.useState('');
  const [brightDataZone, setBrightDataZone] = React.useState('');
  const fileInputRef = React.useRef(null);
  const [restoreModalVisible, setRestoreModalVisible] = React.useState(false);
  const [precheckInfo, setPrecheckInfo] = React.useState(null);
  const [restoreBusy, setRestoreBusy] = React.useState(false);
  const [selectedRestoreFile, setSelectedRestoreFile] = React.useState(null);

  React.useEffect(() => {
    async function init() {
      await actions.generalSettings.getGeneralSettings();
      setLoading(false);
    }

    init();
  }, []);

  React.useEffect(() => {
    setInterval(settings?.interval);
    setPort(settings?.port);
    setWorkingHourFrom(settings?.workingHours?.from);
    setWorkingHourTo(settings?.workingHours?.to);
    setAnalyticsEnabled(settings?.analyticsEnabled || false);
    setDemoMode(settings?.demoMode || false);
    setSqlitePath(settings?.sqlitepath);
    setProxyUrl(settings?.proxyUrl || '');
    setProxyUsername(settings?.proxyUsername || '');
    setProxyPassword(settings?.proxyPassword || '');
    setTwoCaptchaApiKey(settings?.twoCaptchaApiKey || '');
    setBrightDataApiToken(settings?.brightDataApiToken || '');
    setBrightDataZone(settings?.brightDataZone || '');
  }, [settings]);

  const nullOrEmpty = (val) => val == null || val.length === 0;

  const handleStore = async () => {
    if (nullOrEmpty(interval)) {
      Toast.error('Interval may not be empty.');
      return;
    }
    if (nullOrEmpty(port)) {
      Toast.error('Port may not be empty.');
      return;
    }
    if (
      (!nullOrEmpty(workingHourFrom) && nullOrEmpty(workingHourTo)) ||
      (nullOrEmpty(workingHourFrom) && !nullOrEmpty(workingHourTo))
    ) {
      Toast.error('Working hours to and from must be set if either to or from has been set before.');
      return;
    }
    if (nullOrEmpty(sqlitePath)) {
      Toast.error('SQLite db path cannot be empty.');
      return;
    }
    try {
      await xhrPost('/api/admin/generalSettings', {
        interval,
        port,
        workingHours: {
          from: workingHourFrom,
          to: workingHourTo,
        },
        demoMode,
        analyticsEnabled,
        sqlitepath: sqlitePath,
        proxyUrl,
        proxyUsername,
        proxyPassword,
        twoCaptchaApiKey,
        brightDataApiToken,
        brightDataZone,
      });
    } catch (exception) {
      console.error(exception);
      if (exception?.json?.message != null) {
        Toast.error(exception.json.message);
      } else {
        Toast.error('Error while trying to store settings.');
      }
      return;
    }
    Toast.success('Settings stored successfully. We will reload your browser in 3 seconds.');
    setTimeout(() => {
      location.reload();
    }, 3000);
  };

  const handleDownloadBackup = React.useCallback(async () => {
    try {
      await downloadBackupZip();
    } catch (e) {
      console.error(e);
      Toast.error('Unexpected error while downloading backup.');
    }
  }, []);

  const precheckRestore = React.useCallback(async (file) => {
    try {
      const data = await clientPrecheckRestore(file);
      setPrecheckInfo(data);
      setRestoreModalVisible(true);
    } catch (e) {
      console.error(e);
      Toast.error('Failed to analyze backup.');
    }
  }, []);

  const performRestore = React.useCallback(
    async (force) => {
      try {
        setRestoreBusy(true);
        await clientRestore(selectedRestoreFile, force);
        Toast.success('Restore completed. Please restart the Fredy backend now!');
      } catch (e) {
        console.error(e);
        Toast.error(e?.message || 'Unexpected error while restoring backup.');
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
      // reset the input to allow same file re-select
      ev.target.value = '';
    },
    [precheckRestore],
  );

  const handleOpenFilePicker = React.useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  return (
    <div>
      {!loading && (
        <React.Fragment>
          <div>
            <SegmentPart
              name="Interval"
              helpText="Interval in minutes for running queries against the configured services. Do NOT go under 5 minutes as with a lower interval, your instance might be detected as a bot."
              Icon={IconRefresh}
            >
              <InputNumber
                min={5}
                max={1440}
                placeholder="Interval in minutes"
                value={interval}
                formatter={(value) => `${value}`.replace(/\D/g, '')}
                onChange={(value) => setInterval(value)}
                suffix={'minutes'}
              />
            </SegmentPart>
            <Divider margin="1rem" />
            <SegmentPart
              name="Backup & Restore"
              helpText="Download a zipped backup of your database or restore it from a backup zip."
              Icon={IconSave}
            >
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <Button theme="solid" icon={<IconSave />} onClick={handleDownloadBackup}>
                  Download backup
                </Button>
                <input
                  type="file"
                  accept=".zip,application/zip"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  onChange={handleSelectRestoreFile}
                />
                <Button onClick={handleOpenFilePicker} theme="light" icon={<IconFolder />}>
                  Restore from zip
                </Button>
              </div>
            </SegmentPart>
            <Divider margin="1rem" />
            <SegmentPart name="Port" helpText="Port on which Fredy is running." Icon={IconSignal}>
              <InputNumber
                min={0}
                max={99999}
                placeholder="Port"
                value={port}
                formatter={(value) => `${value}`.replace(/\D/g, '')}
                onChange={(value) => setPort(value)}
              />
            </SegmentPart>
            <Divider margin="1rem" />
            <SegmentPart
              name="SQLite Database path"
              helpText="The directory where Fredy stores its SQLite database files."
              Icon={IconFolder}
            >
              <Banner
                fullMode={false}
                type="warning"
                closeIcon={null}
                title={<div style={{ fontWeight: 600, fontSize: '14px', lineHeight: '20px' }}>Warning</div>}
                style={{ marginBottom: '1rem' }}
                description={
                  <div>
                    Changing the path later may result in data loss.
                    <br />
                    You <b>must</b> restart Fredy immediately after changing this setting!
                  </div>
                }
              />

              <Input
                type="text"
                placeholder="Select folder"
                value={sqlitePath}
                onChange={(value) => {
                  setSqlitePath(value);
                }}
              />
            </SegmentPart>
            <Divider margin="1rem" />
            <SegmentPart
              name="Working hours"
              helpText="During these hours, Fredy will search for new apartments. If nothing is configured, Fredy will search around the clock."
              Icon={IconCalendar}
            >
              <div className="generalSettings__timePickerContainer">
                <TimePicker
                  format={'HH:mm'}
                  insetLabel="From"
                  value={formatFromTBackend(workingHourFrom)}
                  placeholder=""
                  onChange={(val) => {
                    setWorkingHourFrom(val == null ? null : formatFromTimestamp(val));
                  }}
                />
                <TimePicker
                  format={'HH:mm'}
                  insetLabel="Until"
                  value={formatFromTBackend(workingHourTo)}
                  placeholder=""
                  onChange={(val) => {
                    setWorkingHourTo(val == null ? null : formatFromTimestamp(val));
                  }}
                />
              </div>
            </SegmentPart>
            <Divider margin="1rem" />

            <SegmentPart name="Analytics" helpText="Insights into the usage of Fredy." Icon={IconLineChartStroked}>
              <Banner
                fullMode={false}
                type="info"
                closeIcon={null}
                title={<div style={{ fontWeight: 600, fontSize: '14px', lineHeight: '20px' }}>Explanation</div>}
                style={{ marginBottom: '1rem' }}
                description={
                  <div>
                    Analytics are disabled by default. If you choose to enable them, we will begin tracking the
                    following:
                    <br />
                    <ul>
                      <li>Name of active provider (e.g. Immoscout)</li>
                      <li>Name of active adapter (e.g. Console)</li>
                      <li>language</li>
                      <li>os</li>
                      <li>node version</li>
                      <li>arch</li>
                    </ul>
                    The data is sent anonymously and helps me understand which providers or adapters are being used the
                    most. In the end it helps me to improve fredy.
                  </div>
                }
              />

              <Checkbox checked={analyticsEnabled} onChange={(e) => setAnalyticsEnabled(e.target.checked)}>
                {' '}
                Enabled
              </Checkbox>
            </SegmentPart>

            <Divider margin="1rem" />

            <SegmentPart name="Demo Mode" helpText="If enabled, Fredy runs in demo mode." Icon={IconSearch}>
              <Banner
                fullMode={false}
                type="info"
                closeIcon={null}
                title={<div style={{ fontWeight: 600, fontSize: '14px', lineHeight: '20px' }}>Explanation</div>}
                style={{ marginBottom: '1rem' }}
                description={
                  <div>
                    In demo mode, Fredy will not (really) search for any real estates. Fredy is in a lockdown mode. Also
                    all database files will be set back to the default values at midnight.
                  </div>
                }
              />

              <Checkbox checked={demoMode} onChange={(e) => setDemoMode(e.target.checked)}>
                {' '}
                Enabled
              </Checkbox>
            </SegmentPart>

            <Divider margin="1rem" />

            <SegmentPart
              name="Anti-Bot Settings"
              helpText="Configure proxy and captcha solving for providers with anti-bot protection (e.g., ImmoScout24.ch)."
              Icon={IconGlobeStroke}
            >
              <Banner
                fullMode={false}
                type="info"
                closeIcon={null}
                title={<div style={{ fontWeight: 600, fontSize: '14px', lineHeight: '20px' }}>When to use</div>}
                style={{ marginBottom: '1rem' }}
                description={
                  <div>
                    Some providers use anti-bot protection (like DataDome) that blocks automated requests. A residential
                    proxy routes requests through real ISP IPs, and 2Captcha solves any captcha challenges that appear.
                    <br />
                    <br />
                    Recommended providers: <b>DataImpulse</b> (~$1/GB residential proxy), <b>2Captcha</b> (~$1.45/1000
                    captchas)
                  </div>
                }
              />

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div
                  style={{ fontSize: '13px', fontWeight: 600, color: 'var(--semi-color-text-1)', marginTop: '0.5rem' }}
                >
                  Residential Proxy
                </div>
                <Input
                  type="text"
                  placeholder="http://proxy.example.com:8080"
                  value={proxyUrl}
                  onChange={(value) => setProxyUrl(value)}
                  prefix="URL"
                />
                <Input
                  type="text"
                  placeholder="Username (optional)"
                  value={proxyUsername}
                  onChange={(value) => setProxyUsername(value)}
                  prefix="User"
                />
                <Input
                  type="password"
                  placeholder="Password (optional)"
                  value={proxyPassword}
                  onChange={(value) => setProxyPassword(value)}
                  prefix="Pass"
                  mode="password"
                />
                <div
                  style={{ fontSize: '13px', fontWeight: 600, color: 'var(--semi-color-text-1)', marginTop: '0.5rem' }}
                >
                  Captcha Solver (2Captcha)
                </div>
                <Input
                  type="password"
                  placeholder="API key from 2captcha.com"
                  value={twoCaptchaApiKey}
                  onChange={(value) => setTwoCaptchaApiKey(value)}
                  prefix="API Key"
                  mode="password"
                />
                <div
                  style={{ fontSize: '13px', fontWeight: 600, color: 'var(--semi-color-text-1)', marginTop: '0.5rem' }}
                >
                  Bright Data Web Unlocker (Recommended)
                </div>
                <Input
                  type="password"
                  placeholder="API token from brightdata.com"
                  value={brightDataApiToken}
                  onChange={(value) => setBrightDataApiToken(value)}
                  prefix="API Token"
                  mode="password"
                />
                <Input
                  placeholder="Zone name (e.g., immoscout)"
                  value={brightDataZone}
                  onChange={(value) => setBrightDataZone(value)}
                  prefix="Zone"
                />
              </div>
            </SegmentPart>

            <Divider margin="1rem" />
            <Button type="primary" theme="solid" onClick={handleStore} icon={<IconSave />}>
              Save
            </Button>
          </div>
        </React.Fragment>
      )}
      {restoreModalVisible && (
        <Modal
          title="Restore database"
          visible={restoreModalVisible}
          onCancel={() => setRestoreModalVisible(false)}
          onOk={() => performRestore(!precheckInfo?.compatible)}
          okText={precheckInfo?.compatible ? 'Restore now' : 'Restore anyway'}
          okType={precheckInfo?.compatible ? 'primary' : 'danger'}
          confirmLoading={restoreBusy}
        >
          {precheckInfo?.severity === 'danger' && (
            <Banner
              type="danger"
              fullMode={false}
              closeIcon={null}
              title={<div style={{ fontWeight: 600, fontSize: '14px' }}>Problem detected</div>}
              description={<div>{precheckInfo?.message}</div>}
            />
          )}
          {precheckInfo?.severity === 'warning' && (
            <Banner
              type="warning"
              fullMode={false}
              closeIcon={null}
              title={<div style={{ fontWeight: 600, fontSize: '14px' }}>Automatic migrations will be applied</div>}
              description={<div>{precheckInfo?.message}</div>}
            />
          )}
          {precheckInfo?.severity === 'info' && (
            <Banner
              type="success"
              fullMode={false}
              closeIcon={null}
              title={<div style={{ fontWeight: 600, fontSize: '14px' }}>Backup is compatible</div>}
              description={<div>{precheckInfo?.message}</div>}
            />
          )}
          <div style={{ marginTop: '0.5rem', fontSize: '12px', color: 'var(--semi-color-text-2)' }}>
            Backup migration: {precheckInfo?.backupMigration ?? 'unknown'} | Required migration:{' '}
            {precheckInfo?.requiredMigration ?? 'unknown'}
          </div>
        </Modal>
      )}
    </div>
  );
};

export default GeneralSettings;
