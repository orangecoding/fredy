/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Modal } from '@douyinfe/semi-ui-19';

import { useTranslation } from '../../services/i18n/i18n.jsx';

/**
 * Confirm removing one user.
 *
 * Names them, and says how many jobs go with them. It used to say "this user" and "all associated
 * jobs" without a name or a number - for an action that deletes the account, every job it owns and
 * every listing those jobs collected, with no undo.
 *
 * The confirming button carries the error colour and the verb. Semi's default footer gives an "OK"
 * in the accent, which is the colour every Save in this application wears.
 *
 * @param {Object} props
 * @param {Object} [props.user] The row being removed, straight from the user list.
 * @param {() => void} props.onOk
 * @param {() => void} props.onCancel
 * @returns {React.ReactElement}
 */
export default function UserRemovalModal({ user = null, onOk, onCancel }) {
  const t = useTranslation();
  const jobCount = user?.numberOfJobs ?? 0;

  // The i18n helper has no plural machinery, so the singular is its own key rather than a
  // "{{count}} jobs" that reads "1 jobs". Same treatment as the channel table's usage column.
  const message =
    jobCount === 0
      ? t('users.removalModal.messageNoJobs', { name: user?.username ?? '' })
      : jobCount === 1
        ? t('users.removalModal.messageOneJob', { name: user?.username ?? '' })
        : t('users.removalModal.messageJobs', { name: user?.username ?? '', count: jobCount });

  return (
    <Modal
      title={t('users.removalModal.title')}
      visible
      closable={false}
      onOk={onOk}
      onCancel={onCancel}
      okText={t('users.removeUser')}
      okButtonProps={{ type: 'danger', theme: 'solid' }}
      cancelButtonProps={{ theme: 'borderless', type: 'tertiary' }}
    >
      <p>{message}</p>
    </Modal>
  );
}

UserRemovalModal.displayName = 'UserRemovalModal';
