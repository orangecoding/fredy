/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';
import { Button, Banner, Modal, Toast } from '@douyinfe/semi-ui-19';
import { IconSave, IconFolder, IconAlertTriangle } from '@douyinfe/semi-icons';

import { SegmentPart } from '../../../components/segment/SegmentPart';
import {
  downloadBackup as downloadBackupZip,
  precheckRestore as clientPrecheckRestore,
  restore as clientRestore,
} from '../../../services/backupRestoreClient';
import { relativeTime } from '../../../services/time/relativeTime.js';
import { useTranslation } from '../../../services/i18n/i18n.jsx';

import './BackupPage.less';

/**
 * Download the whole database, or replace it from a previous download.
 *
 * Restoring is deliberately a two-step: the uploaded archive is analysed first and what it would
 * do is spelled out before anything is overwritten. An archive from a newer Fredy needs an
 * explicit override, because migrating a schema backwards is not something this can do.
 *
 * This used to sit among the personal settings, where every user could see it and the server was
 * left to refuse them. A backup covers the whole database - every user's jobs and listings - so it
 * is an operator action, and it now lives where the rest of them are.
 *
 * The two halves are two cards, because they are not two equal options. Downloading is the routine
 * one; restoring replaces everything currently stored, and it used to stand as an equally weighted
 * second button beside it with the question only arriving after the file had been picked.
 *
 * @returns {React.ReactElement}
 */
export default function BackupPage() {
  const t = useTranslation();
  const fileInputRef = React.useRef(null);
  const [restoreModalVisible, setRestoreModalVisible] = React.useState(false);
  const [precheckInfo, setPrecheckInfo] = React.useState(null);
  const [restoreBusy, setRestoreBusy] = React.useState(false);
  const [selectedRestoreFile, setSelectedRestoreFile] = React.useState(null);

  /** Wann zuletzt ein Backup geladen wurde, aus Sicht dieses Browsers. */
  const [lastBackupAt, setLastBackupAt] = React.useState(() => {
    // Eine Tatsache ueber diesen Browser, nicht ueber die Instanz: ein anderer Administrator kann
    // gestern eines gezogen haben, ohne dass es hier steht. Deshalb localStorage und nicht die
    // Datenbank, und deshalb sagt der Text "zuletzt von hier geladen".
    try {
      const raw = window.localStorage.getItem('fredy.lastBackupAt');
      return raw == null ? null : Number(raw);
    } catch {
      return null;
    }
  });

  const handleDownloadBackup = React.useCallback(async () => {
    try {
      await downloadBackupZip();
      const now = Date.now();
      setLastBackupAt(now);
      try {
        window.localStorage.setItem('fredy.lastBackupAt', String(now));
      } catch {
        // Privater Modus oder gesperrter Speicher: die Zeile faellt weg, der Download nicht.
      }
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
        // Closed once it has done its job: left open, its button was live again and a second click
        // restored the same archive a second time.
        setRestoreModalVisible(false);
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
      <div className="settingsShell__page">
        <SegmentPart
          name={t('admin.backup.downloadSection')}
          helpText={t('admin.backup.downloadHelp')}
          helpMode="popover"
        >
          <div className="backupPage__row">
            <span className="backupPage__meta">
              {lastBackupAt == null
                ? t('admin.backup.never')
                : t('admin.backup.lastDownload', { time: relativeTime(lastBackupAt, t) })}
            </span>
            <Button theme="solid" type="primary" icon={<IconSave />} onClick={handleDownloadBackup}>
              {t('settings.backupDownload')}
            </Button>
          </div>
        </SegmentPart>

        {/* Eigene Karte, eigener Rahmen, eigenes Zeichen. Wiederherstellen ersetzt die gesamte
            Datenbank, und es stand als gleichwertiger zweiter Knopf neben dem Herunterladen, mit
            der Rueckfrage erst nach der Dateiauswahl. */}
        <SegmentPart
          className="backupPage__danger"
          name={
            <span className="backupPage__dangerTitle">
              <IconAlertTriangle size="small" />
              {t('admin.backup.restoreSection')}
            </span>
          }
          helpText={t('admin.backup.restoreHelp')}
        >
          <input
            type="file"
            accept=".zip,application/zip"
            ref={fileInputRef}
            className="backupPage__file"
            onChange={handleSelectRestoreFile}
          />
          <Button theme="outline" type="danger" icon={<IconFolder />} onClick={handleOpenFilePicker}>
            {t('settings.backupRestoreFromZip')}
          </Button>
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
              title={<div className="backupPage__bannerTitle">{t('settings.restoreProblemDetected')}</div>}
              description={<div>{precheckInfo?.message}</div>}
            />
          )}
          {precheckInfo?.severity === 'warning' && (
            <Banner
              type="warning"
              fullMode={false}
              closeIcon={null}
              title={<div className="backupPage__bannerTitle">{t('settings.restoreMigrationsApplied')}</div>}
              description={<div>{precheckInfo?.message}</div>}
            />
          )}
          {precheckInfo?.severity === 'info' && (
            <Banner
              type="success"
              fullMode={false}
              closeIcon={null}
              title={<div className="backupPage__bannerTitle">{t('settings.restoreCompatible')}</div>}
              description={<div>{precheckInfo?.message}</div>}
            />
          )}
          <div className="backupPage__migrationInfo">
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

BackupPage.displayName = 'BackupPage';
