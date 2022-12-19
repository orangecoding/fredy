import React from 'react';
import { Modal, Header, Icon, Button } from 'semantic-ui-react';

const UserRemovalModal = function UserRemovalModal({ onOk, onCancel }) {
  return (
    <Modal open={true}>
      <Header icon="warning sign" content="Warning" />
      <Modal.Content>
        <p>Removing this user will also remove all associated jobs.</p>
      </Modal.Content>
      <Modal.Actions>
        <Button color="red" onClick={() => onCancel()}>
          <Icon name="remove" /> Cancel
        </Button>
        <Button color="green" onClick={() => onOk()}>
          <Icon name="checkmark" /> Remove
        </Button>
      </Modal.Actions>
    </Modal>
  );
};

export default UserRemovalModal;
