/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Button, Modal, Tag, Space, Typography, Descriptions } from '@douyinfe/semi-ui-19';
import { IconArrowRight } from '@douyinfe/semi-icons';
import { useSelector } from '../../services/state/store.js';

import './VersionModal.less';
import { useTranslation } from '../../services/i18n/i18n.jsx';

const { Text } = Typography;

/**
 * The release notes for the version that is available, as a dialog.
 *
 * It used to own both the dialog and the banner that opened it, and that banner sat at the top of
 * every page until somebody upgraded. The footer carries the version number anyway, which makes it
 * the one place a user is already looking when they want to know whether theirs is current.
 *
 * @param {Object} props
 * @param {boolean} props.visible
 * @param {() => void} props.onClose
 * @returns {React.ReactElement}
 */
export default function VersionModal({ visible, onClose }) {
  const t = useTranslation();
  const versionUpdate = useSelector((state) => state.versionUpdate.versionUpdate);

  return (
    <Modal
      title={
        <Space spacing={8} align="center">
          <Text strong>Fredy {versionUpdate.version}</Text>
          <Tag color="amber" size="small">
            {t('version.newBadge')}
          </Tag>
        </Space>
      }
      visible={visible}
      onCancel={onClose}
      width={640}
      footer={
        <Space>
          <Button onClick={onClose}>{t('version.modalClose')}</Button>
          <Button
            type="primary"
            icon={<IconArrowRight />}
            iconPosition="right"
            onClick={() => window.open(versionUpdate.url, '_blank')}
          >
            {t('version.viewOnGithub')}
          </Button>
        </Space>
      }
    >
      <Descriptions row size="small" className="versionModal__details">
        <Descriptions.Item itemKey={t('version.yourVersion')}>{versionUpdate.localFredyVersion}</Descriptions.Item>
        <Descriptions.Item itemKey={t('version.latestVersion')}>{versionUpdate.version}</Descriptions.Item>
      </Descriptions>
      <div className="versionModal__notes" dangerouslySetInnerHTML={{ __html: versionUpdate.bodyHtml || '' }} />
    </Modal>
  );
}
