/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useState } from 'react';
import { Banner, Button, Modal, Tag, Space, Typography, Descriptions, MarkdownRender } from '@douyinfe/semi-ui-19';
import { IconAlertCircle, IconArrowRight } from '@douyinfe/semi-icons';
import { useSelector } from '../../services/state/store.js';

import './VersionBanner.less';

const { Text } = Typography;

export default function VersionBanner() {
  const [modalVisible, setModalVisible] = useState(false);
  const versionUpdate = useSelector((state) => state.versionUpdate.versionUpdate);

  return (
    <>
      <Banner
        className="versionBanner"
        type="warning"
        bordered
        closeIcon={null}
        description={
          <div className="versionBanner__bar">
            <Space spacing={8} align="center">
              <IconAlertCircle size="small" />
              <Text strong size="small">
                New version available
              </Text>
              <Tag color="amber" size="small" shape="circle">
                {versionUpdate.version}
              </Tag>
              <Text type="tertiary" size="small">
                Current: {versionUpdate.localFredyVersion}
              </Text>
            </Space>
            <Button
              theme="borderless"
              size="small"
              icon={<IconArrowRight />}
              iconPosition="right"
              onClick={() => setModalVisible(true)}
            >
              Release notes
            </Button>
          </div>
        }
      />
      <Modal
        title={
          <Space spacing={8} align="center">
            <Text strong>Fredy {versionUpdate.version}</Text>
            <Tag color="amber" size="small">
              New
            </Tag>
          </Space>
        }
        visible={modalVisible}
        onCancel={() => setModalVisible(false)}
        width={640}
        footer={
          <Space>
            <Button onClick={() => setModalVisible(false)}>Close</Button>
            <Button
              type="primary"
              icon={<IconArrowRight />}
              iconPosition="right"
              onClick={() => window.open(versionUpdate.url, '_blank')}
            >
              View on GitHub
            </Button>
          </Space>
        }
      >
        <Descriptions row size="small" className="versionBanner__details">
          <Descriptions.Item itemKey="Your Version">{versionUpdate.localFredyVersion}</Descriptions.Item>
          <Descriptions.Item itemKey="Latest Version">{versionUpdate.version}</Descriptions.Item>
        </Descriptions>
        <div className="versionBanner__notes">
          <MarkdownRender raw={versionUpdate.body} />
        </div>
      </Modal>
    </>
  );
}
