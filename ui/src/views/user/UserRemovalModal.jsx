/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Modal } from '@douyinfe/semi-ui-19';
import { useTranslation } from '../../services/i18n/i18n.jsx';

const UserRemovalModal = function UserRemovalModal({ onOk, onCancel }) {
  const t = useTranslation();
  return (
    <Modal title={t('users.removalModal.title')} visible={true} closable={false} onOk={onOk} onCancel={onCancel}>
      <p>{t('users.removalModal.message')}</p>
    </Modal>
  );
};

export default UserRemovalModal;
