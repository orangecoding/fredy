/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Card } from '@douyinfe/semi-ui-19';

import './SegmentParts.less';

export const SegmentPart = ({ name, Icon = null, children, helpText = null, className = '' }) => {
  const { Meta } = Card;

  return (
    <Card
      className={`segmentParts ${className}`}
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
