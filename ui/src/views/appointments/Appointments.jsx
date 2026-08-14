/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Empty, Input, Space, Spin, Tag, Toast, Typography } from '@douyinfe/semi-ui-19';
import { IconCalendarClock, IconExternalOpen, IconRefresh } from '@douyinfe/semi-icons';
import { useNavigate } from 'react-router-dom';

import Headline from '../../components/headline/Headline.jsx';
import { useLocale, useTranslation } from '../../services/i18n/i18n.jsx';
import { errorMessage } from '../../services/xhr.js';
import { getAppointments, saveAppointment, setAppointmentState } from '../../services/appointmentClient.js';

import './Appointments.less';

function toLocalInput(timestamp) {
  const date = new Date(timestamp);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export default function Appointments() {
  const t = useTranslation();
  const locale = useLocale();
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [view, setView] = useState('upcoming');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await getAppointments(true);
      setAppointments(Array.isArray(rows) ? rows : []);
      setDrafts(Object.fromEntries((rows ?? []).map((item) => [item.id, toLocalInput(item.startsAt)])));
    } catch (error) {
      Toast.error(errorMessage(error, t('appointments.loadError')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const formatDate = useMemo(
    () => (value) => new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short' }).format(value),
    [locale],
  );
  const isUpcoming = (item) => item.state === 'scheduled' && item.startsAt >= Date.now();
  const isOverdue = (item) => item.state === 'scheduled' && item.startsAt < Date.now();
  const visible = appointments.filter((item) => {
    if (view === 'all') return true;
    if (view === 'completed') return item.state === 'completed';
    if (view === 'overdue') return isOverdue(item);
    return isUpcoming(item);
  });

  const save = async (item) => {
    setBusy(`save:${item.id}`);
    try {
      await saveAppointment({
        listingId: item.listingId,
        startsAt: new Date(drafts[item.id]).getTime(),
        timezone: item.timezone || 'Europe/Berlin',
        location: item.location || item.address || null,
      });
      Toast.success(t('appointments.saved'));
      await load();
    } catch (error) {
      Toast.error(errorMessage(error, t('appointments.saveError')));
    } finally {
      setBusy(null);
    }
  };

  const changeState = async (item, state) => {
    setBusy(`${state}:${item.id}`);
    try {
      await setAppointmentState(item.id, state);
      Toast.success(t('appointments.updated'));
      await load();
    } catch (error) {
      Toast.error(errorMessage(error, t('appointments.saveError')));
    } finally {
      setBusy(null);
    }
  };

  if (loading)
    return (
      <div className="appointments__loading">
        <Spin size="large" />
      </div>
    );

  return (
    <div className="appointments">
      <Headline
        text={t('appointments.title')}
        subtitle={t('appointments.subtitle')}
        actions={
          <Button icon={<IconRefresh />} onClick={load}>
            {t('appointments.refresh')}
          </Button>
        }
      />
      <Space wrap className="appointments__filters">
        {['upcoming', 'overdue', 'completed', 'all'].map((key) => (
          <Button key={key} theme={view === key ? 'solid' : 'light'} onClick={() => setView(key)}>
            {t(`appointments.${key}`)}
          </Button>
        ))}
      </Space>
      {visible.length === 0 ? (
        <Empty description={t('appointments.empty')} />
      ) : (
        <div className="appointments__list">
          {visible.map((item) => (
            <Card key={item.id} className="appointments__card">
              <div className="appointments__header">
                <div>
                  <Tag color={isOverdue(item) ? 'red' : item.state === 'completed' ? 'green' : 'blue'}>
                    <IconCalendarClock /> {formatDate(item.startsAt)}
                  </Tag>
                  <Typography.Title heading={4}>{item.title}</Typography.Title>
                  <Typography.Text type="tertiary">
                    {[item.provider, item.address].filter(Boolean).join(' · ')}
                  </Typography.Text>
                </div>
                <Space wrap>
                  <Button onClick={() => navigate(`/listings/listing/${item.listingId}`)}>
                    {t('appointments.openInFredy')}
                  </Button>
                  {item.link && (
                    <Button icon={<IconExternalOpen />} onClick={() => window.open(item.link, '_blank', 'noopener')}>
                      {t('appointments.openOriginal')}
                    </Button>
                  )}
                </Space>
              </div>
              <div className="appointments__actions">
                <Input
                  type="datetime-local"
                  value={drafts[item.id] ?? ''}
                  onChange={(value) => setDrafts((current) => ({ ...current, [item.id]: value }))}
                />
                <Button theme="solid" type="primary" loading={busy === `save:${item.id}`} onClick={() => save(item)}>
                  {t('appointments.save')}
                </Button>
                {item.state !== 'completed' && (
                  <Button loading={busy === `completed:${item.id}`} onClick={() => changeState(item, 'completed')}>
                    {t('appointments.markCompleted')}
                  </Button>
                )}
                {item.state !== 'cancelled' && (
                  <Button
                    type="danger"
                    loading={busy === `cancelled:${item.id}`}
                    onClick={() => changeState(item, 'cancelled')}
                  >
                    {t('appointments.cancelAppointment')}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
