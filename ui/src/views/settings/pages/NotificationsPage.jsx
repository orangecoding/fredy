/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useState } from 'react';
import { Banner, Button, Modal, Select, Toast } from '@douyinfe/semi-ui-19';
import { IconPlusCircle } from '@douyinfe/semi-icons';

import NotificationChannelTable from '../../../components/table/NotificationChannelTable';
import NotificationChannelEditor from '../../jobs/mutation/components/notificationAdapter/NotificationChannelEditor';
import { useActions, useSelector } from '../../../services/state/store';
import { errorMessage } from '../../../services/xhr';
import { useTranslation } from '../../../services/i18n/i18n.jsx';

import './NotificationsPage.less';

/**
 * Where notification channels are managed.
 *
 * Deliberately not admin-only. A normal user has to be able to set up their own Telegram, which
 * used to happen inside the job form; making this admin-only would take that away. Admins
 * additionally see every channel on the instance and the control that decides who may use one.
 *
 * @returns {React.ReactElement}
 */
export default function NotificationsPage() {
  const t = useTranslation();
  const actions = useActions();
  const channels = useSelector((state) => state.notificationChannels.channels);
  const adapters = useSelector((state) => state.notificationAdapter);
  const currentUser = useSelector((state) => state.user.currentUser);

  const [editor, setEditor] = useState(null);
  const [pickingType, setPickingType] = useState(false);

  useEffect(() => {
    actions.notificationChannels.getChannels();
    actions.notificationAdapter.getAdapter();
  }, [actions]);

  const test = async (channel) => {
    try {
      await actions.notificationChannels.tryChannel(channel.id);
      Toast.success(t('notification.trySuccess'));
    } catch (error) {
      Toast.error(t('notification.tryError', { error: errorMessage(error, t('common.unknownError')) }));
    }
  };

  const remove = async (channel) => {
    try {
      await actions.notificationChannels.removeChannel(channel.id);
      Toast.success(t('notification.channels.deleted'));
    } catch (error) {
      // The route answers a blocked delete with the jobs still using the channel, so the toast can
      // name them instead of saying "conflict" and leaving the user to guess.
      const jobs = error?.json?.jobs;
      Toast.error(
        jobs?.length
          ? t('notification.channels.deleteBlockedToast', { jobs: jobs.map((job) => job.name).join(', ') })
          : errorMessage(error, t('common.unknownError')),
      );
    }
  };

  const changeVisibility = async (channel, visibility) => {
    try {
      // Only the visibility travels: the save route keeps any key the body omits, so the stored
      // credentials are never round-tripped through the browser just to flip this one field.
      await actions.notificationChannels.saveChannel({ id: channel.id, name: channel.name, visibility });
    } catch (error) {
      Toast.error(errorMessage(error, t('common.unknownError')));
    }
  };

  const adapterOptions = adapters
    .filter(Boolean)
    .map((adapter) => ({ value: adapter.id, label: adapter.name }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div>
      {currentUser?.isAdmin && (
        <Banner
          fullMode={false}
          type="info"
          closeIcon={null}
          style={{ marginBottom: '1rem' }}
          description={t('notification.channels.scopeBanner')}
        />
      )}

      <Button
        type="primary"
        icon={<IconPlusCircle />}
        style={{ marginBottom: '1rem' }}
        onClick={() => setPickingType(true)}
      >
        {t('notification.channels.new')}
      </Button>

      <NotificationChannelTable
        channels={channels}
        actions={['test', 'edit', 'clone', 'delete']}
        onTest={test}
        onEdit={(channel) => setEditor({ mode: 'edit', channelId: channel.id })}
        onClone={(channel) => setEditor({ mode: 'clone', channelId: channel.id })}
        onDelete={remove}
        canManageVisibility={currentUser?.isAdmin === true}
        onVisibilityChange={changeVisibility}
      />

      {/* Choosing the type is its own step because it is the one decision that cannot be changed
          afterwards - the stored fields only make sense for one adapter. */}
      <Modal
        title={t('notification.channels.createTitle')}
        visible={pickingType}
        onCancel={() => setPickingType(false)}
        footer={null}
      >
        {/* The modal body is otherwise a single control, and Semi collapses it to the height of
            that control - which clipped the select against the modal's bottom edge. */}
        <div className="notificationsPage__typePicker">
          <p className="notificationsPage__typeIntro">{t('notification.channels.typeIntro')}</p>
          <Select
            filter
            style={{ width: '100%' }}
            placeholder={t('notification.selectPlaceholder')}
            optionList={adapterOptions}
            onChange={(adapterId) => {
              setPickingType(false);
              setEditor({ mode: 'create', adapterId });
            }}
          />
        </div>
      </Modal>

      {editor && (
        <NotificationChannelEditor
          visible
          mode={editor.mode}
          channelId={editor.channelId}
          adapterId={editor.adapterId}
          onClose={() => setEditor(null)}
          onSaved={() => setEditor(null)}
        />
      )}
    </div>
  );
}

NotificationsPage.displayName = 'NotificationsPage';
