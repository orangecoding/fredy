import React from 'react';
import { Card } from '@douyinfe/semi-ui';

import './SegmentParts.less';

export const SegmentPart = ({ name, Icon = null, children, helpText }) => {
  const { Meta } = Card;

  return (
    <Card
      className="segmentParts"
      title={
        <Meta title={name} description={helpText} avatar={Icon == null ? null : <Icon size="extra-extra-small" />} />
      }
    >
      {children}
    </Card>
  );
};
