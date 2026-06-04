/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Modal } from '@douyinfe/semi-ui-19';
import Logo from '../logo/Logo.jsx';
import { xhrPost } from '../../services/xhr.js';

import './TrackingModal.less';
import inDevelopment from '../../services/developmentMode.js';
import { useTranslation } from '../../services/i18n/i18n.jsx';

const saveResponse = async (analyticsEnabled) => {
  await xhrPost('/api/admin/generalSettings', {
    analyticsEnabled,
  });
};

export default function TrackingModal() {
  const t = useTranslation();

  if (inDevelopment()) {
    return null;
  }

  return (
    <Modal
      visible={true}
      onOk={async () => {
        await saveResponse(true);
        location.reload();
      }}
      onCancel={async () => {
        await saveResponse(false);
        location.reload();
      }}
      maskClosable={false}
      closable={false}
      okText={t('tracking.okText')}
      cancelText={t('tracking.cancelText')}
    >
      <Logo white />
      <div className="trackingModal__description">
        <p>{t('tracking.greeting')}</p>
        <p>{t('tracking.paragraph1')}</p>
        <p>{t('tracking.paragraph2')}</p>
        <p>{t('tracking.paragraph3')}</p>
        <p>{t('tracking.paragraph4')}</p>
        <p>{t('tracking.thanks')}</p>
      </div>
    </Modal>
  );
}
