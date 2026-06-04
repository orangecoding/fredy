/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useState } from 'react';
import { IconHorn } from '@douyinfe/semi-icons';
import { SegmentPart } from '../../../components/segment/SegmentPart.jsx';
import { Banner, Button, Checkbox, Space, Typography } from '@douyinfe/semi-ui-19';
import NotificationAdapterMutator from '../../jobs/mutation/components/notificationAdapter/NotificationAdapterMutator.jsx';
import { useTranslation } from '../../../services/i18n/i18n.jsx';

export default function WatchlistManagement() {
  const t = useTranslation();
  const [notificationChooserVisible, setNotificationChooserVisible] = useState(false);
  const [notificationAdapterData, setNotificationAdapterData] = useState([]);
  //TODO: Set default
  const [activityChanges, setActivityChanges] = useState(false);
  const [priceChanges, setPriceChanges] = useState(false);
  return (
    <div>
      <SegmentPart name={t('watchlist.sectionName')} helpText={t('watchlist.sectionHelp')} Icon={IconHorn}>
        <Banner
          fullMode={false}
          type="info"
          closeIcon={null}
          title={
            <div style={{ fontWeight: 600, fontSize: '14px', lineHeight: '20px' }}>{t('watchlist.noteTitle')}</div>
          }
          description={t('watchlist.noteDescription')}
        />
        <Space />
        <Typography.Title heading={5} style={{ marginTop: '1rem' }}>
          {t('watchlist.notifyMeWhen')}
        </Typography.Title>

        <Checkbox checked={activityChanges} onChange={(e) => setActivityChanges(e.target.checked)}>
          {t('watchlist.activityChanges')}
        </Checkbox>
        <Checkbox checked={priceChanges} onChange={(e) => setPriceChanges(e.target.checked)}>
          {t('watchlist.priceChanges')}
        </Checkbox>

        <Space />
        <Typography.Title heading={5} style={{ marginTop: '1rem' }}>
          {t('watchlist.notifyMeWith')}
        </Typography.Title>
        <Button onClick={() => setNotificationChooserVisible(true)}>{t('watchlist.selectNotificationMethod')}</Button>

        <NotificationAdapterMutator
          title={t('watchlist.addNotificationTitle')}
          description={t('watchlist.addNotificationDescription')}
          visible={notificationChooserVisible}
          onVisibilityChanged={(visible) => {
            setNotificationChooserVisible(visible);
          }}
          selected={notificationAdapterData}
          editNotificationAdapter={null}
          onData={(data) => {
            const oldData = [...notificationAdapterData].filter((o) => o.id !== data.id);
            setNotificationAdapterData([...oldData, data]);
          }}
        />
      </SegmentPart>
    </div>
  );
}
