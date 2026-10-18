/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useState, useEffect } from 'react';
import { Modal, Radio, RadioGroup, Checkbox } from '@douyinfe/semi-ui-19';
import { useTranslation } from '../services/i18n/i18n.jsx';

import './ListingDeletionModal.less';

const ListingDeletionModal = ({
  visible,
  onConfirm,
  onCancel,
  title,
  showOptions = true,
  // Whether to offer "remember my choice". The bulk delete turns it off: that preference is what
  // suppresses the per-row prompt, and a dialog that keeps asking no matter what the box says is
  // worse than not offering the box.
  showRemember = true,
  message,
  defaultDeleteType = 'soft',
}) => {
  const t = useTranslation();
  const resolvedTitle = title ?? t('listing.deletion.title');
  const resolvedMessage = message ?? t('listing.deletion.message');
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
      title={resolvedTitle}
      visible={visible}
      onOk={handleOk}
      onCancel={onCancel}
      okText={t('listing.deletion.confirm')}
      cancelText={t('listing.deletion.cancel')}
      className="listingDeletion"
    >
      <p className="listingDeletion__message">{resolvedMessage}</p>
      {showOptions && (
        <>
          <RadioGroup
            className="listingDeletion__options"
            value={deleteType}
            onChange={(e) => setDeleteType(e.target.value)}
          >
            <Radio value="soft" className="listingDeletion__option">
              <span className="listingDeletion__label">{t('listing.deletion.softLabel')}</span>
              <span className="listingDeletion__description">{t('listing.deletion.softDescription')}</span>
            </Radio>
            <Radio value="hard" className="listingDeletion__option">
              <span className="listingDeletion__label">{t('listing.deletion.hardLabel')}</span>
              <span className="listingDeletion__description">{t('listing.deletion.hardDescription')}</span>
              <span className="listingDeletion__consequence">{t('listing.deletion.hardConsequence')}</span>
            </Radio>
          </RadioGroup>
          {showRemember && (
            <Checkbox
              className="listingDeletion__remember"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            >
              {t('listing.deletion.rememberChoice')}
            </Checkbox>
          )}
        </>
      )}
    </Modal>
  );
};

export default ListingDeletionModal;
