// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import React from 'react';
import { Card } from '@douyinfe/semi-ui';

import './SegmentParts.less';

export const SegmentPart = ({
  name,
  Icon = null,
  children,
  helpText
}: any) => {
  const { Meta } = Card;

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <Card
      title={
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <Meta title={name} description={helpText} avatar={Icon == null ? null : <Icon size="extra-extra-small" />} />
      }
    >
      {children}
    </Card>
  );
};
