import React, { ReactNode } from 'react';
import { Card } from '@douyinfe/semi-ui';

interface SegmentPartProps {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Icon?: React.ComponentType<any> | null;
  children: ReactNode;
  helpText?: string;
}

import './SegmentParts.less';

export const SegmentPart = ({ name, Icon = null, children, helpText }: SegmentPartProps) => {
  const { Meta } = Card;

  return (
    <Card
      title={
        <Meta title={name} description={helpText} avatar={Icon == null ? null : <Icon size="extra-extra-small" />} />
      }
    >
      {children}
    </Card>
  );
};

export default SegmentPart;
