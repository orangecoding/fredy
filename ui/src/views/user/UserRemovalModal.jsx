/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';
import { Modal } from '@douyinfe/semi-ui-19';
const UserRemovalModal = function UserRemovalModal({ onOk, onCancel }) {
  return (
    <Modal title="Removing user" visible={true} closable={false} onOk={onOk} onCancel={onCancel}>
      <p>Removing this user will also remove all associated jobs.</p>
    </Modal>
  );
};

export default UserRemovalModal;
