/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React, { useEffect, useState, useMemo } from 'react';

import { useActions, useSelector, useIsLoading } from '../../services/state/store';

import {
  Tabs,
  TabPane,
  Divider,
  TimePicker,
  Button,
  Checkbox,
  Input,
  Modal,
  Typography,
  AutoComplete,
  Switch,
  Banner,
} from '@douyinfe/semi-ui-19';
import { InputNumber } from '@douyinfe/semi-ui-19';
import { xhrPost, xhrGet } from '../../services/xhr';
import { Toast } from '@douyinfe/semi-ui-19';
import {
  downloadBackup as downloadBackupZip,
  precheckRestore as clientPrecheckRestore,
  restore as clientRestore,
} from '../../services/backupRestoreClient';
import { IconSave, IconRefresh, IconSignal, IconHome, IconFolder } from '@douyinfe/semi-icons';
import debounce from 'lodash/debounce';
import './GeneralSettings.less';

const { Title, Text } = Typography;

function SectionHeader({ title, description }) {
  return (
    <div className="generalSettings__sectionHeader">
      <Title heading={5} className="generalSettings__sectionTitle">
        {title}
      </Title>
      {description && (
        <Text type="tertiary" size="small">
          {description}
        </Text>
      )}
    </div>
  );
}

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
  const fileInputRef = React.useRef(null);
  const [restoreModalVisible, setRestoreModalVisible] = React.useState(false);
  const [precheckInfo, setPrecheckInfo] = React.useState(null);
  const [restoreBusy, setRestoreBusy] = React.useState(false);
  const [selectedRestoreFile, setSelectedRestoreFile] = React.useState(null);

  // User settings state
  const homeAddress = useSelector((state) => state.userSettings.settings.home_address);
  const immoscoutDetails = useSelector((state) => state.userSettings.settings.immoscout_details);
  const [address, setAddress] = useState(homeAddress?.address || '');
  const [coords, setCoords] = useState(homeAddress?.coords || null);
  const saving = useIsLoading(actions.userSettings.setHomeAddress);
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
      setPort(settings?.port);
      setWorkingHourFrom(settings?.workingHours?.from);
      setWorkingHourTo(settings?.workingHours?.to);
      setAnalyticsEnabled(settings?.analyticsEnabled || false);
      setDemoMode(settings?.demoMode || false);
      setSqlitePath(settings?.sqlitepath);
    }

    init();
  }, [settings]);

  useEffect(() => {
    setAddress(homeAddress?.address || '');
    setCoords(homeAddress?.coords || null);
  }, [homeAddress]);

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
      ev.target.value = '';
    },
    [precheckRestore],
  );

  const handleOpenFilePicker = React.useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  const handleSaveUserSettings = async () => {
    try {
      const responseJson = await actions.userSettings.setHomeAddress(address);
      setCoords(responseJson.coords);
      await actions.userSettings.getUserSettings();
      Toast.success('Settings saved. Distance calculations are running in the background.');
    } catch (error) {
      Toast.error(error.json?.error || 'Error while saving settings');
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
      {!loading && (
        <>
          <Tabs type="line">
            <TabPane
              tab={
                <span>
                  <IconRefresh size="small" style={{ marginRight: 6 }} />
                  Execution
                </span>
              }
              itemKey="execution"
            >
              <div className="generalSettings__tab-content">
                <SectionHeader
                  title="Search Interval"
                  description="Interval in minutes for running queries against configured services. Do not go below 5 minutes to avoid being detected as a bot."
                />
                <InputNumber
                  min={5}
                  max={1440}
                  placeholder="Interval in minutes"
                  value={interval}
                  formatter={(value) => `${value}`.replace(/\D/g, '')}
                  onChange={(value) => setInterval(value)}
                  suffix={'minutes'}
                  style={{ maxWidth: 200 }}
                />

                <Divider className="generalSettings__divider" />

                <SectionHeader
                  title="Working Hours"
                  description="Fredy will only search for listings during these hours. Leave empty to search around the clock."
                />
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

                <div className="generalSettings__save-row">
                  <Button type="primary" theme="solid" onClick={handleStore} icon={<IconSave />}>
                    Save
                  </Button>
                </div>
              </div>
            </TabPane>

            <TabPane
              tab={
                <span>
                  <IconSignal size="small" style={{ marginRight: 6 }} />
                  System
                </span>
              }
              itemKey="system"
            >
              <div className="generalSettings__tab-content">
                <SectionHeader title="Port" description="The port on which Fredy is running." />
                <InputNumber
                  min={0}
                  max={99999}
                  placeholder="Port"
                  value={port}
                  formatter={(value) => `${value}`.replace(/\D/g, '')}
                  onChange={(value) => setPort(value)}
                  style={{ maxWidth: 160 }}
                />

                <Divider className="generalSettings__divider" />

                <SectionHeader
                  title="SQLite Database Path"
                  description="The directory where Fredy stores its SQLite database files."
                />
                <Banner
                  fullMode={false}
                  type="warning"
                  closeIcon={null}
                  style={{ marginBottom: '12px', maxWidth: 480 }}
                  description="Changing this path may result in data loss. Restart Fredy immediately after saving."
                />
                <Input
                  type="text"
                  placeholder="Database folder path"
                  value={sqlitePath}
                  onChange={(value) => setSqlitePath(value)}
                  style={{ maxWidth: 480 }}
                />

                <Divider className="generalSettings__divider" />

                <SectionHeader
                  title="Backup & Restore"
                  description="Download a zipped backup of your database or restore from a backup zip."
                />
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <Button theme="solid" icon={<IconSave />} onClick={handleDownloadBackup}>
                    Download Backup
                  </Button>
                  <input
                    type="file"
                    accept=".zip,application/zip"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    onChange={handleSelectRestoreFile}
                  />
                  <Button onClick={handleOpenFilePicker} theme="light" icon={<IconFolder />}>
                    Restore from Zip
                  </Button>
                </div>

                <Divider className="generalSettings__divider" />

                <SectionHeader
                  title="Analytics"
                  description="Anonymous usage data to help improve Fredy — provider names, adapter names, OS, Node version, and architecture."
                />
                <Checkbox checked={analyticsEnabled} onChange={(e) => setAnalyticsEnabled(e.target.checked)}>
                  Enable analytics
                </Checkbox>

                <Divider className="generalSettings__divider" />

                <SectionHeader
                  title="Demo Mode"
                  description="In demo mode, Fredy will not search for real estates and all data resets to defaults at midnight."
                />
                <Checkbox checked={demoMode} onChange={(e) => setDemoMode(e.target.checked)}>
                  Enable demo mode
                </Checkbox>

                <div className="generalSettings__save-row">
                  <Button type="primary" theme="solid" onClick={handleStore} icon={<IconSave />}>
                    Save
                  </Button>
                </div>
              </div>
            </TabPane>

            <TabPane
              tab={
                <span>
                  <IconHome size="small" style={{ marginRight: 6 }} />
                  User Settings
                </span>
              }
              itemKey="userSettings"
            >
              <div className="generalSettings__tab-content">
                <SectionHeader
                  title="Home Address"
                  description="Used to calculate distances between your location and each listing. Updating this recalculates distances for all active listings."
                />
                <AutoComplete
                  data={dataSource}
                  value={address}
                  showClear
                  onChange={(v) => setAddress(v)}
                  onSearch={searchAddress}
                  placeholder="Enter your home address"
                  style={{ width: '100%', maxWidth: 480 }}
                />
                {coords && coords.lat === -1 && (
                  <Banner
                    type="danger"
                    description="Address found but could not be geocoded accurately."
                    closeIcon={null}
                    style={{ marginTop: 8, maxWidth: 480 }}
                  />
                )}

                <Divider className="generalSettings__divider" />

                <SectionHeader
                  title="ImmoScout Details"
                  description="Fetch additional details (description, attributes, agent info) for ImmoScout listings. Makes an extra API call per listing."
                />
                <Banner
                  type="warning"
                  description="Enabling this significantly increases API requests to ImmoScout, raising the chance of rate limiting or blocking. Use at your own risk."
                  closeIcon={null}
                  style={{ marginBottom: 12, maxWidth: 480 }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Switch
                    checked={!!immoscoutDetails}
                    onChange={async (checked) => {
                      try {
                        await actions.userSettings.setImmoscoutDetails(checked);
                        Toast.success('ImmoScout details setting updated.');
                      } catch {
                        Toast.error('Failed to update setting.');
                      }
                    }}
                  />
                  <Text>Fetch detailed ImmoScout listings</Text>
                </div>

                <div className="generalSettings__save-row">
                  <Button
                    icon={<IconSave />}
                    theme="solid"
                    type="primary"
                    onClick={handleSaveUserSettings}
                    loading={saving}
                  >
                    Save
                  </Button>
                </div>
              </div>
            </TabPane>
          </Tabs>
        </>
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
