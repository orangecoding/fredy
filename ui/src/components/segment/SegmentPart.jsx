/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';
import { Card } from '@douyinfe/semi-ui';

import './SegmentParts.less';

export const SegmentPart = ({ name, Icon = null, children, helpText = null }) => {
  const { Meta } = Card;

  return (
    <Card
      className="segmentParts"
      title={
        (helpText || name) && (
          <Meta title={name} description={helpText} avatar={Icon == null ? null : <Icon size="extra-extra-small" />} />
        )
      }
    >
      {children}
    </Card>
  );
};
