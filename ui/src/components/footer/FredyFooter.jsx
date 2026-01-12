/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';
import './FredyFooter.less';
import { useSelector } from '../../services/state/store.js';
import { Typography } from '@douyinfe/semi-ui';

export default function FredyFooter() {
  const { Text } = Typography;
  const version = useSelector((state) => state.versionUpdate.versionUpdate);
  return (
    <div className="fredyFooter">
      <div className="fredyFooter__version">
        <Text type="tertiary">Fredy V{version?.localFredyVersion || 'N/A'}</Text>
      </div>
      <div className="fredyFooter__copyRight">
        <Text link={{ href: 'https://github.com/orangecoding', target: '_blank' }}>Made with ❤️</Text>
      </div>
    </div>
  );
}
