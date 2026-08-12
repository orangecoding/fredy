/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useState } from 'react';
import { IconHorn } from '@douyinfe/semi-icons';
import { SegmentPart } from '../../../components/segment/SegmentPart.jsx';
import { Banner, Button, Checkbox, Space, Typography } from '@douyinfe/semi-ui-19';
import NotificationChannelPicker from '../../jobs/mutation/components/notificationAdapter/NotificationChannelPicker.jsx';
import { useTranslation } from '../../../services/i18n/i18n.jsx';

export default function WatchlistManagement() {
  const t = useTranslation();
  const [notificationChooserVisible, setNotificationChooserVisible] = useState(false);
  // Local only, exactly as before: this page is still a stub and nothing here is persisted yet.
  const [selectedChannels, setSelectedChannels] = useState([]);
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

        <NotificationChannelPicker
          visible={notificationChooserVisible}
          selectedIds={selectedChannels.map((channel) => channel.id)}
          onClose={() => setNotificationChooserVisible(false)}
          onPick={(channel) => setSelectedChannels((current) => [...current, channel])}
        />
      </SegmentPart>
    </div>
  );
}
