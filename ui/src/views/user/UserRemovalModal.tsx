import React from 'react';
import { Modal } from '@douyinfe/semi-ui';
import { User } from '#types/User.ts';

interface UserRemovalModalProps {
  user: User | null; // Allow null in case user is not yet loaded or modal is for a generic action
  onOk: () => void;
  onCancel: () => void;
}

const UserRemovalModal = function UserRemovalModal({ user, onOk, onCancel }: UserRemovalModalProps) {
  return (
    <Modal
      title={`Removing user ${user?.username || ''}`}
      visible={true}
      closable={false}
      onOk={onOk}
      onCancel={onCancel}
    >
      <p>
        Removing user {user?.username ? <strong>{user.username}</strong> : 'this user'} will also remove all associated
        jobs.
      </p>
      <p>Are you sure?</p>
    </Modal>
  );
};

export default UserRemovalModal;
