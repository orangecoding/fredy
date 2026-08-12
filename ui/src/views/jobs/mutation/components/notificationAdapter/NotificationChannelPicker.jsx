/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect } from 'react';
import { Modal } from '@douyinfe/semi-ui-19';
import { useNavigate } from 'react-router-dom';

import NotificationChannelTable from '../../../../../components/table/NotificationChannelTable';
import { useActions, useSelector } from '../../../../../services/state/store';
import { useScreenWidth } from '../../../../../hooks/screenWidth.js';
import { useTranslation } from '../../../../../services/i18n/i18n.jsx';

import './NotificationChannelPicker.less';

/**
 * Pick one of the channels that already exist and attach it to this job.
 *
 * Attaching only. Creating a channel belongs on the Settings page, so that "where do my channels
 * live" has one answer instead of two: a channel made from inside a job would still be global, and
 * a dialog that quietly creates global objects is a dialog people misread.
 *
 * The list is the same `NotificationChannelTable` the Settings page uses, so type and destination
 * read identically wherever a channel appears.
 *
 * @param {Object} props
 * @param {boolean} props.visible
 * @param {string[]} [props.selectedIds] - Channels already on this job, hidden from the list.
 * @param {() => void} props.onClose
 * @param {(channel: Object) => void} props.onPick
 * @returns {React.ReactElement|null}
 */
export default function NotificationChannelPicker({ visible, selectedIds = [], onClose, onPick } = {}) {
  const t = useTranslation();
  const actions = useActions();
  const navigate = useNavigate();
  const channels = useSelector((state) => state.notificationChannels.channels);
  const width = useScreenWidth();
  const isMobile = width <= 850;

  useEffect(() => {
    if (!visible) return;
    actions.notificationChannels.getChannels();
  }, [visible, actions]);

  if (!visible) return null;

  const available = channels.filter((channel) => !selectedIds.includes(channel.id));

  // Nothing to offer has two very different causes, and telling a user they have no channels when
  // they have three - all already on this job - sends them off to create a duplicate.
  const nothingExists = channels.length === 0;

  // Rendered instead of the table, not inside its empty slot. Semi lays the table's placeholder
  // out at the width of the (empty) table rather than the modal's, which broke one sentence into
  // nine stacked fragments a few pixels wide.
  const emptyState = (
    <p className="channelPicker__empty">
      {nothingExists ? t('notification.channels.pickerEmptyLead') : t('notification.channels.pickerAllAddedLead')}{' '}
      <a
        className="channelPicker__emptyLink"
        href="#/settings/notifications"
        onClick={(event) => {
          event.preventDefault();
          onClose();
          navigate('/settings/notifications');
        }}
      >
        {nothingExists ? t('notification.channels.pickerEmptyLink') : t('notification.channels.pickerAllAddedLink')}
      </a>
    </p>
  );

  return (
    <Modal
      title={t('notification.channels.pickerTitle')}
      visible
      style={{ width: isMobile ? '95%' : '46rem' }}
      onCancel={onClose}
      footer={null}
    >
      <div className="channelPicker">
        <p className="channelPicker__intro">{t('notification.channels.pickerIntro')}</p>

        {available.length === 0 ? (
          emptyState
        ) : (
          <NotificationChannelTable
            channels={available}
            actions={['add']}
            showVisibility={false}
            showUsage={false}
            onAdd={(channel) => {
              onPick(channel);
              onClose();
            }}
          />
        )}
      </div>
    </Modal>
  );
}
