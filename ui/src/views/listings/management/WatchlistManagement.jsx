/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React, { useState } from 'react';
import { IconHorn } from '@douyinfe/semi-icons';
import { SegmentPart } from '../../../components/segment/SegmentPart.jsx';
import { Banner, Button, Checkbox, Space } from '@douyinfe/semi-ui-19';
import NotificationAdapterMutator from '../../jobs/mutation/components/notificationAdapter/NotificationAdapterMutator.jsx';
import Headline from '../../../components/headline/Headline.jsx';

export default function WatchlistManagement() {
  const [notificationChooserVisible, setNotificationChooserVisible] = useState(false);
  const [notificationAdapterData, setNotificationAdapterData] = useState([]);
  //TODO: Set default
  const [activityChanges, setActivityChanges] = useState(false);
  const [priceChanges, setPriceChanges] = useState(false);
  return (
    <div>
      <SegmentPart
        name="Notification for Watch List"
        helpText="You can get notified for changes on listings from your watch list."
        Icon={IconHorn}
      >
        <Banner
          fullMode={false}
          type="info"
          closeIcon={null}
          title={<div style={{ fontWeight: 600, fontSize: '14px', lineHeight: '20px' }}>Note</div>}
          description="You’ll receive notifications only for listings that are on your watch list. To add listings to it, open the 'Listings' section and tag the ones you want to follow."
        />
        <Space />
        <Headline size={5} text="Notify me when:" style={{ marginTop: '1rem' }} />

        <Checkbox checked={activityChanges} onChange={(e) => setActivityChanges(e.target.checked)}>
          Listing state changes (e.g. listing becomes inactive)
        </Checkbox>
        <Checkbox checked={priceChanges} onChange={(e) => setPriceChanges(e.target.checked)}>
          Listing price changes
        </Checkbox>

        <Space />
        <Headline size={5} text="Notify me with:" style={{ marginTop: '1rem' }} />
        <Button onClick={() => setNotificationChooserVisible(true)}>Select notification method</Button>

        <NotificationAdapterMutator
          title="Add notification method"
          description="When something has changed, Fredy will notify you using the selected notification adapter. Note, some adapter like SqLite are not available here."
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
