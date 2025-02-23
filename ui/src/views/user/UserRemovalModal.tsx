// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import React from 'react';
import { Modal } from '@douyinfe/semi-ui';
const UserRemovalModal = function UserRemovalModal({
  onOk,
  onCancel
}: any) {
  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <Modal title="Removing user" visible={true} closable={false} onOk={onOk} onCancel={onCancel}>
      // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
      <p>Removing this user will also remove all associated jobs.</p>
    </Modal>
  );
};

export default UserRemovalModal;
