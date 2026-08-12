/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Empty, Select, Space, Spin, Tag, Toast, Typography } from '@douyinfe/semi-ui-19';
import { IconLink, IconMailStroked, IconRefresh, IconSetting, IconUnlink } from '@douyinfe/semi-icons';
import { useNavigate } from 'react-router-dom';

import Headline from '../../components/headline/Headline.jsx';
import { useLocale, useTranslation } from '../../services/i18n/i18n.jsx';
import { errorMessage } from '../../services/xhr.js';
import {
  assignMailMessage,
  getMailAccount,
  getMailMessages,
  matchMail,
  removeMailMessageMatch,
  searchMailListings,
  syncMail,
  updateMailListingStatus,
} from '../../services/mailClient.js';

import './MailInbox.less';
import { LISTING_STATUSES } from '../../services/listingStatus.js';

const STATUS_OPTIONS = LISTING_STATUSES;

/**
 * User-owned incoming mailbox, message list and listing assignment workspace.
 * Connection settings are managed separately under Settings > Mailbox.
 *
 * @returns {React.ReactElement}
 */
export default function MailInbox() {
  const t = useTranslation();
  const locale = useLocale();
  const navigate = useNavigate();
  const [hasAccount, setHasAccount] = useState(false);
  const [messages, setMessages] = useState([]);
  const [listings, setListings] = useState([]);
  const [selectedListings, setSelectedListings] = useState({});
  const [selectedStatuses, setSelectedStatuses] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const refreshMessages = useCallback(async () => {
    const next = await getMailMessages(500);
    setMessages(Array.isArray(next) ? next : []);
  }, []);

  const refreshListings = useCallback(async (query = '') => {
    const next = await searchMailListings(query, 100);
    setListings(Array.isArray(next) ? next : []);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [storedAccount] = await Promise.all([getMailAccount(), refreshMessages(), refreshListings()]);
      setHasAccount(Boolean(storedAccount));
    } catch (error) {
      Toast.error(errorMessage(error, t('mail.loadError')));
    } finally {
      setLoading(false);
    }
  }, [refreshListings, refreshMessages, t]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (name, action, successKey, refresh = false) => {
    setBusy(name);
    try {
      const result = await action();
      Toast.success(t(successKey, result ?? {}));
      if (refresh) await refreshMessages();
      return result;
    } catch (error) {
      Toast.error(errorMessage(error, t('mail.actionError')));
      return null;
    } finally {
      setBusy(null);
    }
  };

  const handleSync = async () => {
    const result = await run('sync', syncMail, 'mail.synced', true);
    if (result) await refreshListings();
  };

  const handleAssign = async (messageId) => {
    const listingId = selectedListings[messageId];
    if (!listingId) {
      Toast.warning(t('mail.selectListingFirst'));
      return;
    }
    const status = selectedStatuses[messageId] ?? 'applied';
    const result = await run(
      `assign:${messageId}`,
      () => assignMailMessage(messageId, listingId, status),
      'mail.assigned',
      true,
    );
    if (result) {
      setSelectedListings((current) => ({ ...current, [messageId]: undefined }));
    }
  };

  const handleStatusUpdate = async (messageId, listingId, status) => {
    await run(`status:${messageId}`, () => updateMailListingStatus(listingId, status), 'mail.statusUpdated', true);
  };

  const formatDate = useMemo(
    () => (value) =>
      value ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(value) : '',
    [locale],
  );

  if (loading) {
    return (
      <div className="mailInbox__loading">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="mailInbox">
      <Headline
        text={t('mail.title')}
        subtitle={t('mail.subtitle')}
        actions={
          <Space wrap>
            <Button icon={<IconSetting />} onClick={() => navigate('/settings/mailbox')}>
              {t('mail.settings')}
            </Button>
            <Button
              icon={<IconRefresh />}
              onClick={() => run('match', matchMail, 'mail.matched', true)}
              loading={busy === 'match'}
              disabled={!hasAccount}
            >
              {t('mail.matchNow')}
            </Button>
            <Button
              theme="solid"
              type="primary"
              icon={<IconMailStroked />}
              onClick={handleSync}
              loading={busy === 'sync'}
              disabled={!hasAccount}
            >
              {t('mail.sync')}
            </Button>
          </Space>
        }
      />

      <div className="mailInbox__summary">
        <Typography.Title heading={4}>{t('mail.messagesTitle')}</Typography.Title>
        <Typography.Text type="tertiary">{t('mail.messageCount', { count: messages.length })}</Typography.Text>
      </div>

      {messages.length === 0 ? (
        <Empty description={hasAccount ? t('mail.empty') : t('mail.configureFirst')} />
      ) : (
        <div className="mailInbox__messages">
          {messages.map((message) => (
            <Card key={message.id} className="mailInbox__messageCard" bodyStyle={{ padding: 16 }}>
              <div className="mailInbox__messageHeader">
                <div>
                  <Typography.Title heading={5}>{message.subject || t('mail.noSubject')}</Typography.Title>
                  <Typography.Text type="tertiary">
                    {[message.senderName, message.senderAddress].filter(Boolean).join(' · ') || t('mail.unknownSender')}
                    {message.receivedAt ? ` · ${formatDate(message.receivedAt)}` : ''}
                  </Typography.Text>
                </div>
                {message.match ? (
                  <Tag color="green">
                    {t(`mail.matchMethod.${message.match.method}`)} · {message.match.confidence}%
                  </Tag>
                ) : (
                  <Tag color="orange">{t('mail.unmatched')}</Tag>
                )}
              </div>

              {message.textBody && (
                <details className="mailInbox__body">
                  <summary>{t('mail.showMessage')}</summary>
                  <pre>{message.textBody}</pre>
                </details>
              )}

              {message.match ? (
                <div className="mailInbox__matchedListing">
                  <div>
                    <Typography.Text strong>{message.match.listing.title || t('mail.untitledListing')}</Typography.Text>
                    <div>
                      <Typography.Text type="tertiary">
                        {[message.match.listing.provider, message.match.listing.address].filter(Boolean).join(' · ')}
                      </Typography.Text>
                    </div>
                  </div>
                  <Space>
                    <Select
                      size="small"
                      value={message.match.listing.status?.status}
                      placeholder={t('mail.selectStatus')}
                      disabled={busy === `status:${message.id}`}
                      onChange={(status) => handleStatusUpdate(message.id, message.match.listingId, status)}
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <Select.Option key={status} value={status}>
                          {t(`mail.status.${status}`)}
                        </Select.Option>
                      ))}
                    </Select>
                    {message.match.listing.link && (
                      <Button
                        type="tertiary"
                        icon={<IconLink />}
                        onClick={() => window.open(message.match.listing.link, '_blank', 'noopener,noreferrer')}
                      >
                        {t('mail.openListing')}
                      </Button>
                    )}
                    <Button
                      type="danger"
                      theme="borderless"
                      icon={<IconUnlink />}
                      loading={busy === `remove:${message.id}`}
                      onClick={() =>
                        run(`remove:${message.id}`, () => removeMailMessageMatch(message.id), 'mail.matchRemoved', true)
                      }
                    >
                      {t('mail.removeMatch')}
                    </Button>
                  </Space>
                </div>
              ) : (
                <div className="mailInbox__assignment">
                  <Select
                    filter
                    remote
                    showClear
                    value={selectedListings[message.id]}
                    placeholder={t('mail.selectListing')}
                    onSearch={refreshListings}
                    onChange={(value) => setSelectedListings((current) => ({ ...current, [message.id]: value }))}
                  >
                    {listings.map((listing) => (
                      <Select.Option key={listing.id} value={listing.id}>
                        {[listing.title, listing.address, listing.provider].filter(Boolean).join(' · ')}
                      </Select.Option>
                    ))}
                  </Select>
                  <Select
                    value={selectedStatuses[message.id] ?? 'applied'}
                    onChange={(value) => setSelectedStatuses((current) => ({ ...current, [message.id]: value }))}
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <Select.Option key={status} value={status}>
                        {t(`mail.status.${status}`)}
                      </Select.Option>
                    ))}
                  </Select>
                  <Button
                    theme="solid"
                    type="primary"
                    icon={<IconLink />}
                    onClick={() => handleAssign(message.id)}
                    loading={busy === `assign:${message.id}`}
                  >
                    {t('mail.assign')}
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

MailInbox.displayName = 'MailInbox';
