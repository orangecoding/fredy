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
import { IconSave, IconRefresh, IconSignal, IconHome, IconFolder } from '@douyinfe/semi-icons';
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
    </div>
  );
};

export default GeneralSettings;
