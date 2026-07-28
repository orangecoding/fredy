/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';
import { Button, Banner, Modal, Toast } from '@douyinfe/semi-ui-19';
import { IconSave, IconFolder } from '@douyinfe/semi-icons';

import { SegmentPart } from '../../../components/segment/SegmentPart';
import {
  downloadBackup as downloadBackupZip,
  precheckRestore as clientPrecheckRestore,
  restore as clientRestore,
} from '../../../services/backupRestoreClient';
import { useTranslation } from '../../../services/i18n/i18n.jsx';

/**
 * Download the whole database, or replace it from a previous download.
 *
 * Restoring is deliberately a two-step: the uploaded archive is analysed first and what it would
 * do is spelled out before anything is overwritten. An archive from a newer Fredy needs an
 * explicit override, because migrating a schema backwards is not something this can do.
 *
 * @param {Object} props
 * @param {boolean} props.demoMode Whether this instance runs in demo mode.
 * @param {boolean} props.isAdmin Whether the current user may actually perform the actions.
 * @returns {React.ReactElement} One to be rendered inside the page's Tabs.
 */
export default function BackupPanel({ demoMode, isAdmin }) {
  const t = useTranslation();
  const fileInputRef = React.useRef(null);
  const [restoreModalVisible, setRestoreModalVisible] = React.useState(false);
  const [precheckInfo, setPrecheckInfo] = React.useState(null);
  const [restoreBusy, setRestoreBusy] = React.useState(false);
  const [selectedRestoreFile, setSelectedRestoreFile] = React.useState(null);
  const currentUser = { isAdmin };

  const handleDownloadBackup = React.useCallback(async () => {
    try {
      await downloadBackupZip();
    } catch (e) {
      console.error(e);
      Toast.error(t('settings.backupDownloadError'));
    }
  }, [t]);

  const precheckRestore = React.useCallback(
    async (file) => {
      try {
        const data = await clientPrecheckRestore(file);
        setPrecheckInfo(data);
        setRestoreModalVisible(true);
      } catch (e) {
        console.error(e);
        Toast.error(t('settings.backupAnalyzeError'));
      }
    },
    [t],
  );

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
    [selectedRestoreFile, t],
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

  return (
    <>
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
    </>
  );
}

BackupPanel.displayName = 'BackupPanel';
