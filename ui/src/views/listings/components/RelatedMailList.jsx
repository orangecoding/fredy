/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useMemo, useState } from 'react';
import { Banner, Empty, Spin, Tag, Typography } from '@douyinfe/semi-ui-19';
import { IconMailStroked } from '@douyinfe/semi-icons';

import { useLocale, useTranslation } from '../../../services/i18n/i18n.jsx';
import { getListingMailMessages } from '../../../services/mailClient.js';

import './RelatedMailList.less';

const { Text, Title } = Typography;

/**
 * Show the mailbox history already associated with a listing. Message bodies
 * stay collapsed until requested so a long email thread does not dominate the
 * property details page.
 *
 * @param {{listingId:string}} props
 * @returns {React.ReactElement}
 */
export default function RelatedMailList({ listingId }) {
  const t = useTranslation();
  const locale = useLocale();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    getListingMailMessages(listingId)
      .then((result) => {
        if (!cancelled) setMessages(Array.isArray(result) ? result : []);
      })
      .catch(() => {
        if (!cancelled) {
          setMessages([]);
          setFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  const formatDate = useMemo(
    () => (value) =>
      value ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(value) : '',
    [locale],
  );

  return (
    <section className="relatedMail" aria-labelledby="related-mail-title">
      <div className="relatedMail__title">
        <IconMailStroked />
        <Title heading={4} id="related-mail-title">
          {t('listing.detail.relatedMailsTitle')}
        </Title>
        {!loading && <Tag>{messages.length}</Tag>}
      </div>

      {loading ? (
        <div className="relatedMail__loading">
          <Spin />
        </div>
      ) : failed ? (
        <Banner type="danger" closeIcon={null} description={t('listing.detail.relatedMailsLoadError')} />
      ) : messages.length === 0 ? (
        <Empty description={t('listing.detail.relatedMailsEmpty')} />
      ) : (
        <div className="relatedMail__list">
          {messages.map((message) => (
            <article className="relatedMail__item" key={message.id}>
              <div className="relatedMail__header">
                <div className="relatedMail__identity">
                  <Text strong>{message.subject || t('mail.noSubject')}</Text>
                  <Text type="tertiary" size="small">
                    {[message.senderName, message.senderAddress].filter(Boolean).join(' · ') || t('mail.unknownSender')}
                    {(message.receivedAt || message.createdAt) &&
                      ` · ${formatDate(message.receivedAt || message.createdAt)}`}
                  </Text>
                </div>
                <Tag color="green">
                  {t(`mail.matchMethod.${message.match.method}`)} · {message.match.confidence}%
                </Tag>
              </div>
              {message.textBody && (
                <details className="relatedMail__body">
                  <summary>{t('mail.showMessage')}</summary>
                  <pre>{message.textBody}</pre>
                </details>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

RelatedMailList.displayName = 'RelatedMailList';
