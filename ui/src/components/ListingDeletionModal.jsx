/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useState, useEffect } from 'react';
import { Modal, Radio, RadioGroup, Typography, Checkbox } from '@douyinfe/semi-ui-19';

const { Text } = Typography;

const ListingDeletionModal = ({
  visible,
  onConfirm,
  onCancel,
  title = 'Delete Listings',
  showOptions = true,
  message = 'How would you like to delete the selected listing(s)?',
  defaultDeleteType = 'soft',
}) => {
  const [deleteType, setDeleteType] = useState('soft');
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    if (visible) {
      setDeleteType(defaultDeleteType);
      setRemember(false);
    }
  }, [visible, defaultDeleteType]);

  const handleOk = () => {
    if (showOptions) {
      onConfirm(deleteType === 'hard', remember);
    } else {
      onConfirm(true);
    }
  };

  return (
    <Modal
      title={title}
      visible={visible}
      onOk={handleOk}
      onCancel={onCancel}
      okText="Confirm"
      cancelText="Cancel"
      style={{ maxWidth: '500px' }}
    >
      <div style={{ marginBottom: 16 }}>
        <Text>{message}</Text>
      </div>
      {showOptions && (
        <>
          <RadioGroup value={deleteType} onChange={(e) => setDeleteType(e.target.value)} style={{ width: '100%' }}>
            <Radio value="soft" style={{ alignItems: 'flex-start', width: '100%' }}>
              <div style={{ marginLeft: 8 }}>
                <Text strong>Mark as deleted (Soft Delete)</Text>
                <br />
                <Text type="secondary">
                  Listings are kept in the database but marked as hidden. They will <b>not</b> re-appear during the next
                  scraping session.
                </Text>
              </div>
            </Radio>
            <Radio value="hard" style={{ marginTop: 16, alignItems: 'flex-start', width: '100%' }}>
              <div style={{ marginLeft: 8 }}>
                <Text strong>Remove from database (Hard Delete)</Text>
                <br />
                <Text type="secondary">
                  Listings are completely removed from the database.
                  <br />
                  <Text type="warning">
                    Consequence: They might re-appear when scraping the next time because Fredy won't know they were
                    previously found.
                  </Text>
                </Text>
              </div>
            </Radio>
          </RadioGroup>
          <Checkbox checked={remember} onChange={(e) => setRemember(e.target.checked)} style={{ marginTop: 16 }}>
            Remember my choice and skip this dialog next time
          </Checkbox>
        </>
      )}
    </Modal>
  );
};

export default ListingDeletionModal;
