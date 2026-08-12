/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useMemo, useState } from 'react';
import { Banner, Button, Input, InputNumber, Popconfirm, Spin, Switch, Toast, Typography } from '@douyinfe/semi-ui-19';
import { IconDelete, IconSave } from '@douyinfe/semi-icons';

import { SegmentPart } from '../../../components/segment/SegmentPart.jsx';
import { useLocale, useTranslation } from '../../../services/i18n/i18n.jsx';
import { errorMessage } from '../../../services/xhr.js';
import { deleteMailAccount, getMailAccount, saveMailAccount, testMailAccount } from '../../../services/mailClient.js';

import './MailboxPage.less';

const DEFAULT_ACCOUNT = {
  host: '',
  port: 993,
  secure: true,
  username: '',
  password: '',
  mailbox: 'INBOX',
  enabled: true,
};

/**
 * Personal IMAP account configuration.
 *
 * Operational mail work stays in the inbox; credentials and connection
 * settings live here with the rest of the signed-in user's settings.
 *
 * @returns {React.ReactElement}
 */
export default function MailboxPage() {
  const t = useTranslation();
  const locale = useLocale();
  const [account, setAccount] = useState(DEFAULT_ACCOUNT);
  const [hasAccount, setHasAccount] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    getMailAccount()
      .then((storedAccount) => {
        if (!storedAccount) return;
        setHasAccount(true);
        setAccount({ ...DEFAULT_ACCOUNT, ...storedAccount, password: '' });
      })
      .catch((error) => Toast.error(errorMessage(error, t('mail.loadError'))))
      .finally(() => setLoading(false));
  }, [t]);

  const formatDate = useMemo(
    () => (value) =>
      value ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(value) : '',
    [locale],
  );

  const run = async (name, action, successKey) => {
    setBusy(name);
    try {
      const result = await action();
      Toast.success(t(successKey, result ?? {}));
      return result;
    } catch (error) {
      Toast.error(errorMessage(error, t('mail.actionError')));
      return null;
    } finally {
      setBusy(null);
    }
  };

  const updateAccount = (field, value) => setAccount((current) => ({ ...current, [field]: value }));

  const handleSave = async () => {
    const saved = await run(
      'save',
      () =>
        saveMailAccount({
          host: account.host,
          port: Number(account.port),
          secure: account.secure,
          username: account.username,
          mailbox: account.mailbox,
          enabled: account.enabled,
          ...(account.password ? { password: account.password } : {}),
        }),
      'mail.saved',
    );

    if (saved) {
      setHasAccount(true);
      setAccount((current) => ({ ...current, ...saved, password: '' }));
    }
  };

  const handleDelete = async () => {
    const removed = await run('delete', deleteMailAccount, 'mail.deleted');
    if (removed) {
      setHasAccount(false);
      setAccount(DEFAULT_ACCOUNT);
    }
  };

  if (loading) {
    return (
      <div className="mailboxSettings__loading">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="settingsShell__page mailboxSettings">
      <SegmentPart name={t('mail.accountTitle')} helpText={t('mail.accountHelp')}>
        <div className="mailboxSettings__formGrid">
          <label>
            <span>{t('mail.host')}</span>
            <Input
              value={account.host}
              onChange={(value) => updateAccount('host', value)}
              placeholder="imap.example.com"
            />
          </label>
          <label>
            <span>{t('mail.port')}</span>
            <InputNumber min={1} max={65535} value={account.port} onChange={(value) => updateAccount('port', value)} />
          </label>
          <label>
            <span>{t('mail.username')}</span>
            <Input
              value={account.username}
              onChange={(value) => updateAccount('username', value)}
              placeholder="name@example.com"
            />
          </label>
          <label>
            <span>{t('mail.password')}</span>
            <Input
              mode="password"
              value={account.password}
              onChange={(value) => updateAccount('password', value)}
              placeholder={hasAccount ? t('mail.passwordKeep') : t('mail.passwordPlaceholder')}
            />
          </label>
          <label>
            <span>{t('mail.mailbox')}</span>
            <Input value={account.mailbox} onChange={(value) => updateAccount('mailbox', value)} />
          </label>
          <div className="mailboxSettings__switches">
            <label>
              <Switch checked={account.secure} onChange={(value) => updateAccount('secure', value)} />{' '}
              {t('mail.secure')}
            </label>
            <label>
              <Switch checked={account.enabled} onChange={(value) => updateAccount('enabled', value)} />{' '}
              {t('mail.enabled')}
            </label>
          </div>
        </div>

        {account.lastSyncError && <Banner type="danger" closeIcon={null} description={account.lastSyncError} />}
        {account.lastSyncAt && (
          <Typography.Text type="tertiary">
            {t('mail.lastSync', { date: formatDate(account.lastSyncAt) })}
          </Typography.Text>
        )}

        <div className="mailboxSettings__actions">
          <Button theme="solid" type="primary" icon={<IconSave />} onClick={handleSave} loading={busy === 'save'}>
            {t('mail.save')}
          </Button>
          <Button
            onClick={() => run('test', testMailAccount, 'mail.connectionOk')}
            loading={busy === 'test'}
            disabled={!hasAccount}
          >
            {t('mail.testConnection')}
          </Button>
          {hasAccount && (
            <Popconfirm title={t('mail.deleteConfirm')} onConfirm={handleDelete}>
              <Button type="danger" theme="borderless" icon={<IconDelete />} loading={busy === 'delete'}>
                {t('mail.deleteAccount')}
              </Button>
            </Popconfirm>
          )}
        </div>
      </SegmentPart>
    </div>
  );
}

MailboxPage.displayName = 'MailboxPage';
