/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';
import './FredyFooter.less';
import { useSelector } from '../../services/state/store.js';
import { Typography, Layout, Space, Divider } from '@douyinfe/semi-ui-19';

export default function FredyFooter() {
  const { Text } = Typography;
  const { Footer } = Layout;
  const version = useSelector((state) => state.versionUpdate.versionUpdate);

  return (
    <Footer className="fredyFooter">
      <Space split={<Divider layout="vertical" />}>
        <Text type="tertiary" size="small">
          Fredy V{version?.localFredyVersion || 'N/A'}
        </Text>
        <Text size="small" link={{ href: 'https://github.com/orangecoding', target: '_blank' }}>
          Made with ❤️
        </Text>
      </Space>
    </Footer>
  );
}
